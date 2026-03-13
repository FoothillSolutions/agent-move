import { mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import Database from 'better-sqlite3';
import type {
  RecordedSession,
  RecordedAgent,
  RecordedTimelineEvent,
  SessionSummary,
  LiveSessionSummary,
  ToolChainData,
} from '@agent-move/shared';

const DB_DIR = join(homedir(), '.agent-move');
const DB_PATH = join(DB_DIR, 'sessions.db');

const SCHEMA_VERSION = 2;

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(dbPath ?? DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.initSchema();
  }

  private initSchema(): void {
    // Version table
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`);
    const row = this.db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
    const currentVersion = row?.version ?? 0;

    // Always run full schema with IF NOT EXISTS — safe for fresh or upgraded DBs
    if (currentVersion < SCHEMA_VERSION) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          root_session_id TEXT NOT NULL,
          project_name TEXT NOT NULL,
          project_path TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          ended_at INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          total_cost REAL NOT NULL DEFAULT 0,
          total_input_tokens INTEGER NOT NULL DEFAULT 0,
          total_output_tokens INTEGER NOT NULL DEFAULT 0,
          total_cache_read_tokens INTEGER NOT NULL DEFAULT 0,
          total_cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
          total_tool_uses INTEGER NOT NULL DEFAULT 0,
          agent_count INTEGER NOT NULL DEFAULT 0,
          model TEXT,
          label TEXT,
          tags TEXT NOT NULL DEFAULT '[]',
          agents_json TEXT NOT NULL DEFAULT '[]',
          tool_chain_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS timeline_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          agent_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          zone TEXT,
          tool TEXT,
          tool_args TEXT,
          text_content TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER
        );

        -- Live (in-progress) sessions: written incrementally so data survives crashes
        CREATE TABLE IF NOT EXISTS live_sessions (
          root_session_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'claude',
          project_name TEXT NOT NULL,
          project_path TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          last_activity_at INTEGER NOT NULL,
          agents_json TEXT NOT NULL DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS live_timeline_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          root_session_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          agent_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          zone TEXT,
          tool TEXT,
          tool_args TEXT,
          text_content TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_timeline_session ON timeline_events(session_id);
        CREATE INDEX IF NOT EXISTS idx_timeline_timestamp ON timeline_events(session_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_name);
        CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_live_timeline_root ON live_timeline_events(root_session_id);
      `);

      if (currentVersion === 0) {
        this.db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
      } else {
        this.db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
      }
    }
  }

  /** Save a complete recorded session with its timeline */
  saveSession(session: RecordedSession, timeline: RecordedTimelineEvent[]): void {
    const insertSession = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (
        id, source, root_session_id, project_name, project_path,
        started_at, ended_at, duration_ms,
        total_cost, total_input_tokens, total_output_tokens,
        total_cache_read_tokens, total_cache_creation_tokens,
        total_tool_uses, agent_count, model, label, tags,
        agents_json, tool_chain_json
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    const insertEvent = this.db.prepare(`
      INSERT INTO timeline_events (
        session_id, timestamp, agent_id, kind, zone, tool, tool_args,
        text_content, input_tokens, output_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const txn = this.db.transaction(() => {
      // Delete existing timeline events if replacing
      this.db.prepare('DELETE FROM timeline_events WHERE session_id = ?').run(session.id);

      insertSession.run(
        session.id,
        session.source,
        session.rootSessionId,
        session.projectName,
        session.projectPath,
        session.startedAt,
        session.endedAt,
        session.durationMs,
        session.totalCost,
        session.totalInputTokens,
        session.totalOutputTokens,
        session.totalCacheReadTokens,
        session.totalCacheCreationTokens,
        session.totalToolUses,
        session.agentCount,
        session.model,
        session.label,
        JSON.stringify(session.tags),
        JSON.stringify(session.agents),
        JSON.stringify(session.toolChain),
      );

      for (const evt of timeline) {
        insertEvent.run(
          session.id,
          evt.timestamp,
          evt.agentId,
          evt.kind,
          evt.zone ?? null,
          evt.tool ?? null,
          evt.toolArgs ?? null,
          evt.text ?? null,
          evt.inputTokens ?? null,
          evt.outputTokens ?? null,
        );
      }
    });

    txn();
  }

  /** List sessions with optional filtering */
  listSessions(opts?: {
    project?: string;
    limit?: number;
    offset?: number;
  }): SessionSummary[] {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    let sql = `SELECT id, source, project_name, started_at, ended_at, duration_ms,
               total_cost, total_tool_uses, agent_count, model, label, tags
               FROM sessions`;
    const params: unknown[] = [];

    if (opts?.project) {
      sql += ' WHERE project_name = ?';
      params.push(opts.project);
    }

    sql += ' ORDER BY started_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string; source: string; project_name: string;
      started_at: number; ended_at: number; duration_ms: number;
      total_cost: number; total_tool_uses: number; agent_count: number;
      model: string | null; label: string | null; tags: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      source: r.source as 'claude' | 'opencode',
      projectName: r.project_name,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      durationMs: r.duration_ms,
      totalCost: r.total_cost,
      totalToolUses: r.total_tool_uses,
      agentCount: r.agent_count,
      model: r.model,
      label: r.label,
      tags: JSON.parse(r.tags),
    }));
  }

  /** Get a full session by ID (without timeline) */
  getSession(id: string): RecordedSession | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as {
      id: string; source: string; root_session_id: string;
      project_name: string; project_path: string;
      started_at: number; ended_at: number; duration_ms: number;
      total_cost: number; total_input_tokens: number; total_output_tokens: number;
      total_cache_read_tokens: number; total_cache_creation_tokens: number;
      total_tool_uses: number; agent_count: number; model: string | null;
      label: string | null; tags: string;
      agents_json: string; tool_chain_json: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      source: row.source as 'claude' | 'opencode',
      rootSessionId: row.root_session_id,
      projectName: row.project_name,
      projectPath: row.project_path,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      durationMs: row.duration_ms,
      totalCost: row.total_cost,
      totalInputTokens: row.total_input_tokens,
      totalOutputTokens: row.total_output_tokens,
      totalCacheReadTokens: row.total_cache_read_tokens,
      totalCacheCreationTokens: row.total_cache_creation_tokens,
      totalToolUses: row.total_tool_uses,
      agentCount: row.agent_count,
      model: row.model,
      label: row.label,
      tags: JSON.parse(row.tags),
      agents: JSON.parse(row.agents_json) as RecordedAgent[],
      toolChain: JSON.parse(row.tool_chain_json) as ToolChainData,
    };
  }

  /** Get timeline events for a session */
  getTimeline(sessionId: string, opts?: { limit?: number; offset?: number }): RecordedTimelineEvent[] {
    const limit = opts?.limit ?? 10000;
    const offset = opts?.offset ?? 0;

    const rows = this.db.prepare(`
      SELECT timestamp, agent_id, kind, zone, tool, tool_args, text_content,
             input_tokens, output_tokens
      FROM timeline_events
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(sessionId, limit, offset) as Array<{
      timestamp: number; agent_id: string; kind: string;
      zone: string | null; tool: string | null; tool_args: string | null;
      text_content: string | null; input_tokens: number | null; output_tokens: number | null;
    }>;

    return rows.map(r => ({
      timestamp: r.timestamp,
      agentId: r.agent_id,
      kind: r.kind as RecordedTimelineEvent['kind'],
      ...(r.zone && { zone: r.zone as RecordedTimelineEvent['zone'] }),
      ...(r.tool && { tool: r.tool }),
      ...(r.tool_args && { toolArgs: r.tool_args }),
      ...(r.text_content && { text: r.text_content }),
      ...(r.input_tokens != null && { inputTokens: r.input_tokens }),
      ...(r.output_tokens != null && { outputTokens: r.output_tokens }),
    }));
  }

  /** Delete a session and its timeline */
  deleteSession(id: string): boolean {
    const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /** Update session label */
  updateLabel(id: string, label: string | null): boolean {
    const result = this.db.prepare('UPDATE sessions SET label = ? WHERE id = ?').run(label, id);
    return result.changes > 0;
  }

  /** Update session tags */
  updateTags(id: string, tags: string[]): boolean {
    const result = this.db.prepare('UPDATE sessions SET tags = ? WHERE id = ?').run(JSON.stringify(tags), id);
    return result.changes > 0;
  }

  /** Get total session count (for pagination) */
  getSessionCount(project?: string): number {
    if (project) {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM sessions WHERE project_name = ?').get(project) as { count: number };
      return row.count;
    }
    const row = this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
    return row.count;
  }

  // ── Live session methods (incremental writes for crash safety) ──

  /** Create or update a live session entry */
  upsertLiveSession(rootSessionId: string, data: {
    sessionId: string;
    source: 'claude' | 'opencode';
    projectName: string;
    projectPath: string;
    startedAt: number;
  }): void {
    this.db.prepare(`
      INSERT INTO live_sessions (root_session_id, session_id, source, project_name, project_path, started_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(root_session_id) DO UPDATE SET
        session_id = excluded.session_id,
        source = excluded.source,
        project_name = excluded.project_name,
        project_path = excluded.project_path,
        last_activity_at = excluded.last_activity_at
    `).run(rootSessionId, data.sessionId, data.source, data.projectName, data.projectPath, data.startedAt, Date.now());
  }

  /** Update the agent snapshot for a live session */
  updateLiveAgents(rootSessionId: string, agentsJson: string): void {
    this.db.prepare(`
      UPDATE live_sessions SET agents_json = ?, last_activity_at = ? WHERE root_session_id = ?
    `).run(agentsJson, Date.now(), rootSessionId);
  }

  /** Append a timeline event to the live buffer */
  appendLiveTimelineEvent(rootSessionId: string, evt: RecordedTimelineEvent): void {
    this.db.prepare(`
      INSERT INTO live_timeline_events (root_session_id, timestamp, agent_id, kind, zone, tool, tool_args, text_content, input_tokens, output_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rootSessionId,
      evt.timestamp,
      evt.agentId,
      evt.kind,
      evt.zone ?? null,
      evt.tool ?? null,
      evt.toolArgs ?? null,
      evt.text ?? null,
      evt.inputTokens ?? null,
      evt.outputTokens ?? null,
    );
  }

  /** Get all live timeline events for a root session */
  getLiveTimeline(rootSessionId: string): RecordedTimelineEvent[] {
    const rows = this.db.prepare(`
      SELECT timestamp, agent_id, kind, zone, tool, tool_args, text_content, input_tokens, output_tokens
      FROM live_timeline_events WHERE root_session_id = ? ORDER BY timestamp ASC
    `).all(rootSessionId) as Array<{
      timestamp: number; agent_id: string; kind: string;
      zone: string | null; tool: string | null; tool_args: string | null;
      text_content: string | null; input_tokens: number | null; output_tokens: number | null;
    }>;

    return rows.map(r => ({
      timestamp: r.timestamp,
      agentId: r.agent_id,
      kind: r.kind as RecordedTimelineEvent['kind'],
      ...(r.zone && { zone: r.zone as RecordedTimelineEvent['zone'] }),
      ...(r.tool && { tool: r.tool }),
      ...(r.tool_args && { toolArgs: r.tool_args }),
      ...(r.text_content && { text: r.text_content }),
      ...(r.input_tokens != null && { inputTokens: r.input_tokens }),
      ...(r.output_tokens != null && { outputTokens: r.output_tokens }),
    }));
  }

  /** Remove live session data after finalization */
  removeLiveSession(rootSessionId: string): void {
    this.db.prepare('DELETE FROM live_timeline_events WHERE root_session_id = ?').run(rootSessionId);
    this.db.prepare('DELETE FROM live_sessions WHERE root_session_id = ?').run(rootSessionId);
  }

  /** List currently active (in-progress) live sessions */
  listLiveSessions(): LiveSessionSummary[] {
    const rows = this.db.prepare(
      'SELECT root_session_id, source, project_name, started_at, last_activity_at, agents_json FROM live_sessions ORDER BY started_at DESC'
    ).all() as Array<{
      root_session_id: string; source: string;
      project_name: string; started_at: number;
      last_activity_at: number; agents_json: string;
    }>;

    return rows.map(r => {
      let agentCount = 0;
      try { agentCount = (JSON.parse(r.agents_json) as unknown[]).length; } catch { /* empty */ }
      return {
        rootSessionId: r.root_session_id,
        source: r.source as 'claude' | 'opencode',
        projectName: r.project_name,
        startedAt: r.started_at,
        lastActivityAt: r.last_activity_at,
        agentCount,
      };
    });
  }

  /** Get all orphaned live sessions (for crash recovery on startup) */
  getOrphanedLiveSessions(): Array<{
    rootSessionId: string;
    sessionId: string;
    source: 'claude' | 'opencode';
    projectName: string;
    projectPath: string;
    startedAt: number;
    lastActivityAt: number;
    agentsJson: string;
  }> {
    return (this.db.prepare('SELECT * FROM live_sessions').all() as Array<{
      root_session_id: string; session_id: string; source: string;
      project_name: string; project_path: string;
      started_at: number; last_activity_at: number; agents_json: string;
    }>).map(r => ({
      rootSessionId: r.root_session_id,
      sessionId: r.session_id,
      source: r.source as 'claude' | 'opencode',
      projectName: r.project_name,
      projectPath: r.project_path,
      startedAt: r.started_at,
      lastActivityAt: r.last_activity_at,
      agentsJson: r.agents_json,
    }));
  }

  close(): void {
    this.db.close();
  }
}
