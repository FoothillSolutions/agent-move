import chokidar from 'chokidar';
import { stat, open } from 'fs/promises';
import type { AgentStateManager } from '../state/agent-state-manager.js';
import { JsonlParser } from './jsonl-parser.js';
import { FILE_SESSION_SOURCES, getFileSessionSource } from './file-session-sources.js';
import { SessionScanner } from './session-scanner.js';
import type { AgentWatcher } from './agent-watcher.js';

export class FileWatcher implements AgentWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private byteOffsets = new Map<string, number>();
  private sessionIds = new Map<string, string>();
  private parser = new JsonlParser();
  /** Per-file lock to prevent concurrent processFile calls for the same file */
  private fileLocks = new Map<string, Promise<void>>();

  constructor(private stateManager: AgentStateManager) {}

  async start(): Promise<void> {
    const scanner = new SessionScanner();
    const existingFiles = await scanner.scan();
    for (const filePath of existingFiles) {
      await this.doProcessFile(filePath);
    }

    this.watcher = chokidar.watch(FILE_SESSION_SOURCES.map((source) => source.watchPattern), {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    this.watcher.on('add', (filePath) => {
      console.log(`New session file: ${filePath}`);
      this.processFile(filePath);
    });

    this.watcher.on('change', (filePath) => {
      this.processFile(filePath);
    });

    for (const source of FILE_SESSION_SOURCES) {
      console.log(`Watching ${source.provider} session files in ${source.rootDir}`);
    }
  }

  stop(): void {
    void this.watcher?.close();
    this.byteOffsets.clear();
    this.sessionIds.clear();
    this.fileLocks.clear();
  }

  private processFile(filePath: string): void {
    const prev = this.fileLocks.get(filePath) ?? Promise.resolve();
    const next = prev
      .then(() => this.doProcessFile(filePath))
      .catch(() => {})
      .finally(() => {
        // Clean up lock entry once the chain settles
        if (this.fileLocks.get(filePath) === next) {
          this.fileLocks.delete(filePath);
        }
      });
    this.fileLocks.set(filePath, next);
  }

  private async doProcessFile(filePath: string) {
    const source = getFileSessionSource(filePath);
    if (!source) return;

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
        let fallbackSessionId = this.sessionIds.get(filePath) ?? source.getSessionId(filePath);
        const sessionInfo = source.parseSessionPath(filePath);

        let hadParsedActivity = false;
        for (const line of lines) {
          const parsed = this.parser.parseLine(line, source.provider);
          if (!parsed) continue;

          hadParsedActivity = true;
          if (parsed.sessionId) {
            fallbackSessionId = parsed.sessionId;
            this.sessionIds.set(filePath, parsed.sessionId);
          }
          const sessionId = parsed.sessionId ?? fallbackSessionId;
          this.stateManager.processMessage(sessionId, parsed, sessionInfo);
        }

        if (!hadParsedActivity && lines.length > 0) {
          this.stateManager.heartbeat(fallbackSessionId);
        }
      } finally {
        await handle.close();
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Error processing ${filePath}:`, err);
      }
    }
  }
}
