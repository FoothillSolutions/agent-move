import { homedir } from 'os';
import { join } from 'path';

export const config = {
  port: parseInt(process.env.AGENT_MOVE_PORT || '3333', 10),
  claudeHome: join(homedir(), '.claude'),
  idleTimeoutMs: 15_000,
  /** How long after going idle before an agent is automatically shutdown/removed */
  shutdownTimeoutMs: 10 * 60 * 1000, // 10 minutes
  /** How recently a session file must be modified to be considered "active" on startup */
  activeThresholdMs: 10 * 60 * 1000, // 10 minutes
} as const;
