import chokidar from 'chokidar';
import { stat, open, readdir } from 'fs/promises';
import { join, basename } from 'path';
import type { AgentStateManager } from '../../state/agent-state-manager.js';
import { createFallbackSession } from '../types.js';
import type { SessionInfo, ParsedActivity } from '../types.js';
import type { AgentWatcher } from '../agent-watcher.js';
import { CodexParser } from './codex-parser.js';
import { config } from '../../config.js';
import {
  getCodexSessionsDir,
  extractCodexSessionId,
  parseCodexSessionInfo,
  createCodexSubagentSession,
} from './codex-paths.js';

/**
 * Watches Codex CLI session JSONL files for new activity.
 *
 * Codex stores sessions at: ~/.codex/sessions/YYYY/MM/DD/rollout-{timestamp}-{uuid}.jsonl
 * Each line is a JSON envelope: {timestamp, type, payload}
 * Types include: session_meta, response_item, event_msg, turn_context
 */
export class CodexWatcher implements AgentWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private byteOffsets = new Map<string, number>();
  private parser = new CodexParser();
  /** Per-file lock to prevent concurrent processFile calls */
  private fileLocks = new Map<string, Promise<void>>();
  /** Cached session info per file (parsed from session_meta) */
  private sessionInfoCache = new Map<string, SessionInfo>();
  /** Per-file model tracking (from turn_context events) */
  private fileModels = new Map<string, string>();
  /** Deduplication of spawn_agent call IDs already processed */
  private seenSubagentCalls = new Set<string>();
  /** Counter for generating unique subagent session IDs */
  private subagentCounter = 0;

  constructor(private stateManager: AgentStateManager) {}

  async start(): Promise<void> {
    const sessionsDir = getCodexSessionsDir();
    if (!sessionsDir) {
      console.log('[codex] No sessions directory found — Codex CLI not installed or not yet used');
      return;
    }

    console.log(`[codex] Sessions directory found at ${sessionsDir}`);

    // Scan and replay recently-active session files on startup
    // Codex uses YYYY/MM/DD nesting, so we scan recursively
    const existingFiles = await this.scanDeep(sessionsDir);
    for (const file of existingFiles) {
      await this.processFile(file);
    }

    const pattern = join(sessionsDir, '**', '*.jsonl');
    // Use polling on Windows — fs.watch doesn't reliably detect changes
    // in deeply nested directories (YYYY/MM/DD/) on Windows
    const usePolling = process.platform === 'win32';
    this.watcher = chokidar.watch(pattern, {
      persistent: true,
      ignoreInitial: true,
      usePolling,
      interval: usePolling ? 500 : undefined,
      awaitWriteFinish: usePolling ? false : { stabilityThreshold: 200, pollInterval: 50 },
    });

    this.watcher.on('add', (filePath) => {
      console.log(`[codex] New session file: ${filePath}`);
      this.processFile(filePath);
    });

    this.watcher.on('change', (filePath) => {
      this.processFile(filePath);
    });

    console.log(`[codex] Watching for JSONL files in ${sessionsDir} (polling: ${usePolling})`);
  }

  stop(): void {
    this.watcher?.close();
    this.byteOffsets.clear();
    this.fileLocks.clear();
    this.sessionInfoCache.clear();
    this.fileModels.clear();
    this.seenSubagentCalls.clear();
  }

  /**
   * Recursively scan for recently-modified JSONL files under the sessions dir.
   * Codex nests files as sessions/YYYY/MM/DD/rollout-*.jsonl.
   */
  private async scanDeep(dir: string): Promise<string[]> {
    const results: string[] = [];
    const now = Date.now();

    const walk = async (current: string) => {
      try {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
          const full = join(current, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
          } else if (entry.name.endsWith('.jsonl')) {
            try {
              const s = await stat(full);
              if (now - s.mtimeMs < config.activeThresholdMs) {
                results.push(full);
              }
            } catch { /* skip files we can't stat */ }
          }
        }
      } catch { /* skip dirs we can't read */ }
    };

    await walk(dir);
    return results;
  }

  private processFile(filePath: string): void {
    const prev = this.fileLocks.get(filePath) ?? Promise.resolve();
    const next = prev
      .then(() => this.doProcessFile(filePath))
      .catch(() => {})
      .finally(() => {
        if (this.fileLocks.get(filePath) === next) {
          this.fileLocks.delete(filePath);
        }
      });
    this.fileLocks.set(filePath, next);
  }

  private async doProcessFile(filePath: string) {
    try {
      const fileStats = await stat(filePath);
      const currentOffset = this.byteOffsets.get(filePath) ?? 0;

      if (fileStats.size <= currentOffset) return;

      const handle = await open(filePath, 'r');
      try {
        const buffer = Buffer.alloc(fileStats.size - currentOffset);
        await handle.read(buffer, 0, buffer.length, currentOffset);
        this.byteOffsets.set(filePath, fileStats.size);

        const newContent = buffer.toString('utf-8');
        const lines = newContent.split('\n').filter((l) => l.trim());

        const sessionId = extractCodexSessionId(filePath);
        let sessionInfo = this.sessionInfoCache.get(filePath);

        let hadParsedActivity = false;
        for (const line of lines) {
          const envelope = this.parser.parseRaw(line);
          if (!envelope) continue;

          // Check for session_meta (first entry in file)
          if (!sessionInfo) {
            const meta = this.parser.tryGetSessionMeta(envelope);
            if (meta) {
              sessionInfo = parseCodexSessionInfo(meta);
              this.sessionInfoCache.set(filePath, sessionInfo);
              continue;
            }
          }

          // Track model from turn_context events (per-file)
          const model = this.parser.tryGetModel(envelope);
          if (model) {
            this.fileModels.set(filePath, model);
            continue;
          }

          // Parse the envelope into a ParsedActivity
          const currentModel = this.fileModels.get(filePath) ?? null;
          const parsed = this.parser.parseEntry(envelope, currentModel);
          if (parsed) {
            hadParsedActivity = true;
            if (!sessionInfo) {
              sessionInfo = this.buildFallbackSession(filePath);
              this.sessionInfoCache.set(filePath, sessionInfo);
            }

            // Detect spawn_agent calls → create synthetic subagent sessions
            if (parsed.type === 'tool_use' && parsed.toolName === 'Agent') {
              this.handleSubagentSpawn(sessionId, sessionInfo, parsed, envelope.payload);
            }

            this.stateManager.processMessage(sessionId, parsed, sessionInfo);
          }
        }

        // Heartbeat to keep agent alive even if no parseable activities
        if (!hadParsedActivity && lines.length > 0) {
          this.stateManager.heartbeat(sessionId);
        }
      } finally {
        await handle.close();
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[codex] Error processing ${filePath}:`, err);
      }
    }
  }

  /**
   * When a spawn_agent tool call is detected, create a synthetic subagent session
   * so the visualization shows the child agent.
   */
  private handleSubagentSpawn(
    parentSessionId: string,
    parentInfo: SessionInfo,
    parsed: ParsedActivity,
    payload: Record<string, unknown>,
  ): void {
    const callId = payload.call_id as string | undefined;
    if (!callId || this.seenSubagentCalls.has(callId)) return;

    this.subagentCounter++;
    this.seenSubagentCalls.add(callId);

    const subSessionId = `codex:sub-${parentSessionId.replace('codex:', '')}-${this.subagentCounter}`;
    const subInfo = createCodexSubagentSession(parentSessionId, parentInfo);

    // Extract agent name/type from the tool input
    const agentName = (parsed.toolInput?.agent_type as string)
      || (parsed.toolInput?.message as string)?.slice(0, 30)
      || `agent-${this.subagentCounter}`;

    // Spawn the subagent with a descriptive activity
    this.stateManager.processMessage(subSessionId, {
      type: 'tool_use',
      toolName: 'thinking',
      toolInput: { thought: `Subagent: ${agentName}` },
      model: parsed.model,
      agentName,
    }, subInfo);
  }

  private buildFallbackSession(filePath: string): SessionInfo {
    const name = basename(filePath, '.jsonl');
    return createFallbackSession('codex', name);
  }
}
