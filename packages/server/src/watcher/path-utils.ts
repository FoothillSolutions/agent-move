import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Greedily resolve a dash-separated encoded path against the filesystem.
 * Handles folder names containing dashes by trying multi-segment joins.
 *
 * @param root - The filesystem root (e.g. '/' or 'D:/')
 * @param segments - Dash-separated path segments (e.g. 'work-fts-agent-move')
 * @returns The last matched folder name, or null if nothing resolved
 */
export function resolveEncodedPath(root: string, segments: string): string | null {
  try {
    const parts = segments.split('-').filter(Boolean);
    let currentPath = root;
    let lastName = '';
    let i = 0;

    while (i < parts.length) {
      let found = false;
      const maxLen = Math.min(parts.length - i, 6);

      for (let len = 1; len <= maxLen; len++) {
        const segment = parts.slice(i, i + len).join('-');

        for (const prefix of ['', '.']) {
          const testPath = join(currentPath, prefix + segment);
          if (existsSync(testPath)) {
            currentPath = testPath;
            lastName = prefix + segment;
            i += len;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) break;
    }

    return lastName || null;
  } catch {
    return null;
  }
}
