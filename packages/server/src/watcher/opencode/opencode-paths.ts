import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import type { SessionInfo } from '../types.js';

/**
 * Find the OpenCode SQLite database file.
 * OpenCode stores everything in a single DB at:
 *   Linux/Mac: ~/.local/share/opencode/opencode.db
 *   Windows:   same path (OpenCode uses XDG even on Windows)
 */
export function getOpenCodeDbPath(): string | null {
  const home = homedir();
  const candidates: string[] = [
    join(home, '.local', 'share', 'opencode', 'opencode.db'),
    // Windows fallback via LOCALAPPDATA
    ...(process.env.LOCALAPPDATA
      ? [join(process.env.LOCALAPPDATA, 'opencode', 'opencode.db')]
      : []),
    join(home, '.opencode', 'opencode.db'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export interface OpenCodeSessionRow {
  id: string;
  directory: string;
  parent_id: string | null;
  title: string;
  project_id: string;
}

/**
 * Convert an OpenCode session DB row into the shared SessionInfo format.
 */
export function parseOpenCodeSession(row: OpenCodeSessionRow): SessionInfo {
  const segments = row.directory.replace(/\\/g, '/').split('/').filter(Boolean);
  const projectName = segments[segments.length - 1] || 'opencode';

  return {
    agentType: 'opencode',
    // Use the actual directory as projectPath so getGitBranch() gets a valid cwd.
    // projectDir uses the project_id hash to group agents belonging to the same project.
    projectPath: row.directory || row.project_id,
    projectName,
    isSubagent: !!row.parent_id,
    projectDir: row.project_id,
    parentSessionId: row.parent_id ? `oc:${row.parent_id}` : null,
  };
}
