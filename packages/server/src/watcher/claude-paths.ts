import { basename, dirname, sep } from 'path';
import { existsSync } from 'fs';
import { join } from 'path';

export interface SessionInfo {
  projectPath: string;
  projectName: string;
  isSubagent: boolean;
}

class ClaudePaths {
  /**
   * Parse a JSONL session file path to extract project info.
   * Paths look like: ~/.claude/projects/{encoded-project-path}/{sessionId}.jsonl
   * Subagent paths may be nested deeper.
   */
  parseSessionPath(filePath: string): SessionInfo {
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/');

    // Find 'projects' in the path
    const projectsIdx = parts.indexOf('projects');
    if (projectsIdx === -1 || projectsIdx + 1 >= parts.length) {
      return {
        projectPath: 'unknown',
        projectName: 'Unknown',
        isSubagent: false,
      };
    }

    const encodedProjectName = parts[projectsIdx + 1];
    const projectName = this.decodeProjectName(encodedProjectName);

    // Check depth — if there are extra directories between project and the JSONL, it's a subagent
    const depthAfterProject = parts.length - projectsIdx - 2;
    const isSubagent = depthAfterProject > 1;

    return {
      projectPath: encodedProjectName,
      projectName,
      isSubagent,
    };
  }

  /**
   * Decode Claude Code's encoded project path format.
   * Resolves against the filesystem to correctly handle dashes in folder names.
   * e.g., "C--projects-fts-temp-agent-move" → "agent-move"
   */
  decodeProjectName(encoded: string): string {
    const resolved = this.resolveToFolderName(encoded);
    if (resolved) return resolved;

    // Fallback: last 2 dash-segments joined
    const parts = encoded.split('-').filter((p) => p.length > 0);
    if (parts.length <= 2) return parts.join('/');
    return parts.slice(-2).join('/');
  }

  /**
   * Greedily resolve the encoded path against the filesystem.
   * Tries each dash-segment as a directory, joining multiple segments
   * when a single one doesn't exist (to handle dashes in folder names).
   */
  private resolveToFolderName(encoded: string): string | null {
    try {
      // Extract drive letter: C-- → C:/
      const driveMatch = encoded.match(/^([A-Za-z])--(.*)/);
      if (!driveMatch) return null;

      const drive = driveMatch[1] + ':/';
      const rest = driveMatch[2];
      const parts = rest.split('-').filter(Boolean);

      let currentPath = drive;
      let lastName = '';
      let i = 0;

      while (i < parts.length) {
        let found = false;
        const maxLen = Math.min(parts.length - i, 6);

        for (let len = 1; len <= maxLen; len++) {
          const segment = parts.slice(i, i + len).join('-');

          // Try normal path, then dot-prefixed (for hidden dirs like .claude)
          for (const prefix of ['', '.']) {
            const testPath = join(currentPath, prefix + segment);
            if (existsSync(testPath)) {
              currentPath = testPath;
              lastName = prefix + segment;
              i += len;
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (!found) break;
      }

      return lastName || null;
    } catch {
      return null;
    }
  }
}

export const claudePaths = new ClaudePaths();
