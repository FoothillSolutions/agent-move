import chokidar from 'chokidar';
import Database from 'better-sqlite3';
import type { AgentStateManager } from '../../state/agent-state-manager.js';
import { createFallbackSession } from '../types.js';
import type { SessionInfo } from '../types.js';
import { config } from '../../config.js';
import {
  getOpenCodeDbPath,
  parseOpenCodeSession,
  type OpenCodeSessionRow,
} from './opencode-paths.js';
import { OpenCodeParser, type OpenCodeMessageData } from './opencode-parser.js';
import type { AgentWatcher } from '../agent-watcher.js';

interface MessageRow {
  id: string;
  session_id: string;
  time_updated: number;
  data: string;
}

interface PartRow {
  id: string;
  message_id: string;
  session_id: string;
  time_created: number;
  time_updated: number;
  data: string;
}

/**
 * Watches OpenCode's SQLite database for new activity and forwards it to AgentStateManager.
 *
 * Strategy:
 *   1. Open the DB in readonly mode (WAL allows concurrent readers).
 *   2. On startup, replay messages/parts from recently-active sessions.
 *   3. Watch the WAL file (opencode.db-wal) with chokidar — it changes on every write.
 *   4. On each notification, query rows with time_updated > lastSeenTs.
 */
export class OpenCodeWatcher implements AgentWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private db: Database.Database | null = null;
  private parser = new OpenCodeParser();

  /** Timestamp watermark for incremental polling (ms) */
  private lastMessageTs = 0;
  /** Tracks time_created (not time_updated) so each part is processed exactly once */
  private lastPartCreatedTs = 0;

  /** sessionId → SessionInfo cache */
  private sessions = new Map<string, SessionInfo>();
  /** messageId → parsed message data cache */
  private messages = new Map<string, OpenCodeMessageData>();
  /** callID → true — deduplicates tool_use per tool invocation */
  private seenCallIds = new Set<string>();
  /** row id → true — deduplicates text/token events */
  private seenIds = new Set<string>();
  /**
   * Per-session idle timers: after step-finish, if no new step-start
   * arrives within this window, call hookStop to idle the agent.
   */
  private stepFinishTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly STEP_FINISH_IDLE_MS = 4000;
  /**
   * Per-session shutdown timers: after step-finish, if no new activity
   * arrives within this longer window, call hookSessionEnd to fully shut
   * down the agent and finalize the session. This handles /exit and closed terminals.
   */
  private sessionEndTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly SESSION_END_MS = 180_000;

  // Prepared statements (initialised after DB opens)
  private stmtAllSessions!: Database.Statement;
  private stmtRecentSessions!: Database.Statement;
  private stmtMessagesBySession!: Database.Statement;
  private stmtPartsBySession!: Database.Statement;
  private stmtNewMessages!: Database.Statement;
  private stmtNewParts!: Database.Statement;

  constructor(private stateManager: AgentStateManager) {}

  async start(): Promise<void> {
    const activeThresholdMs = config.activeThresholdMs;
    const dbPath = getOpenCodeDbPath();
    if (!dbPath) {
      console.log('[opencode] No database found — OpenCode not installed or not yet used');
      return;
    }

    console.log(`[opencode] Database found at ${dbPath}`);

    try {
      this.db = new Database(dbPath, { readonly: true, fileMustExist: true });
      this.prepareStatements();
    } catch (err) {
      console.error('[opencode] Failed to open database:', err);
      return;
    }

    // Load all sessions into cache upfront
    this.loadAllSessions();

    // Replay recently-active sessions, tracking max timestamps seen
    this.replayRecentSessions(activeThresholdMs);

    // After replay: if no messages/parts were seen, baseline to now so the
    // first poll() doesn't re-scan the entire history.
    if (this.lastMessageTs === 0) this.lastMessageTs = Date.now() - 5000;
    if (this.lastPartCreatedTs === 0) this.lastPartCreatedTs = Date.now() - 5000;

    // Poll the WAL file — fs.watch is unreliable for SQLite WAL on Windows
    // (the kernel doesn't emit change events on WAL appends). Polling at 500ms
    // gives near-real-time detection without hammering the disk.
    const walPath = dbPath + '-wal';
    this.watcher = chokidar.watch(walPath, {
      persistent: true,
      ignoreInitial: true,
      usePolling: true,
      interval: 500,
      disableGlobbing: true,
    });

    this.watcher.on('change', () => this.poll());
    this.watcher.on('add', () => this.poll());

    console.log('[opencode] Watching for new activity');
  }

  stop() {
    this.watcher?.close();
    this.db?.close();
    this.sessions.clear();
    this.messages.clear();
    this.seenCallIds.clear();
    this.seenIds.clear();
    for (const t of this.stepFinishTimers.values()) clearTimeout(t);
    this.stepFinishTimers.clear();
    for (const t of this.sessionEndTimers.values()) clearTimeout(t);
    this.sessionEndTimers.clear();
  }

  // ── Prepared statements ────────────────────────────────────────────────────

  private prepareStatements() {
    const db = this.db!;
    this.stmtAllSessions = db.prepare(
      'SELECT id, directory, parent_id, title, project_id FROM session',
    );
    this.stmtRecentSessions = db.prepare(
      'SELECT id, directory, parent_id, title, project_id FROM session WHERE time_updated > ?',
    );
    this.stmtMessagesBySession = db.prepare(
      'SELECT id, session_id, time_updated, data FROM message WHERE session_id = ? ORDER BY time_created',
    );
    this.stmtPartsBySession = db.prepare(
      'SELECT id, message_id, session_id, time_created, time_updated, data FROM part WHERE session_id = ? ORDER BY time_created',
    );
    this.stmtNewMessages = db.prepare(
      'SELECT id, session_id, time_updated, data FROM message WHERE time_updated > ? ORDER BY time_updated',
    );
    this.stmtNewParts = db.prepare(
      'SELECT id, message_id, session_id, time_created, time_updated, data FROM part WHERE time_created > ? ORDER BY time_created',
    );
  }

  // ── Session cache ──────────────────────────────────────────────────────────

  private loadAllSessions() {
    const rows = this.stmtAllSessions.all() as OpenCodeSessionRow[];
    for (const row of rows) {
      this.sessions.set(row.id, parseOpenCodeSession(row));
    }
  }

  // ── Startup replay ─────────────────────────────────────────────────────────

  private replayRecentSessions(activeThresholdMs: number) {
    const cutoff = Date.now() - activeThresholdMs;
    const recent = this.stmtRecentSessions.all(cutoff) as OpenCodeSessionRow[];
    if (recent.length === 0) return;

    console.log(`[opencode] Replaying ${recent.length} recent session(s)`);
    for (const session of recent) {
      this.sessions.set(session.id, parseOpenCodeSession(session));
      this.replaySession(session.id);
    }
  }

  private replaySession(sessionId: string) {
    const messages = this.stmtMessagesBySession.all(sessionId) as MessageRow[];
    for (const msg of messages) {
      this.processMessageRow(msg);
      if (msg.time_updated > this.lastMessageTs) this.lastMessageTs = msg.time_updated;
    }

    const parts = this.stmtPartsBySession.all(sessionId) as PartRow[];
    for (const part of parts) {
      this.processPartRow(part);
      if (part.time_created > this.lastPartCreatedTs) this.lastPartCreatedTs = part.time_created;
    }
  }

  // ── Live polling ───────────────────────────────────────────────────────────

  private poll() {
    if (!this.db) return;
    try {
      // Refresh session cache for any sessions we don't know about yet
      const newSessions = this.stmtRecentSessions.all(
        Date.now() - 60_000, // last 60s — wide net to catch fresh sessions
      ) as OpenCodeSessionRow[];
      for (const row of newSessions) {
        if (!this.sessions.has(row.id)) {
          this.sessions.set(row.id, parseOpenCodeSession(row));
          console.log(`[opencode] New session: ${row.id.slice(0, 20)} (${row.directory})`);
        }
      }

      // New/updated messages since last poll
      const newMessages = this.stmtNewMessages.all(this.lastMessageTs) as MessageRow[];
      for (const msg of newMessages) {
        this.processMessageRow(msg);
        if (msg.time_updated > this.lastMessageTs) this.lastMessageTs = msg.time_updated;
      }

      // New parts since last poll (by time_created — each part processed exactly once)
      const newParts = this.stmtNewParts.all(this.lastPartCreatedTs) as PartRow[];
      for (const part of newParts) {
        this.processPartRow(part);
        if (part.time_created > this.lastPartCreatedTs) this.lastPartCreatedTs = part.time_created;
      }
    } catch (err) {
      console.error('[opencode] Poll error:', err);
    }
  }

  // ── Row processors ─────────────────────────────────────────────────────────

  private processMessageRow(row: MessageRow) {
    let data: OpenCodeMessageData;
    try {
      data = JSON.parse(row.data);
    } catch {
      return;
    }

    // Cache message so parts can find their parent context
    this.messages.set(row.id, data);

    // Emit token_usage once per assistant message row
    const seenKey = 'msg:' + row.id;
    if (this.seenIds.has(seenKey)) return;
    this.seenIds.add(seenKey);

    const activity = this.parser.parseTokenUsage(data);
    if (!activity) return;

    // Cancel any pending timers — real activity from this session
    const prefixedId = this.prefixed(row.session_id);
    this.cancelStepFinishTimer(prefixedId);
    this.cancelSessionEndTimer(prefixedId);

    const sessionInfo = this.getSessionInfo(row.session_id);
    this.stateManager.processMessage(prefixedId, activity, sessionInfo);
  }

  private processPartRow(row: PartRow) {
    let data: {
      type: string;
      callID?: string;
      state?: { status: string };
      text?: string;
      synthetic?: boolean;
    };
    try {
      data = JSON.parse(row.data);
    } catch {
      return;
    }

    const messageData = this.messages.get(row.message_id);

    // step-start / step-finish: heartbeat only — keep agent alive, no zone change
    if (data.type === 'step-start' || data.type === 'step-finish') {
      if (this.seenIds.has(row.id)) return;
      this.seenIds.add(row.id);
      const prefixedId = this.prefixed(row.session_id);
      if (data.type === 'step-start') {
        // Cancel any pending timers — agent is still active
        this.cancelStepFinishTimer(prefixedId);
        this.cancelSessionEndTimer(prefixedId);
        this.stateManager.heartbeat(prefixedId);
      } else {
        // step-finish: start idle timer (short) and session-end timer (long).
        // Short timer idles the agent between turns; long timer fully shuts
        // it down if the user has exited OpenCode.
        this.cancelStepFinishTimer(prefixedId);
        this.cancelSessionEndTimer(prefixedId);
        const idleTimer = setTimeout(() => {
          this.stepFinishTimers.delete(prefixedId);
          this.stateManager.hookStop(prefixedId);
        }, OpenCodeWatcher.STEP_FINISH_IDLE_MS);
        this.stepFinishTimers.set(prefixedId, idleTimer);
        const endTimer = setTimeout(() => {
          this.sessionEndTimers.delete(prefixedId);
          this.stateManager.hookSessionEnd(prefixedId);
        }, OpenCodeWatcher.SESSION_END_MS);
        this.sessionEndTimers.set(prefixedId, endTimer);
      }
      return;
    }

    // Tool parts: deduplicate by callID (one emission per tool invocation)
    if (data.type === 'tool' && data.callID) {
      if (this.seenCallIds.has(data.callID)) return;
      this.seenCallIds.add(data.callID);
    } else {
      // Text / reasoning / other parts: deduplicate by row id
      if (this.seenIds.has(row.id)) return;
      this.seenIds.add(row.id);
    }

    const activity = this.parser.parsePart(data as any, messageData);
    if (!activity) return;

    // Cancel any pending timers — real activity is arriving
    const prefixedId = this.prefixed(row.session_id);
    this.cancelStepFinishTimer(prefixedId);
    this.cancelSessionEndTimer(prefixedId);

    const sessionInfo = this.getSessionInfo(row.session_id);
    this.stateManager.processMessage(prefixedId, activity, sessionInfo);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private cancelStepFinishTimer(prefixedId: string): void {
    const timer = this.stepFinishTimers.get(prefixedId);
    if (timer) {
      clearTimeout(timer);
      this.stepFinishTimers.delete(prefixedId);
    }
  }

  private cancelSessionEndTimer(prefixedId: string): void {
    const timer = this.sessionEndTimers.get(prefixedId);
    if (timer) {
      clearTimeout(timer);
      this.sessionEndTimers.delete(prefixedId);
    }
  }

  private getSessionInfo(sessionId: string): SessionInfo {
    const cached = this.sessions.get(sessionId);
    if (cached) return cached;

    // Session not in cache yet — refresh and try again
    this.loadAllSessions();
    return this.sessions.get(sessionId) ?? this.fallbackSession();
  }

  private prefixed(id: string): string {
    return id.startsWith('oc:') ? id : `oc:${id}`;
  }

  private fallbackSession(): SessionInfo {
    return createFallbackSession('opencode', 'opencode');
  }
}
