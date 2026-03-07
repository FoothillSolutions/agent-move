import chokidar from 'chokidar';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import type { AgentStateManager } from '../state/agent-state-manager.js';
import { config } from '../config.js';
import { JsonlParser } from './jsonl-parser.js';
import type { SessionInfo } from './session-info.js';

const execFileAsync = promisify(execFile);

interface OpenCodeCursor {
  time: number;
  id: string;
}

interface OpenCodeRow {
  id: string;
  session_id: string;
  time_created: number;
  directory: string;
  title: string;
  parent_id: string | null;
  data: string;
}

interface OpenCodeEventRow extends OpenCodeRow {
  kind: 'message' | 'part';
}

export class OpenCodeWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private parser = new JsonlParser();
  private messageCursor: OpenCodeCursor = { time: 0, id: '' };
  private partCursor: OpenCodeCursor = { time: 0, id: '' };
  private pollLock: Promise<void> = Promise.resolve();

  constructor(
    private dbPath: string,
    private stateManager: AgentStateManager,
  ) {}

  async start() {
    if (!existsSync(this.dbPath)) {
      console.log(`OpenCode DB not found at ${this.dbPath} — skipping`);
      return;
    }

    const sqliteOk = await this.checkSqlite();
    if (!sqliteOk) {
      console.log('sqlite3 not available — skipping OpenCode session tracking');
      return;
    }

    const cutoffTime = Date.now() - config.activeThresholdMs;
    this.messageCursor = { time: cutoffTime, id: '' };
    this.partCursor = { time: cutoffTime, id: '' };

    await this.pollInitial();

    const watchPaths = [this.dbPath, `${this.dbPath}-wal`];
    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });
    this.watcher.on('add', () => this.poll());
    this.watcher.on('change', () => this.poll());

    console.log(`Watching OpenCode sessions in ${this.dbPath}`);
  }

  stop() {
    void this.watcher?.close();
  }

  private poll(): void {
    this.pollLock = this.pollLock.then(() => this.pollIncremental()).catch(() => {});
  }

  private async pollInitial(): Promise<void> {
    const cutoff = Date.now() - config.activeThresholdMs;
    const [messages, parts] = await Promise.all([
      this.queryRows(`
        select m.id, m.session_id, m.time_created, s.directory, s.title, s.parent_id, m.data
        from message m
        join session s on s.id = m.session_id
        where s.time_updated >= ${cutoff} and m.time_created >= ${cutoff}
        order by m.time_created asc, m.id asc
      `),
      this.queryRows(`
        select p.id, p.session_id, p.time_created, s.directory, s.title, s.parent_id, p.data
        from part p
        join session s on s.id = p.session_id
        where s.time_updated >= ${cutoff} and p.time_created >= ${cutoff}
        order by p.time_created asc, p.id asc
      `),
    ]);

    this.processRows([
      ...messages.map((row) => ({ ...row, kind: 'message' as const })),
      ...parts.map((row) => ({ ...row, kind: 'part' as const })),
    ]);
  }

  private async pollIncremental(): Promise<void> {
    const [messages, parts] = await Promise.all([
      this.queryRows(`
        select m.id, m.session_id, m.time_created, s.directory, s.title, s.parent_id, m.data
        from message m
        join session s on s.id = m.session_id
        where m.time_created > ${this.messageCursor.time}
          or (m.time_created = ${this.messageCursor.time} and m.id > '${this.escapeSql(this.messageCursor.id)}')
        order by m.time_created asc, m.id asc
      `),
      this.queryRows(`
        select p.id, p.session_id, p.time_created, s.directory, s.title, s.parent_id, p.data
        from part p
        join session s on s.id = p.session_id
        where p.time_created > ${this.partCursor.time}
          or (p.time_created = ${this.partCursor.time} and p.id > '${this.escapeSql(this.partCursor.id)}')
        order by p.time_created asc, p.id asc
      `),
    ]);

    this.processRows([
      ...messages.map((row) => ({ ...row, kind: 'message' as const })),
      ...parts.map((row) => ({ ...row, kind: 'part' as const })),
    ]);
  }

  private processRows(rows: OpenCodeEventRow[]): void {
    rows.sort((a, b) => a.time_created - b.time_created || a.id.localeCompare(b.id));

    for (const row of rows) {
      const sessionInfo: SessionInfo = {
        provider: 'opencode',
        projectPath: row.directory,
        projectName: row.directory.split(/[\\/]/).filter(Boolean).pop() ?? 'Unknown',
        isSubagent: Boolean(row.parent_id),
        projectDir: row.directory,
        parentSessionId: row.parent_id,
      };

      const parsed = row.kind === 'message'
        ? this.parser.parseOpenCodeMessage(row)
        : this.parser.parseOpenCodePart(row);

      if (parsed) {
        this.stateManager.processMessage(row.session_id, parsed, sessionInfo);
      } else {
        this.stateManager.heartbeat(row.session_id);
      }

      const cursor = row.kind === 'message' ? this.messageCursor : this.partCursor;
      cursor.time = row.time_created;
      cursor.id = row.id;
    }
  }

  private async queryRows(sql: string): Promise<OpenCodeRow[]> {
    const { stdout } = await execFileAsync('sqlite3', ['-json', this.dbPath, sql], { timeout: 5000, maxBuffer: config.opencodeMaxBufferBytes });
    const trimmed = stdout.trim();
    if (!trimmed) return [];
    try {
      return JSON.parse(trimmed) as OpenCodeRow[];
    } catch {
      return [];
    }
  }

  private async checkSqlite(): Promise<boolean> {
    try {
      await execFileAsync('sqlite3', ['-version'], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  private escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }
}
