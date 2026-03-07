import { FILE_SESSION_SOURCES } from './file-session-sources.js';

export class SessionScanner {
  /** Find all recently active JSONL session files across supported providers */
  async scan(): Promise<string[]> {
    const perSource = await Promise.all(FILE_SESSION_SOURCES.map((source) => source.scan()));
    return perSource.flat();
  }
}
