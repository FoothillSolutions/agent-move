import { homedir } from 'os';
import { join } from 'path';

export const config = {
  port: 3333,
  claudeHome: join(homedir(), '.claude'),
  idleTimeoutMs: 30_000,
  /** How recently a session file must be modified to be considered "active" on startup */
  activeThresholdMs: 10 * 60 * 1000, // 10 minutes
} as const;
