import type { AgentState } from '@agent-move/shared';
import { getFunnyName } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { adaptLiveSession } from '../export/session-data-adapter.js';
import { formatSessionMarkdown, formatSessionJSON } from '../export/session-export-formatter.js';
import { copyToClipboard, downloadFile, generateExportFilename } from '../export/export-actions.js';

/**
 * Session Summary / Export — generates markdown + JSON reports of the current
 * live session, copies to clipboard or downloads as a file.
 *
 * NOTE: This uses innerHTML with static, trusted HTML templates only (no user
 * data is interpolated in the template). All user data is set via textContent.
 */

export class SessionExport {
  private el: HTMLElement;
  private store: StateStore;
  private isOpen = false;
  private _customizationLookup: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null = null;

  constructor(store: StateStore) {
    this.store = store;

    this.el = document.createElement('div');
    this.el.id = 'session-export';
    // Static trusted template — no user data interpolated
    this.el.innerHTML = `
      <div class="se-backdrop"></div>
      <div class="se-modal">
        <div class="se-header">
          <span class="se-title">Session Summary</span>
          <button class="se-close">&times;</button>
        </div>
        <div class="se-body">
          <pre class="se-content"></pre>
        </div>
        <div class="se-footer">
          <button class="se-copy-md-btn">Copy MD</button>
          <button class="se-copy-json-btn">Copy JSON</button>
          <button class="se-download-md-btn">Download .md</button>
          <button class="se-download-json-btn">Download .json</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.el.querySelector('.se-backdrop')!.addEventListener('click', () => this.close());
    this.el.querySelector('.se-close')!.addEventListener('click', () => this.close());
    this.el.querySelector('.se-copy-md-btn')!.addEventListener('click', () => this.copyMarkdown());
    this.el.querySelector('.se-copy-json-btn')!.addEventListener('click', () => this.copyJSON());
    this.el.querySelector('.se-download-md-btn')!.addEventListener('click', () => this.downloadMarkdown());
    this.el.querySelector('.se-download-json-btn')!.addEventListener('click', () => this.downloadJSON());
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

  private getExportableSession() {
    const agents = Array.from(this.store.getAgents().values());
    const resolveName = (agentId: string): string => {
      const agent = this.store.getAgent(agentId);
      if (agent && this._customizationLookup) {
        return this._customizationLookup(agent).displayName;
      }
      return agent?.agentName || getFunnyName(agentId);
    };
    // No shutdown totals or activity entries available in the modal context —
    // the modal shows a snapshot of currently-live agents only.
    return adaptLiveSession(agents, { cost: 0, input: 0, output: 0, tools: 0 }, new Map(), resolveName);
  }

  private render(): void {
    const content = this.el.querySelector('.se-content')!;
    const session = this.getExportableSession();
    // textContent is safe — no HTML injection possible
    content.textContent = formatSessionMarkdown(session);
  }

  private async copyMarkdown(): Promise<void> {
    const session = this.getExportableSession();
    const md = formatSessionMarkdown(session);
    const ok = await copyToClipboard(md);
    if (ok) this.flashButton('.se-copy-md-btn', 'Copied!', 'Copy MD');
  }

  private async copyJSON(): Promise<void> {
    const session = this.getExportableSession();
    const json = JSON.stringify(formatSessionJSON(session), null, 2);
    const ok = await copyToClipboard(json);
    if (ok) this.flashButton('.se-copy-json-btn', 'Copied!', 'Copy JSON');
  }

  private downloadMarkdown(): void {
    const session = this.getExportableSession();
    const md = formatSessionMarkdown(session);
    downloadFile(md, generateExportFilename(session, 'md'), 'text/markdown');
  }

  private downloadJSON(): void {
    const session = this.getExportableSession();
    const json = JSON.stringify(formatSessionJSON(session), null, 2);
    downloadFile(json, generateExportFilename(session, 'json'), 'application/json');
  }

  private flashButton(selector: string, flashText: string, originalText: string): void {
    const btn = this.el.querySelector(selector) as HTMLButtonElement;
    if (btn) {
      btn.textContent = flashText;
      setTimeout(() => { btn.textContent = originalText; }, 2000);
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
