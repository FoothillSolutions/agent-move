import chokidar from 'chokidar';
import { stat, open } from 'fs/promises';
import { join, basename, dirname } from 'path';
import type { AgentStateManager } from '../../state/agent-state-manager.js';
import type { SessionInfo } from '../claude-paths.js';
import type { AgentWatcher } from '../agent-watcher.js';
import { PiParser } from './pi-parser.js';
import { SessionScanner } from '../session-scanner.js';
import { getPiSessionsDir, parsePiSessionInfo } from './pi-paths.js';
import type { PiSessionHeader } from './pi-paths.js';

/**
 * Watches pi coding agent session JSONL files for new activity.
 *
 * Pi stores sessions at: ~/.pi/agent/sessions/--encoded-cwd--/{timestamp}_{uuid}.jsonl
 * The JSONL format uses {type:"message", message:{...}} entries with tool calls
 * as {type:"toolCall"} content blocks inside assistant messages.
 */
export class PiWatcher implements AgentWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private byteOffsets = new Map<string, number>();
  private parser = new PiParser();
  /** Per-file lock to prevent concurrent processFile calls */
  private fileLocks = new Map<string, Promise<void>>();
  /** Cached session info per file (parsed from session header) */
  private sessionInfoCache = new Map<string, SessionInfo>();

  constructor(private stateManager: AgentStateManager) {}

  async start(): Promise<void> {
    const sessionsDir = getPiSessionsDir();
    if (!sessionsDir) {
      console.log('[pi] No sessions directory found — pi not installed or not yet used');
      return;
    }

    console.log(`[pi] Sessions directory found at ${sessionsDir}`);

    // Scan and replay recently-active session files on startup
    const scanner = new SessionScanner(sessionsDir);
    const existingFiles = await scanner.scan();

    for (const file of existingFiles) {
      await this.processFile(file);
    }

    const pattern = join(sessionsDir, '**', '*.jsonl');
    this.watcher = chokidar.watch(pattern, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    this.watcher.on('add', (filePath) => {
      console.log(`[pi] New session file: ${filePath}`);
      this.processFile(filePath);
    });

    this.watcher.on('change', (filePath) => {
      this.processFile(filePath);
    });

    console.log(`[pi] Watching for JSONL files in ${sessionsDir}`);
  }

  stop(): void {
    this.watcher?.close();
    this.byteOffsets.clear();
    this.fileLocks.clear();
    this.sessionInfoCache.clear();
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

        const sessionId = this.extractSessionId(filePath);
        let sessionInfo = this.sessionInfoCache.get(filePath);

        let hadParsedActivity = false;
        for (const line of lines) {
          const raw = this.parser.parseRaw(line);
          if (!raw) continue;

          // Check for session header (parse once, no double JSON.parse)
          if (!sessionInfo && this.parser.isSessionHeader(raw)) {
            const dirName = this.getProjectDirName(filePath);
            sessionInfo = parsePiSessionInfo(raw as unknown as PiSessionHeader, dirName);
            this.sessionInfoCache.set(filePath, sessionInfo);
            continue;
          }

          const parsed = this.parser.parseEntry(raw);
          if (parsed) {
            hadParsedActivity = true;
            if (!sessionInfo) {
              sessionInfo = this.buildFallbackSession(filePath);
              this.sessionInfoCache.set(filePath, sessionInfo);
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
        console.error(`[pi] Error processing ${filePath}:`, err);
      }
    }
  }

  /**
   * Extract a prefixed session ID from a pi session file path.
   * Filename format: {timestamp}_{uuid}.jsonl
   */
  private extractSessionId(filePath: string): string {
    const name = basename(filePath, '.jsonl');
    return `pi:${name}`;
  }

  private buildFallbackSession(filePath: string): SessionInfo {
    const dirName = this.getProjectDirName(filePath);
    return {
      projectPath: dirName,
      projectName: dirName.replace(/^--|--$/g, '') || 'pi',
      isSubagent: false,
      projectDir: dirName,
      parentSessionId: null,
    };
  }

  /**
   * Get the encoded project directory name from a session file path.
   * Path: .../sessions/--encoded-path--/{timestamp}_{uuid}.jsonl
   */
  private getProjectDirName(filePath: string): string {
    const dir = dirname(filePath).replace(/\\/g, '/');
    const parts = dir.split('/');
    return parts[parts.length - 1] || 'unknown';
  }
}
