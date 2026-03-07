import { basename, dirname, sep } from 'path';
import { existsSync } from 'fs';
import { join } from 'path';
import type { SessionInfo } from './session-info.js';

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
        provider: 'claude',
        projectPath: 'unknown',
        projectName: 'Unknown',
        isSubagent: false,
        projectDir: 'unknown',
        parentSessionId: null,
      };
    }

    const encodedProjectName = parts[projectsIdx + 1];
    const projectName = this.decodeProjectName(encodedProjectName);

    // Check depth — if there are extra directories between project and the JSONL, it's a subagent
    // Path: {projects}/{encoded-project}/{parent-session-id}/subagents/{agent-session-id}.jsonl
    const depthAfterProject = parts.length - projectsIdx - 2;
    const isSubagent = depthAfterProject > 1;

    // Extract parent session ID from path for subagents
    // parts[projectsIdx + 2] is the parent session directory name
    const parentSessionId = isSubagent ? parts[projectsIdx + 2] : null;

    return {
      provider: 'claude',
      projectPath: encodedProjectName,
      projectName,
      isSubagent,
      projectDir: encodedProjectName,
      parentSessionId,
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
      let root: string;
      let rest: string;

      // Windows: drive letter encoding e.g. "C--projects-foo"  → C:/
      const driveMatch = encoded.match(/^([A-Za-z])--(.*)/);
      // Unix: root slash encoding e.g. "-Users-john-foo"  → /
      const unixMatch = !driveMatch && encoded.match(/^-(.*)/);

      if (driveMatch) {
        root = driveMatch[1] + ':/';
        rest = driveMatch[2];
      } else if (unixMatch) {
        root = '/';
        rest = unixMatch[1];
      } else {
        return null;
      }

      const parts = rest.split('-').filter(Boolean);

      let currentPath = root;
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
