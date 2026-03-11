import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { config } from '../config.js';

/**
 * Scans a directory of project subdirectories for recently active JSONL files.
 * Used by both Claude and pi watchers — each passes its own root directory.
 *
 * Directory structure: {rootDir}/{project-dir}/*.jsonl
 */
export class SessionScanner {
  constructor(private rootDir: string) {}

  /** Find the most recently modified JSONL per project subdirectory */
  async scan(): Promise<string[]> {
    const results: string[] = [];

    try {
      const projects = await readdir(this.rootDir);
      const now = Date.now();

      for (const project of projects) {
        const projectDir = join(this.rootDir, project);
        try {
          const projectStat = await stat(projectDir);
          if (!projectStat.isDirectory()) continue;

          const files = await readdir(projectDir);

          let newestFile: string | null = null;
          let newestMtime = 0;

          for (const file of files) {
            if (!file.endsWith('.jsonl')) continue;
            const filePath = join(projectDir, file);
            try {
              const fileStat = await stat(filePath);
              if (now - fileStat.mtimeMs < config.activeThresholdMs) {
                if (fileStat.mtimeMs > newestMtime) {
                  newestMtime = fileStat.mtimeMs;
                  newestFile = filePath;
                }
              }
            } catch {
              // Skip files we can't stat
            }
          }

          if (newestFile) {
            results.push(newestFile);
          }
        } catch {
          // Skip directories we can't read
        }
      }
    } catch {
      // Root dir doesn't exist — will be created when sessions start
    }

    return results;
  }
}
