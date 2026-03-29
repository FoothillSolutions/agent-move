import type { AgentState } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { assembleFromLive } from './export/session-export-data.js';
import { formatMarkdown } from './export/markdown-formatter.js';
import { formatJson } from './export/json-formatter.js';

type ExportFormat = 'markdown' | 'json';

/**
 * Session Summary / Export — generates a markdown or JSON report of the current session
 * and copies it to clipboard or downloads as a file.
 *
 * NOTE: innerHTML usage below is safe — all content is static HTML strings with no
 * user-supplied data interpolation. Dynamic content uses textContent.
 */

export class SessionExport {
  private el: HTMLElement;
  private store: StateStore;
  private isOpen = false;
  private format: ExportFormat = 'markdown';
  private _customizationLookup: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null = null;

  constructor(store: StateStore) {
    this.store = store;

    this.el = document.createElement('div');
    this.el.id = 'session-export';
    // Safe: static HTML template with no user data interpolation
    this.el.innerHTML = [ // eslint-disable-line no-unsanitized/property
      '<div class="se-backdrop"></div>',
      '<div class="se-modal">',
      '  <div class="se-header">',
      '    <span class="se-title">Session Summary</span>',
      '    <button class="se-close">&times;</button>',
      '  </div>',
      '  <div class="se-body">',
      '    <pre class="se-content"></pre>',
      '  </div>',
      '  <div class="se-footer">',
      '    <div class="se-format-toggle">',
      '      <button class="se-format-btn active" data-format="markdown">Markdown</button>',
      '      <button class="se-format-btn" data-format="json">JSON</button>',
      '    </div>',
      '    <div class="se-actions">',
      '      <button class="se-copy-btn">Copy to Clipboard</button>',
      '      <button class="se-download-btn">Download .md</button>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('\n');
    document.body.appendChild(this.el);

    this.el.querySelector('.se-backdrop')!.addEventListener('click', () => this.close());
    this.el.querySelector('.se-close')!.addEventListener('click', () => this.close());
    this.el.querySelector('.se-copy-btn')!.addEventListener('click', () => this.copyToClipboard());
    this.el.querySelector('.se-download-btn')!.addEventListener('click', () => this.download());

    // Format toggle buttons
    this.el.querySelectorAll<HTMLButtonElement>('.se-format-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fmt = btn.dataset.format as ExportFormat;
        if (fmt && fmt !== this.format) {
          this.format = fmt;
          this.updateFormatUI();
          this.render();
        }
      });
    });
  }

  setCustomizationLookup(fn: (agent: AgentState) => { displayName: string; colorIndex: number }): void {
    this._customizationLookup = fn;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.isOpen = true;
    this.el.classList.add('open');
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.remove('open');
  }

  private generateReport(): string {
    // Determine root session ID from first agent
    const agents = Array.from(this.store.getAgents().values());
    const rootSessionId = agents[0]?.rootSessionId ?? '';

    const data = assembleFromLive(
      this.store,
      rootSessionId,
      this._customizationLookup ?? undefined,
    );

    return this.format === 'json' ? formatJson(data) : formatMarkdown(data);
  }

  private render(): void {
    const content = this.el.querySelector('.se-content')!;
    content.textContent = this.generateReport();
  }

  private updateFormatUI(): void {
    this.el.querySelectorAll<HTMLButtonElement>('.se-format-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.format === this.format);
    });
    const dlBtn = this.el.querySelector('.se-download-btn') as HTMLButtonElement;
    dlBtn.textContent = this.format === 'json' ? 'Download .json' : 'Download .md';
  }

  private async copyToClipboard(): Promise<void> {
    const report = this.generateReport();
    try {
      await navigator.clipboard.writeText(report);
      const btn = this.el.querySelector('.se-copy-btn') as HTMLButtonElement;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  }

  private download(): void {
    const report = this.generateReport();
    const ext = this.format === 'json' ? 'json' : 'md';
    const mimeType = this.format === 'json' ? 'application/json' : 'text/markdown';
    const blob = new Blob([report], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-move-session-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  dispose(): void {
    this.el.remove();
  }
}
