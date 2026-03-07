export type SessionProvider = 'claude' | 'codex' | 'pi' | 'opencode';

export interface SessionInfo {
  provider: SessionProvider;
  projectPath: string;
  projectName: string;
  isSubagent: boolean;
  /** Stable directory/session grouping key shared by related sessions */
  projectDir: string;
  /** The parent session ID when the provider exposes one */
  parentSessionId: string | null;
}
