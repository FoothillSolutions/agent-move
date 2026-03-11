import type { AgentState, ZoneId } from '@agent-move/shared';
import { ZONES, ZONE_MAP } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { escapeHtml } from '../utils/formatting.js';

/**
 * Feature 2a: Command Palette (Cmd+K / Ctrl+K)
 * Quick-action overlay with fuzzy search for navigating agents,
 * zones, toggling features, and jumping in the timeline.
 */

export interface CommandAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: 'agent' | 'zone' | 'view' | 'audio' | 'feature';
  action: () => void;
}

type CommandCallback = (action: string, payload?: any) => void;

export class CommandPalette {
  private el: HTMLElement;
  private inputEl: HTMLInputElement;
  private listEl: HTMLElement;
  private isOpen = false;
  private actions: CommandAction[] = [];
  private filteredActions: CommandAction[] = [];
  private selectedIndex = 0;
  private onCommand: CommandCallback;
  private _customizationLookup: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null = null;

  /** Set a lookup function to resolve customized display name + color from agent state */
  setCustomizationLookup(lookup: (agent: AgentState) => { displayName: string; colorIndex: number }): void {
    this._customizationLookup = lookup;
  }

  // Bound event handler (stored for cleanup)
  private globalKeydownHandler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      this.toggle();
    }
  };

  constructor(private store: StateStore, onCommand: CommandCallback) {
    this.onCommand = onCommand;

    // Create palette DOM
    this.el = document.createElement('div');
    this.el.id = 'command-palette';
    this.el.innerHTML = `
      <div class="cmd-backdrop"></div>
      <div class="cmd-modal">
        <div class="cmd-input-wrap">
          <span class="cmd-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" opacity="0.5"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></span>
          <input type="text" class="cmd-input" placeholder="Search commands, agents, zones\u2026" autocomplete="off" />
          <kbd class="cmd-kbd">ESC</kbd>
        </div>
        <div class="cmd-list"></div>
        <div class="cmd-footer">
          <span><kbd>&uarr;&darr;</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Select</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.inputEl = this.el.querySelector('.cmd-input')! as HTMLInputElement;
    this.listEl = this.el.querySelector('.cmd-list')!;

    // Events
    this.el.querySelector('.cmd-backdrop')!.addEventListener('click', () => this.close());
    this.inputEl.addEventListener('input', () => this.onFilter());
    this.inputEl.addEventListener('keydown', (e) => this.onKeyDown(e));

    // Global shortcut
    document.addEventListener('keydown', this.globalKeydownHandler);

    // Build static actions
    this.buildActions();
  }

  private buildActions(): void {
    this.actions = [];

    // Zone focus commands
    for (const zone of ZONES) {
      this.actions.push({
        id: `zone:${zone.id}`,
        label: `Go to ${zone.label}`,
        description: zone.description,
        icon: zone.icon,
        category: 'zone',
        action: () => this.onCommand('focus-zone', zone.id),
      });
    }

    // View commands
    this.actions.push({
      id: 'view:reset',
      label: 'Reset Camera',
      description: 'Fit all zones in view',
      icon: '🔲',
      category: 'view',
      action: () => this.onCommand('reset-camera'),
    });
    this.actions.push({
      id: 'view:zoom-in',
      label: 'Zoom In',
      description: 'Zoom into the scene',
      icon: '🔍',
      category: 'view',
      action: () => this.onCommand('zoom-in'),
    });
    this.actions.push({
      id: 'view:zoom-out',
      label: 'Zoom Out',
      description: 'Zoom out of the scene',
      icon: '🔎',
      category: 'view',
      action: () => this.onCommand('zoom-out'),
    });

    // Audio commands
    this.actions.push({
      id: 'audio:mute',
      label: 'Toggle Sound',
      description: 'Mute or unmute sound effects',
      icon: '🔊',
      category: 'audio',
      action: () => this.onCommand('toggle-mute'),
    });

    // Feature toggles
    this.actions.push({
      id: 'feature:heatmap',
      label: 'Toggle Heatmap',
      description: 'Show/hide zone activity heatmap',
      icon: '🌡',
      category: 'feature',
      action: () => this.onCommand('toggle-heatmap'),
    });
    this.actions.push({
      id: 'feature:analytics',
      label: 'Open Analytics',
      description: 'Show cost tracker & analytics dashboard',
      icon: '📊',
      category: 'feature',
      action: () => this.onCommand('toggle-analytics'),
    });
    this.actions.push({
      id: 'feature:timeline-live',
      label: 'Jump to Live',
      description: 'Return timeline to live mode',
      icon: '🟢',
      category: 'feature',
      action: () => this.onCommand('timeline-live'),
    });
    this.actions.push({
      id: 'feature:shortcuts',
      label: 'Keyboard Shortcuts',
      description: 'Show all keyboard shortcuts (?)',
      icon: '⌨',
      category: 'feature',
      action: () => this.onCommand('toggle-shortcuts'),
    });
    this.actions.push({
      id: 'feature:focus',
      label: 'Toggle Focus Mode',
      description: 'Camera follows selected agent (F)',
      icon: '🎯',
      category: 'feature',
      action: () => this.onCommand('toggle-focus'),
    });
    this.actions.push({
      id: 'feature:export',
      label: 'Export Session Summary',
      description: 'Generate session report (E)',
      icon: '📋',
      category: 'feature',
      action: () => this.onCommand('session-export'),
    });

    // New features
    this.actions.push({
      id: 'feature:trails',
      label: 'Toggle Agent Trails',
      description: 'Show movement trail dots (T)',
      icon: '✨',
      category: 'feature',
      action: () => this.onCommand('toggle-trails'),
    });
    this.actions.push({
      id: 'feature:daynight',
      label: 'Toggle Day/Night Cycle',
      description: 'Real-time lighting overlay (N)',
      icon: '🌙',
      category: 'feature',
      action: () => this.onCommand('toggle-daynight'),
    });
    this.actions.push({
      id: 'feature:minimap',
      label: 'Toggle Mini-map',
      description: 'Overview navigation map (`)',
      icon: '🗺',
      category: 'feature',
      action: () => this.onCommand('toggle-minimap'),
    });
    this.actions.push({
      id: 'feature:leaderboard',
      label: 'Toggle Leaderboard',
      description: 'Agent performance rankings (L)',
      icon: '🏆',
      category: 'feature',
      action: () => this.onCommand('toggle-leaderboard'),
    });
    this.actions.push({
      id: 'feature:theme',
      label: 'Cycle Theme',
      description: 'Switch between Office, Space, Castle, Cyberpunk',
      icon: '🎨',
      category: 'feature',
      action: () => this.onCommand('cycle-theme'),
    });
    this.actions.push({
      id: 'feature:toolchain',
      label: 'Toggle Tool Chains',
      description: 'Tool usage stats and transition graph (C)',
      icon: '🔗',
      category: 'feature',
      action: () => this.onCommand('toggle-toolchain'),
    });
    this.actions.push({
      id: 'feature:taskgraph',
      label: 'Toggle Task Graph',
      description: 'Visualize task dependencies (G)',
      icon: '📋',
      category: 'feature',
      action: () => this.onCommand('toggle-taskgraph'),
    });
    this.actions.push({
      id: 'feature:activity',
      label: 'Toggle Activity Feed',
      description: 'Scrollable event timeline (V)',
      icon: '📜',
      category: 'feature',
      action: () => this.onCommand('toggle-activity'),
    });
    this.actions.push({
      id: 'feature:waterfall',
      label: 'Toggle Waterfall View',
      description: 'Tool call trace timeline (W)',
      icon: '📊',
      category: 'feature',
      action: () => this.onCommand('toggle-waterfall'),
    });
    this.actions.push({
      id: 'feature:graph',
      label: 'Toggle Agent Graph',
      description: 'Agent relationship visualization (R)',
      icon: '🔗',
      category: 'feature',
      action: () => this.onCommand('toggle-graph'),
    });
    this.actions.push({
      id: 'feature:settings',
      label: 'Open Settings',
      description: 'Sound, notifications, cost alerts, display (S)',
      icon: '⚙',
      category: 'feature',
      action: () => this.onCommand('toggle-settings'),
    });
  }

  /** Dynamically add agent-specific actions */
  private getAgentActions(): CommandAction[] {
    const agents = Array.from(this.store.getAgents().values());
    return agents.map((agent) => {
      const custom = this._customizationLookup?.(agent);
      const name = custom?.displayName || agent.agentName || agent.projectName || agent.sessionId.slice(0, 10);
      return {
        id: `agent:${agent.id}`,
        label: `Focus: ${name}`,
        description: `${agent.isIdle ? 'Idle' : 'Active'} in ${ZONE_MAP.get(agent.currentZone)?.label ?? agent.currentZone}`,
        icon: agent.isIdle ? '💤' : '🤖',
        category: 'agent' as const,
        action: () => this.onCommand('focus-agent', agent.id),
      };
    });
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.isOpen = true;
    this.el.classList.add('open');
    this.inputEl.value = '';
    this.selectedIndex = 0;
    this.onFilter();
    // Focus input after animation
    requestAnimationFrame(() => this.inputEl.focus());
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.remove('open');
  }

  dispose(): void {
    document.removeEventListener('keydown', this.globalKeydownHandler);
    this.el.remove();
  }

  private onFilter(): void {
    const query = this.inputEl.value.toLowerCase().trim();
    const allActions = [...this.actions, ...this.getAgentActions()];

    if (!query) {
      this.filteredActions = allActions;
    } else {
      this.filteredActions = allActions.filter((a) =>
        a.label.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query) ||
        a.category.includes(query)
      );
    }

    this.selectedIndex = 0;
    this.renderList();
  }

  private renderList(): void {
    if (this.filteredActions.length === 0) {
      this.listEl.innerHTML = '<div class="cmd-empty">No matching commands</div>';
      return;
    }

    this.listEl.innerHTML = this.filteredActions.map((action, i) => {
      const selected = i === this.selectedIndex ? 'selected' : '';
      const catClass = `cmd-cat-${action.category}`;
      return `<div class="cmd-item ${selected} ${catClass}" data-index="${i}">
        <span class="cmd-item-icon">${action.icon}</span>
        <div class="cmd-item-text">
          <div class="cmd-item-label">${escapeHtml(action.label)}</div>
          <div class="cmd-item-desc">${escapeHtml(action.description)}</div>
        </div>
        <span class="cmd-item-cat">${action.category}</span>
      </div>`;
    }).join('');

    // Click handlers
    this.listEl.querySelectorAll('.cmd-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt((el as HTMLElement).dataset.index!, 10);
        this.executeAction(idx);
      });
      el.addEventListener('mouseenter', () => {
        this.selectedIndex = parseInt((el as HTMLElement).dataset.index!, 10);
        this.updateSelection();
      });
    });
  }

  private updateSelection(): void {
    this.listEl.querySelectorAll('.cmd-item').forEach((el, i) => {
      el.classList.toggle('selected', i === this.selectedIndex);
    });
    // Scroll into view
    const selected = this.listEl.querySelector('.cmd-item.selected');
    selected?.scrollIntoView({ block: 'nearest' });
  }

  private onKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredActions.length - 1);
        this.updateSelection();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection();
        break;
      case 'Enter':
        e.preventDefault();
        this.executeAction(this.selectedIndex);
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  }

  private executeAction(index: number): void {
    const action = this.filteredActions[index];
    if (action) {
      this.close();
      action.action();
    }
  }

}
