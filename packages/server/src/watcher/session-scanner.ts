import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { config } from '../config.js';

export class SessionScanner {
  constructor(private claudeHome: string) {}

  /** Find all recently active JSONL session files */
  async scan(): Promise<string[]> {
    const results: string[] = [];
    const projectsDir = join(this.claudeHome, 'projects');

    try {
      const projects = await readdir(projectsDir);
      const now = Date.now();

      for (const project of projects) {
        const projectDir = join(projectsDir, project);
        try {
          const projectStat = await stat(projectDir);
          if (!projectStat.isDirectory()) continue;

          const files = await readdir(projectDir);
          for (const file of files) {
            if (!file.endsWith('.jsonl')) continue;
            const filePath = join(projectDir, file);
            try {
              const fileStat = await stat(filePath);
              if (now - fileStat.mtimeMs < config.activeThresholdMs) {
                results.push(filePath);
              }
            } catch {
              // Skip files we can't stat
            }
          }
        } catch {
          // Skip directories we can't read
        }
      }
    } catch {
      console.log('No projects directory found — will wait for new sessions');
    }

    return results;
  }
}
