import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import type { SessionInfo } from '../types.js';
import { resolveEncodedPath } from '../path-utils.js';

/**
 * Get the pi agent sessions directory.
 * Pi stores sessions at: ~/.pi/agent/sessions/
 */
export function getPiSessionsDir(): string | null {
  const candidate = join(homedir(), '.pi', 'agent', 'sessions');
  return existsSync(candidate) ? candidate : null;
}

/**
 * Decode pi's encoded working directory path.
 * Pi encodes paths as: --{path-with-slashes-replaced-by-dashes}--
 * e.g., --home-user-project-- or --D--work-fts-agent-move--
 */
export function decodePiProjectDir(encoded: string): string {
  // Strip the double-dash wrapping
  let inner = encoded;
  if (inner.startsWith('--') && inner.endsWith('--')) {
    inner = inner.slice(2, -2);
  }

  // Windows: drive letter e.g. "D--work-fts"
  const driveMatch = inner.match(/^([A-Za-z])--(.*)/);
  if (driveMatch) {
    const resolved = resolveEncodedPath(driveMatch[1] + ':/', driveMatch[2]);
    if (resolved) return resolved;
  } else {
    // Unix: e.g. "home-user-project"
    const resolved = resolveEncodedPath('/', inner);
    if (resolved) return resolved;
  }

  // Fallback: take the last non-empty segment
  const parts = inner.split('-').filter(Boolean);
  if (parts.length <= 2) return parts.join('/');
  return parts.slice(-2).join('-');
}

/**
 * Parse a pi session JSONL header to extract session info.
 */
export interface PiSessionHeader {
  type: 'session';
  version: number;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}

/**
 * Build SessionInfo from a pi session header and the directory name.
 */
export function parsePiSessionInfo(
  header: PiSessionHeader,
  dirName: string,
): SessionInfo {
  const projectName = decodePiProjectDir(dirName);

  return {
    agentType: 'pi',
    projectPath: header.cwd || dirName,
    projectName,
    isSubagent: !!header.parentSession,
    projectDir: dirName,
    parentSessionId: header.parentSession
      ? extractSessionIdFromPath(header.parentSession)
      : null,
  };
}

/**
 * Extract the session UUID from a pi session file path.
 * Path format: .../{timestamp}_{uuid}.jsonl
 */
function extractSessionIdFromPath(filePath: string): string | null {
  const match = filePath.match(/([^/\\]+)\.jsonl$/);
  if (!match) return null;
  const parts = match[1].split('_');
  const uuid = parts[parts.length - 1];
  return uuid ? `pi:${uuid}` : null;
}
