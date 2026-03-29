/**
 * Export Actions — Clipboard copy and file download helpers.
 * Extracted from SessionExport for shared use across export surfaces.
 */

import type { ExportableSession } from './session-export-formatter.js';

/** Copy text to clipboard with textarea fallback */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / non-HTTPS
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
}

/** Download content as a file */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Generate a timestamped export filename */
export function generateExportFilename(session: ExportableSession, format: 'md' | 'json'): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const project = session.projectName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const ext = format === 'md' ? '.md' : '.json';
  return `agentmove-${project}-${timestamp}${ext}`;
}
