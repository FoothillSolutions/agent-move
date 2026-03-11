import { resolveEncodedPath } from '../path-utils.js';
import type { SessionInfo } from '../types.js';

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
        agentType: 'claude',
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
      agentType: 'claude',
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
    // Windows: drive letter encoding e.g. "C--projects-foo" → C:/
    const driveMatch = encoded.match(/^([A-Za-z])--(.*)/);
    // Unix: root slash encoding e.g. "-Users-john-foo" → /
    const unixMatch = !driveMatch && encoded.match(/^-(.*)/);

    if (driveMatch) {
      const resolved = resolveEncodedPath(driveMatch[1] + ':/', driveMatch[2]);
      if (resolved) return resolved;
    } else if (unixMatch) {
      const resolved = resolveEncodedPath('/', unixMatch[1]);
      if (resolved) return resolved;
    }

    // Fallback: last 2 dash-segments joined
    const parts = encoded.split('-').filter((p) => p.length > 0);
    if (parts.length <= 2) return parts.join('/');
    return parts.slice(-2).join('/');
  }
}

export const claudePaths = new ClaudePaths();
