/**
 * JSON formatter for session export data.
 * Outputs the full structured data as pretty-printed JSON.
 */

import type { SessionExportData } from './session-export-data.js';

export function formatJson(data: SessionExportData): string {
  return JSON.stringify(data, null, 2);
}
