import { homedir } from 'os';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import type { SessionInfo } from '../types.js';

/**
 * Get the Codex CLI sessions directory.
 * Codex stores sessions at: ~/.codex/sessions/
 */
export function getCodexSessionsDir(): string | null {
  const candidate = join(homedir(), '.codex', 'sessions');
  return existsSync(candidate) ? candidate : null;
}

/**
 * Codex session_meta payload from the first JSONL entry.
 */
export interface CodexSessionMeta {
  session_id: string;
  cwd?: string;
  cli_version?: string;
  model_provider?: string;
  git?: {
    branch?: string;
    commit?: string;
    repo_url?: string;
  };
}

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/**
 * Extract session ID from a Codex rollout filename.
 * Format: rollout-YYYY-MM-DDTHH-MM-SS-{uuid}.jsonl
 * Returns a prefixed session ID.
 */
export function extractCodexSessionId(filePath: string): string {
  const name = basename(filePath, '.jsonl');
  const match = name.match(UUID_RE);
  if (match) {
    return `codex:${match[1]}`;
  }
  return `codex:${name}`;
}

/**
 * Build SessionInfo from a Codex session_meta payload.
 */
export function parseCodexSessionInfo(meta: CodexSessionMeta): SessionInfo {
  const cwd = meta.cwd || 'codex';
  // Extract project name from cwd (last directory component)
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  const projectName = parts[parts.length - 1] || 'codex';

  return {
    agentType: 'codex',
    projectPath: cwd,
    projectName,
    isSubagent: false,
    projectDir: cwd,
    parentSessionId: null,
  };
}

/**
 * Build SessionInfo for a Codex subagent spawned via spawn_agent.
 */
export function createCodexSubagentSession(
  parentSessionId: string,
  parentInfo: SessionInfo,
): SessionInfo {
  return {
    agentType: 'codex',
    projectPath: parentInfo.projectPath,
    projectName: parentInfo.projectName,
    isSubagent: true,
    projectDir: parentInfo.projectDir,
    parentSessionId,
  };
}
