import type { SessionSummary, LiveSessionSummary, RecordedSession, RecordedAgent } from '@agent-move/shared';
import { getFunnyName } from '@agent-move/shared';
import { escapeHtml, formatDuration, formatTokens } from '../utils/formatting.js';
import type { StateStore } from '../connection/state-store.js';

/** Resolve display name using the same 3-layer chain as the live view */
function resolveAgentName(ag: RecordedAgent): string {
  try {
    const customs = JSON.parse(localStorage.getItem('agent-customizations') ?? '{}');
    const custom = customs[ag.agentId];
    if (custom?.displayName) return custom.displayName;
  } catch { /* ignore */ }
  return ag.agentName || getFunnyName(ag.agentId);
}
import {
  fetchSessions,
  fetchLiveSessions,
  fetchSession,
  deleteSession,
  updateSessionLabel,
} from '../connection/session-api.js';

/**
 * Session History Panel — lists recorded sessions with expandable detail rows.
 * Allows selecting two sessions for comparison (opens the comparison modal).
 */
export class SessionHistoryPanel {
  private containerEl: HTMLElement;
  private contentEl: HTMLElement;
  private isVisible = false;
  private sessions: SessionSummary[] = [];
  private liveSessions: LiveSessionSummary[] = [];
  private total = 0;
  private selectedIds = new Set<string>();
  private expandedId: string | null = null;
  private expandedSession: RecordedSession | null = null;
  private onCompare: ((idA: string, idB: string) => void) | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private shutdownRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private store: StateStore | null = null;
  private shutdownListener: (() => void) | null = null;

  constructor(parentEl: HTMLElement, store?: StateStore) {
    this.containerEl = parentEl;
    if (store) {
      this.store = store;
      this.shutdownListener = () => {
        // When an agent shuts down, refresh session list shortly after finalization
        if (this.shutdownRefreshTimer) clearTimeout(this.shutdownRefreshTimer);
        this.shutdownRefreshTimer = setTimeout(() => {
          if (this.isVisible) this.loadSessions();
        }, 3_500);
      };
      store.on('agent:shutdown', this.shutdownListener as (data: string) => void);
    }

    this.contentEl = document.createElement('div');
    this.contentEl.id = 'session-history-content';
    this.contentEl.style.display = 'none';
    this.containerEl.appendChild(this.contentEl);
  }

  setCompareHandler(handler: (idA: string, idB: string) => void): void {
    this.onCompare = handler;
  }

  show(): void {
    this.isVisible = true;
    this.contentEl.style.display = '';
    this.loadSessions();
    // Auto-refresh every 10s while visible
    this.refreshTimer = setInterval(() => {
      if (this.isVisible) this.loadSessions();
    }, 10_000);
  }

