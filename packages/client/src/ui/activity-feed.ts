import type { AgentState, PendingPermission, AnomalyEvent } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';

interface FeedEntry {
  timestamp: number;
  html: string;
  kind: string;
  agentName: string;
  rawText: string;
}

const MAX_ENTRIES = 200;
const FILTER_KINDS = ['all', 'spawn', 'tool', 'idle', 'shutdown', 'permission', 'anomaly', 'task'] as const;
const DEBOUNCE_MS = 200;

/**
 * ActivityFeed — scrollable event feed with all hook/lifecycle events.
 * Supplements the zone visualization with a textual timeline.
 * Supports search, event-type filtering, and agent filtering.
 */
export class ActivityFeed {
  private container: HTMLElement;
  private toolbarEl: HTMLElement;
  private searchInput: HTMLInputElement;
  private filtersEl: HTMLElement;
  private agentSelect: HTMLSelectElement;
  private clearBtn: HTMLButtonElement;
  private listEl: HTMLElement;
  private store: StateStore;
  private entries: FeedEntry[] = [];
  private visible = false;
  private autoScroll = true;
  private _customizationLookup: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null = null;

  setCustomizationLookup(lookup: (agent: AgentState) => { displayName: string; colorIndex: number }): void {
    this._customizationLookup = lookup;
  }

  // Filter state
  private searchQuery = '';
  private activeKind: string = 'all';
  private activeAgent: string = '';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  // Store listener references for cleanup
  private boundListeners: Array<{ event: string; fn: (...args: any[]) => void }> = [];

