import chokidar from 'chokidar';
import { stat, open } from 'fs/promises';
import { join, basename } from 'path';
import type { AgentStateManager } from '../../state/agent-state-manager.js';
import { JsonlParser } from './jsonl-parser.js';
import { claudePaths } from './claude-paths.js';
import { SessionScanner } from '../session-scanner.js';
import type { AgentWatcher } from '../agent-watcher.js';

export class FileWatcher implements AgentWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private byteOffsets = new Map<string, number>();
  private parser = new JsonlParser();
  /** Per-file lock to prevent concurrent processFile calls for the same file */
  private fileLocks = new Map<string, Promise<void>>();

  constructor(
    private claudeHome: string,
    private stateManager: AgentStateManager
  ) {}

  async start(): Promise<void> {
    // Scan and replay recently-active session files on startup
    const scanner = new SessionScanner(join(this.claudeHome, 'projects'));
    const existingFiles = await scanner.scan();

    // Process existing files sequentially — main session must be processed
    // before subagent files so parent relationships resolve correctly
    for (const file of existingFiles) {
      await this.processFile(file);
    }

    const pattern = join(this.claudeHome, 'projects', '**', '*.jsonl');
    this.watcher = chokidar.watch(pattern, {
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

    console.log(`Watching for JSONL files in ${this.claudeHome}/projects/`);
  }

  stop(): void {
    this.watcher?.close();
    this.byteOffsets.clear();
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
    try {
      const fileStats = await stat(filePath);
      const currentOffset = this.byteOffsets.get(filePath) ?? 0;

      if (fileStats.size <= currentOffset) return;

      // Read only new bytes
      const handle = await open(filePath, 'r');
      try {
        const buffer = Buffer.alloc(fileStats.size - currentOffset);
        await handle.read(buffer, 0, buffer.length, currentOffset);
        this.byteOffsets.set(filePath, fileStats.size);

        const newContent = buffer.toString('utf-8');
        const lines = newContent.split('\n').filter((l) => l.trim());

        const sessionId = basename(filePath, '.jsonl');
        const sessionInfo = claudePaths.parseSessionPath(filePath);

        let hadParsedActivity = false;
        for (const line of lines) {
          const parsed = this.parser.parseLine(line);
          if (parsed) {
            hadParsedActivity = true;
            this.stateManager.processMessage(sessionId, parsed, sessionInfo);
          }
        }

        // If the file grew but no parsed activities (e.g. tool results, system
        // messages), send a heartbeat so pending-tool agents stay alive.
        if (!hadParsedActivity && lines.length > 0) {
          this.stateManager.heartbeat(sessionId);
        }
      } finally {
        await handle.close();
      }
    } catch (err) {
      // File may have been deleted or is being written to
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Error processing ${filePath}:`, err);
      }
    }
  }
}