  hide(): void {
    this.isVisible = false;
    this.contentEl.style.display = 'none';
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async loadSessions(): Promise<void> {
    try {
      const [data, live] = await Promise.all([
        fetchSessions({ limit: 50 }),
        fetchLiveSessions(),
      ]);
      this.sessions = data.sessions;
      this.total = data.total;
      this.liveSessions = live;
      // Remove selections that no longer exist
      const ids = new Set(this.sessions.map(s => s.id));
      for (const id of this.selectedIds) {
        if (!ids.has(id)) this.selectedIds.delete(id);
      }
      if (this.expandedId && !ids.has(this.expandedId)) {
        this.expandedId = null;
        this.expandedSession = null;
      }
      this.render();
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }

  private render(): void {
    const canCompare = this.selectedIds.size === 2;

    const liveSection = this.liveSessions.length > 0 ? `
      <div class="sh-section-title">
        <span class="sh-status-badge sh-status-live"><span class="sh-live-dot"></span>Live</span>
        <span class="sh-section-count">${this.liveSessions.length} active</span>
      </div>
      <div class="sh-list sh-list-live">
        ${this.liveSessions.map(s => this.renderLiveSessionRow(s)).join('')}
      </div>
      <div class="sh-section-divider"></div>
    ` : '';

    this.contentEl.innerHTML = `
      <div class="sh-toolbar">
        <button class="sh-btn sh-compare-btn ${canCompare ? '' : 'disabled'}"
                ${canCompare ? '' : 'disabled'}>
          Compare Selected (${this.selectedIds.size}/2)
        </button>
      </div>

      ${liveSection}

      ${this.sessions.length > 0 && this.liveSessions.length > 0 ? `
        <div class="sh-section-title">
          <span class="sh-status-badge sh-status-recorded">Recorded</span>
          <span class="sh-section-count">${this.total} total</span>
        </div>
      ` : ''}

      ${this.sessions.length === 0
        ? '<div class="sh-empty">No recorded sessions yet. Sessions are automatically recorded when agents shut down.</div>'
        : `<div class="sh-list">
            ${this.sessions.map(s => this.renderSessionRow(s)).join('')}
          </div>`
      }

      ${this.total > this.sessions.length
        ? `<div class="sh-footer">${this.sessions.length} of ${this.total} sessions shown</div>`
        : ''
      }
    `;

    // Wire event handlers
    this.contentEl.querySelector('.sh-compare-btn')?.addEventListener('click', () => {
      if (canCompare) {
        const ids = [...this.selectedIds];
        this.onCompare?.(ids[0], ids[1]);
      }
    });

    // Checkbox handlers
    this.contentEl.querySelectorAll<HTMLInputElement>('.sh-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id!;
        if (cb.checked) {
          if (this.selectedIds.size >= 2) {
            const oldest = this.selectedIds.values().next().value!;
            this.selectedIds.delete(oldest);
          }
          this.selectedIds.add(id);
        } else {
          this.selectedIds.delete(id);
        }
        this.render();
      });
    });

