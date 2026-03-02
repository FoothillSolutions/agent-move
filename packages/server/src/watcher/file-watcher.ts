import chokidar from 'chokidar';
import { readFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import type { AgentStateManager } from '../state/agent-state-manager.js';
import { JsonlParser } from './jsonl-parser.js';
import { claudePaths } from './claude-paths.js';

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private byteOffsets = new Map<string, number>();
  private parser = new JsonlParser();

  constructor(
    private claudeHome: string,
    private stateManager: AgentStateManager
  ) {}

  start(existingFiles: string[]) {
    // Process existing files first
    for (const file of existingFiles) {
      this.processFile(file);
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

  stop() {
    this.watcher?.close();
  }

  private async processFile(filePath: string) {
    try {
      const fileStats = await stat(filePath);
      const currentOffset = this.byteOffsets.get(filePath) ?? 0;

      if (fileStats.size <= currentOffset) return;

      // Read only new bytes
      const { open } = await import('fs/promises');
      const handle = await open(filePath, 'r');
      try {
        const buffer = Buffer.alloc(fileStats.size - currentOffset);
        await handle.read(buffer, 0, buffer.length, currentOffset);
        this.byteOffsets.set(filePath, fileStats.size);

        const newContent = buffer.toString('utf-8');
        const lines = newContent.split('\n').filter((l) => l.trim());

        const sessionId = basename(filePath, '.jsonl');
        const sessionInfo = claudePaths.parseSessionPath(filePath);

        for (const line of lines) {
          const parsed = this.parser.parseLine(line);
          if (parsed) {
            this.stateManager.processMessage(sessionId, parsed, sessionInfo);
          }
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
