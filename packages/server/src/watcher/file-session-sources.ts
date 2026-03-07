import { stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, join, relative } from 'path';
import { config } from '../config.js';
import { claudePaths } from './claude-paths.js';
import type { SessionInfo, SessionProvider } from './session-info.js';

export interface FileSessionSource {
  provider: SessionProvider;
  rootDir: string;
  watchPattern: string;
  scan(): Promise<string[]>;
  parseSessionPath(filePath: string): SessionInfo;
  getSessionId(filePath: string): string;
}

async function walkRecentJsonl(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  const now = Date.now();

  async function visit(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      try {
        const fileStat = await stat(fullPath);
        if (now - fileStat.mtimeMs < config.activeThresholdMs) {
          results.push(fullPath);
        }
      } catch {
        // Ignore files that disappear mid-scan.
      }
    }
  }

  if (!existsSync(rootDir)) return [];
  await visit(rootDir);
  results.sort();
  return results;
}

async function scanClaudeSessions(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const projects = await readdir(rootDir);
    const now = Date.now();

    for (const project of projects) {
      const projectDir = join(rootDir, project);
      try {
        const projectStat = await stat(projectDir);
        if (!projectStat.isDirectory()) continue;

        const files = await readdir(projectDir);
        let newestFile: string | null = null;
        let newestMtime = 0;

        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue;
          const filePath = join(projectDir, file);
          try {
            const fileStat = await stat(filePath);
            if (now - fileStat.mtimeMs < config.activeThresholdMs && fileStat.mtimeMs > newestMtime) {
              newestMtime = fileStat.mtimeMs;
              newestFile = filePath;
            }
          } catch {
            // Ignore unreadable files.
          }
        }

        if (newestFile) results.push(newestFile);
      } catch {
        // Ignore unreadable project directories.
      }
    }
  } catch {
    return [];
  }

  return results.sort();
}

function decodePiProjectName(encodedDir: string): string {
  const trimmed = encodedDir.replace(/^--/, '').replace(/--$/, '');
  const parts = trimmed.split('-').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : 'Unknown';
}

function parsePiSessionPath(filePath: string): SessionInfo {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const sessionsIdx = parts.lastIndexOf('sessions');
  const encodedDir = sessionsIdx >= 0 && sessionsIdx + 1 < parts.length ? parts[sessionsIdx + 1] : 'unknown';

  return {
    provider: 'pi',
    projectPath: encodedDir,
    projectName: decodePiProjectName(encodedDir),
    isSubagent: false,
    projectDir: encodedDir,
    parentSessionId: null,
  };
}

function parseCodexSessionPath(filePath: string, rootDir: string): SessionInfo {
  const rel = relative(rootDir, filePath);
  const topDir = rel.split(/[\\/]/, 1)[0] || 'unknown';
  return {
    provider: 'codex',
    projectPath: 'unknown',
    projectName: topDir,
    isSubagent: false,
    projectDir: basename(filePath, '.jsonl'),
    parentSessionId: null,
  };
}

function extractTrailingUuid(filePath: string): string {
  const base = basename(filePath, '.jsonl');
  const match = base.match(/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i);
  return match?.[1] ?? base;
}

const claudeProjectsDir = join(config.claudeHome, 'projects');
const codexSessionsDir = join(config.codexHome, 'sessions');
const piSessionsDir = join(config.piHome, 'agent', 'sessions');

export const FILE_SESSION_SOURCES: FileSessionSource[] = [
  {
    provider: 'claude',
    rootDir: claudeProjectsDir,
    watchPattern: join(claudeProjectsDir, '**', '*.jsonl'),
    scan: () => scanClaudeSessions(claudeProjectsDir),
    parseSessionPath: (filePath) => claudePaths.parseSessionPath(filePath),
    getSessionId: (filePath) => basename(filePath, '.jsonl'),
  },
  {
    provider: 'codex',
    rootDir: codexSessionsDir,
    watchPattern: join(codexSessionsDir, '**', '*.jsonl'),
    scan: () => walkRecentJsonl(codexSessionsDir),
    parseSessionPath: (filePath) => parseCodexSessionPath(filePath, codexSessionsDir),
    getSessionId: (filePath) => extractTrailingUuid(filePath),
  },
  {
    provider: 'pi',
    rootDir: piSessionsDir,
    watchPattern: join(piSessionsDir, '**', '*.jsonl'),
    scan: () => walkRecentJsonl(piSessionsDir),
    parseSessionPath: (filePath) => parsePiSessionPath(filePath),
    getSessionId: (filePath) => extractTrailingUuid(filePath),
  },
];

export function getFileSessionSource(filePath: string): FileSessionSource | null {
  const normalized = filePath.replace(/\\/g, '/');
  for (const source of FILE_SESSION_SOURCES) {
    const root = source.rootDir.replace(/\\/g, '/');
    if (normalized.startsWith(root + '/') || normalized === root) {
      return source;
    }
  }
  return null;
}