    // Row click -> expand/collapse
    this.contentEl.querySelectorAll<HTMLElement>('.sh-row-main').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id!;
        this.toggleExpand(id);
      });
    });

    // Label edit handlers
    this.contentEl.querySelectorAll<HTMLElement>('.sh-label-edit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id!;
        const current = btn.dataset.label || '';
        const label = prompt('Session label:', current);
        if (label !== null) {
          await updateSessionLabel(id, label || null);
          await this.loadSessions();
        }
      });
    });

    // Delete handlers
    this.contentEl.querySelectorAll<HTMLElement>('.sh-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id!;
        if (confirm('Delete this recorded session?')) {
          await deleteSession(id);
          this.selectedIds.delete(id);
          if (this.expandedId === id) {
            this.expandedId = null;
            this.expandedSession = null;
          }
          await this.loadSessions();
        }
      });
    });
  }

  private async toggleExpand(id: string): Promise<void> {
    if (this.expandedId === id) {
      // Collapse
      this.expandedId = null;
      this.expandedSession = null;
      this.render();
      return;
    }

    this.expandedId = id;
    this.expandedSession = null;
    this.render(); // Re-render with loading state

    try {
      this.expandedSession = await fetchSession(id);
      this.render(); // Re-render with full data
    } catch (err) {
      console.error('Failed to load session detail:', err);
      this.expandedSession = null;
      this.render();
    }
  }

  private renderLiveSessionRow(s: LiveSessionSummary): string {
    const date = new Date(s.startedAt);
    const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const sourceIcon = s.source === 'opencode' ? 'OC' : 'CC';
    const elapsedMs = Date.now() - s.startedAt;

    return `
      <div class="sh-row sh-row-live">
        <div class="sh-row-main">
          <div class="sh-row-header">
            <span class="sh-source-badge">${sourceIcon}</span>
            <span class="sh-project">${escapeHtml(s.projectName)}</span>
          </div>
          <div class="sh-row-meta">
            <span>Started ${timeStr}</span>
            <span class="sh-meta-sep">|</span>
            <span>${formatDuration(elapsedMs)} elapsed</span>
            <span class="sh-meta-sep">|</span>
            <span>${s.agentCount} agent${s.agentCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderSessionRow(s: SessionSummary): string {
    const isSelected = this.selectedIds.has(s.id);
    const isExpanded = this.expandedId === s.id;
    const date = new Date(s.startedAt);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const sourceIcon = s.source === 'opencode' ? 'OC' : 'CC';
    const isRecovered = s.label === '(recovered)';
    const statusBadge = isRecovered
      ? `<span class="sh-status-badge sh-status-recovered">Recovered</span>`
      : `<span class="sh-status-badge sh-status-recorded">Recorded</span>`;
    const labelDisplay = s.label && !isRecovered
      ? `<span class="sh-label">${escapeHtml(s.label)}</span>`
      : '';

    let detailHtml = '';
    if (isExpanded) {
      detailHtml = this.renderSessionDetail(s);
    }

    return `
      <div class="sh-row ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}">
        <div class="sh-row-check">
          <input type="checkbox" class="sh-checkbox" data-id="${s.id}"
                 ${isSelected ? 'checked' : ''} />
        </div>
        <div class="sh-row-main" data-id="${s.id}">
          <div class="sh-row-header">
            <span class="sh-source-badge">${sourceIcon}</span>
            <span class="sh-project">${escapeHtml(s.projectName)}</span>
            ${statusBadge}
            ${labelDisplay}
            <span class="sh-expand-icon">${isExpanded ? '&#9660;' : '&#9654;'}</span>
          </div>
          <div class="sh-row-meta">
            <span>${dateStr} ${timeStr}</span>
            <span class="sh-meta-sep">|</span>
            <span>${formatDuration(s.durationMs)}</span>
            <span class="sh-meta-sep">|</span>
            <span>$${s.totalCost.toFixed(2)}</span>
            <span class="sh-meta-sep">|</span>
            <span>${s.totalToolUses} tools</span>
            <span class="sh-meta-sep">|</span>
            <span>${s.agentCount} agent${s.agentCount !== 1 ? 's' : ''}</span>
          </div>
          ${s.model ? `<div class="sh-row-model">${escapeHtml(s.model)}</div>` : ''}
          ${detailHtml}
        </div>
        <div class="sh-row-actions">
          <button class="sh-label-edit" data-id="${s.id}" data-label="${escapeHtml(s.label || '')}" title="Edit label">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="sh-delete-btn" data-id="${s.id}" title="Delete session">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  private renderSessionDetail(s: SessionSummary): string {
    if (!this.expandedSession) {
      return `<div class="sh-detail"><div class="sh-detail-loading">Loading details...</div></div>`;
    }

    const session = this.expandedSession;
    const agents = session.agents;

    return `
      <div class="sh-detail">
        ${session.model ? `
          <div class="sh-detail-row">
            <span class="sh-detail-label">Model</span>
            <span class="sh-detail-value">${escapeHtml(session.model)}</span>
          </div>
        ` : ''}
        <div class="sh-detail-row">
          <span class="sh-detail-label">Tokens</span>
          <span class="sh-detail-value">${formatTokens(session.totalInputTokens)} in / ${formatTokens(session.totalOutputTokens)} out</span>
        </div>
        <div class="sh-detail-row">
          <span class="sh-detail-label">Cache</span>
          <span class="sh-detail-value">${formatTokens(session.totalCacheReadTokens)} read / ${formatTokens(session.totalCacheCreationTokens)} created</span>
        </div>
        ${agents.length > 0 ? `
          <div class="sh-detail-agents-title">Agents (${agents.length})</div>
          <div class="sh-detail-agents">
            ${agents.map(ag => `
              <div class="sh-detail-agent">
                <div class="sh-detail-agent-name">${escapeHtml(resolveAgentName(ag))}</div>
                <div class="sh-detail-agent-meta">
                  ${ag.model ? `<span>${escapeHtml(ag.model)}</span>` : ''}
                  <span>$${ag.cost.toFixed(3)}</span>
                  <span>${ag.toolUseCount} tools</span>
                  <span>${formatTokens(ag.totalInputTokens + ag.totalOutputTokens)} tok</span>
                  <span>${formatDuration(ag.endedAt - ag.spawnedAt)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  dispose(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.shutdownRefreshTimer) clearTimeout(this.shutdownRefreshTimer);
    if (this.store && this.shutdownListener) {
      this.store.off('agent:shutdown', this.shutdownListener as (data: string) => void);
    }
    this.contentEl.remove();
  }
}
