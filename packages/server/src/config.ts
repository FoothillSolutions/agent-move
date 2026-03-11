import { homedir } from 'os';
import { join } from 'path';

export const config = {
  port: parseInt(process.env.AGENT_MOVE_PORT || '3333', 10),
  claudeHome: join(homedir(), '.claude'),
  idleTimeoutMs: 45_000,
  /** How long after going idle before an agent is automatically shutdown/removed */
  shutdownTimeoutMs: 30 * 60 * 1000, // 30 minutes
  /** How recently a session file must be modified to be considered "active" on startup */
  activeThresholdMs: 10 * 60 * 1000, // 10 minutes
  /** Enable OpenCode session watching (auto-detected if storage dir exists) */
  enableOpenCode: process.env.AGENT_MOVE_OPENCODE !== 'false',
  /** Enable pi coding agent session watching (auto-detected if sessions dir exists) */
  enablePi: process.env.AGENT_MOVE_PI !== 'false',
} as const;
