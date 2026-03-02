import { basename, dirname, sep } from 'path';

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
   * e.g., "C--projects-fts-temp-agent-move" → "C:/projects/fts/temp/agent-move"
   */
  decodeProjectName(encoded: string): string {
    // The encoding replaces path separators with dashes
    // First segment before first dash might be drive letter on Windows
    // Just use the last segment as a friendly name
    const parts = encoded.split('-');
    // Return last 2-3 meaningful parts as project name
    const meaningful = parts.filter((p) => p.length > 0);
    if (meaningful.length <= 2) return meaningful.join('/');
    return meaningful.slice(-2).join('/');
  }
}

export const claudePaths = new ClaudePaths();