  constructor(store: StateStore, parentEl: HTMLElement) {
    this.store = store;

    this.container = document.createElement('div');
    this.container.id = 'activity-feed';
    this.container.style.display = 'none';
    parentEl.appendChild(this.container);

    // --- Toolbar ---
    this.toolbarEl = document.createElement('div');
    this.toolbarEl.className = 'feed-toolbar';
    this.container.appendChild(this.toolbarEl);

    // Search input
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.className = 'feed-search';
    this.searchInput.placeholder = 'Search feed\u2026';
    this.searchInput.addEventListener('input', () => this.onSearchInput());
    this.toolbarEl.appendChild(this.searchInput);

    // Filter chips
    this.filtersEl = document.createElement('div');
    this.filtersEl.className = 'feed-filters';
    for (const kind of FILTER_KINDS) {
      const chip = document.createElement('button');
      chip.className = `feed-chip${kind === 'all' ? ' active' : ''}`;
      chip.textContent = kind.charAt(0).toUpperCase() + kind.slice(1);
      chip.dataset.kind = kind;
      chip.addEventListener('click', () => this.onChipClick(kind));
      this.filtersEl.appendChild(chip);
    }
    this.toolbarEl.appendChild(this.filtersEl);

    // Agent dropdown
    this.agentSelect = document.createElement('select');
    this.agentSelect.className = 'feed-agent-select';
    this.agentSelect.innerHTML = '<option value="">All Agents</option>';
    this.agentSelect.addEventListener('change', () => {
      this.activeAgent = this.agentSelect.value;
      this.applyFilters();
    });
    this.toolbarEl.appendChild(this.agentSelect);

    // Clear filters button
    this.clearBtn = document.createElement('button');
    this.clearBtn.className = 'feed-chip';
    this.clearBtn.textContent = 'Clear';
    this.clearBtn.addEventListener('click', () => this.clearFilters());
    this.toolbarEl.appendChild(this.clearBtn);

    // --- Feed list ---
    this.listEl = document.createElement('div');
    this.listEl.className = 'feed-list';
    this.container.appendChild(this.listEl);

    // Track scroll position for auto-scroll
    this.listEl.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this.listEl;
      this.autoScroll = scrollHeight - scrollTop - clientHeight < 40;
    });

    // Bind events (track for cleanup)
    const on = (event: string, fn: (...args: any[]) => void) => {
      store.on(event as any, fn);
      this.boundListeners.push({ event, fn });
    };
    on('state:reset', (agents: Map<string, AgentState>) => {
      for (const [, a] of agents) {
        this.add('spawn', this.agentHtml(a, 'connected'), this.name(a));
      }
      this.refreshAgentDropdown();
    });
    on('agent:spawn', (a: AgentState) => this.add('spawn', this.agentHtml(a, 'spawned'), this.name(a)));
    on('agent:update', (a: AgentState) => {
      if (a.currentTool) {
        this.add(
          'tool',
          `<span class="feed-name">${this.esc(this.name(a))}</span> using <strong>${this.esc(a.currentTool)}</strong>${a.currentActivity ? ` — <span class="feed-dim">${this.esc(a.currentActivity.slice(0, 60))}</span>` : ''}`,
          this.name(a),
        );
      }
    });
    on('agent:idle', (a: AgentState) => this.add('idle', this.agentHtml(a, 'idle'), this.name(a)));
    on('agent:shutdown', (id: string) => this.add('shutdown', `Agent <span class="feed-dim">${this.esc(id.slice(0, 10))}</span> shut down`, id));
    on('permission:request', (p: PendingPermission) => this.add('permission', `\u{1F512} Permission request: <strong>${this.esc(p.toolName)}</strong>`, ''));
    on('permission:resolved', ({ permissionId, decision }: { permissionId: string; decision: string }) => this.add('permission', `\u{1F513} Permission ${decision}: <span class="feed-dim">${this.esc(permissionId.slice(0, 8))}</span>`, ''));
    on('anomaly:alert', (a: AnomalyEvent) => this.add('anomaly', `\u26A0\uFE0F ${this.esc(a.agentName)}: ${this.esc(a.message)}`, a.agentName));
    on('task:completed', ({ taskSubject }: { taskSubject: string }) => this.add('task', `\u2705 Task completed: ${this.esc(taskSubject)}`, ''));
    on('hooks:status', () => this.add('hooks', 'Hook event received', ''));
  }

  show(): void {
    this.visible = true;
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.refreshAgentDropdown();
    this.applyFilters();
  }

  hide(): void {
    this.visible = false;
    this.container.style.display = 'none';
  }

  private add(kind: string, html: string, agentName: string): void {
    // Strip HTML tags to produce searchable raw text
    const rawText = html.replace(/<[^>]*>/g, '');
    this.entries.push({ timestamp: Date.now(), html, kind, agentName, rawText });
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    if (this.visible) {
      const entry = this.entries[this.entries.length - 1];
      if (this.matchesFilters(entry)) {
        this.appendEntry(entry);
      }
    }
  }

  private matchesFilters(entry: FeedEntry): boolean {
    if (this.activeKind !== 'all' && entry.kind !== this.activeKind) return false;
    if (this.activeAgent && entry.agentName !== this.activeAgent) return false;
    if (this.searchQuery && !entry.rawText.toLowerCase().includes(this.searchQuery)) return false;
    return true;
  }

  private appendEntry(entry: FeedEntry): void {
    const el = document.createElement('div');
    el.className = `feed-entry feed-${entry.kind}`;
    let displayHtml = entry.html;
    if (this.searchQuery) {
      displayHtml = this.highlightHtml(displayHtml, this.searchQuery);
    }
    el.innerHTML = `<span class="feed-time">${this.formatTime(entry.timestamp)}</span> ${displayHtml}`;
    this.listEl.appendChild(el);

    // Trim DOM
    while (this.listEl.children.length > MAX_ENTRIES) {
      this.listEl.removeChild(this.listEl.firstChild!);
    }

    if (this.autoScroll) {
      this.listEl.scrollTop = this.listEl.scrollHeight;
    }
  }

  /**
   * Highlights search matches in HTML content by wrapping matched text
   * segments in <mark> tags. Only highlights text outside of HTML tags.
   */
  private highlightHtml(html: string, query: string): string {
    // Split on HTML tags to avoid highlighting inside tags
    const parts = html.split(/(<[^>]*>)/);
    const lowerQuery = query.toLowerCase();
    for (let i = 0; i < parts.length; i++) {
      // Only process text nodes (odd indices are tags)
      if (i % 2 === 0 && parts[i]) {
        parts[i] = this.highlightText(parts[i], lowerQuery);
      }
    }
    return parts.join('');
  }

  private highlightText(text: string, lowerQuery: string): string {
    const lowerText = text.toLowerCase();
    let result = '';
    let lastIndex = 0;
    let idx = lowerText.indexOf(lowerQuery, lastIndex);
    while (idx !== -1) {
      result += text.slice(lastIndex, idx);
      result += `<mark>${text.slice(idx, idx + lowerQuery.length)}</mark>`;
      lastIndex = idx + lowerQuery.length;
      idx = lowerText.indexOf(lowerQuery, lastIndex);
    }
    result += text.slice(lastIndex);
    return result;
  }

  private applyFilters(): void {
    this.listEl.innerHTML = '';
    for (const entry of this.entries) {
      if (this.matchesFilters(entry)) {
        const el = document.createElement('div');
        el.className = `feed-entry feed-${entry.kind}`;
        let displayHtml = entry.html;
        if (this.searchQuery) {
          displayHtml = this.highlightHtml(displayHtml, this.searchQuery);
        }
        el.innerHTML = `<span class="feed-time">${this.formatTime(entry.timestamp)}</span> ${displayHtml}`;
        this.listEl.appendChild(el);
      }
    }
    if (this.autoScroll) {
      this.listEl.scrollTop = this.listEl.scrollHeight;
    }
  }

  private onSearchInput(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.searchQuery = this.searchInput.value.trim().toLowerCase();
      this.applyFilters();
    }, DEBOUNCE_MS);
  }

  private onChipClick(kind: string): void {
    this.activeKind = kind;
    // Update active class on chips
    const chips = this.filtersEl.querySelectorAll('.feed-chip');
    chips.forEach((chip) => {
      const el = chip as HTMLElement;
      el.classList.toggle('active', el.dataset.kind === kind);
    });
    this.applyFilters();
  }

  private clearFilters(): void {
    this.searchQuery = '';
    this.searchInput.value = '';
    this.activeKind = 'all';
    this.activeAgent = '';
    this.agentSelect.value = '';

    // Reset chip active states
    const chips = this.filtersEl.querySelectorAll('.feed-chip');
    chips.forEach((chip) => {
      const el = chip as HTMLElement;
      el.classList.toggle('active', el.dataset.kind === 'all');
    });

    this.applyFilters();
  }

  private refreshAgentDropdown(): void {
    const agents = this.store.getAgents();
    const currentValue = this.agentSelect.value;
    this.agentSelect.innerHTML = '<option value="">All Agents</option>';
    const seen = new Set<string>();
    for (const [, agent] of agents) {
      const name = agent.agentName || agent.projectName || agent.sessionId.slice(0, 10);
      if (!seen.has(name)) {
        seen.add(name);
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        this.agentSelect.appendChild(option);
      }
    }
    // Also include agent names from entries that may have already shut down
    for (const entry of this.entries) {
      if (entry.agentName && !seen.has(entry.agentName)) {
        seen.add(entry.agentName);
        const option = document.createElement('option');
        option.value = entry.agentName;
        option.textContent = entry.agentName;
        this.agentSelect.appendChild(option);
      }
    }
    // Restore selection if still valid
    if (currentValue) {
      this.agentSelect.value = currentValue;
      if (!this.agentSelect.value) {
        this.activeAgent = '';
      }
    }
  }

  private agentHtml(a: AgentState, verb: string): string {
    return `<span class="feed-name">${this.esc(this.name(a))}</span> ${verb}`;
  }

  private name(a: AgentState): string {
    if (this._customizationLookup) {
      return this._customizationLookup(a).displayName;
    }
    return a.agentName || a.projectName || a.sessionId.slice(0, 10);
  }

  private formatTime(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    for (const { event, fn } of this.boundListeners) {
      this.store.off(event as any, fn);
    }
    this.boundListeners = [];
    this.container.remove();
  }
}
