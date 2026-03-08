import type { AgentState, TimelineEvent } from '@agent-move/shared';
import { AGENT_PALETTES } from '@agent-move/shared';
import type { EventCategory } from './timeline-canvas.js';

/** Resolved agent identity used by the timeline filter and swim lanes */
export interface AgentEntry {
  id: string;
  name: string;
  colorIndex: number;
}

/**
 * Encapsulates event-type filter state and per-agent visibility state for the
 * Timeline. Owns the agent-filter pill DOM it renders into.
 */
export class TimelineFilter {
  private activeFilters = new Set<EventCategory>(['tool', 'zone', 'idle', 'lifecycle']);
  private visibleAgents = new Set<string>(); // empty = show all

  private agentFilterContainer: HTMLElement;
  private customizationLookup: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null = null;

  /** Called by the owner when filter state changes and a re-render is needed. */
  private onChanged: () => void;

  /** Called by the owner to retrieve the current timeline events. */
  private getTimeline: () => TimelineEvent[];

  constructor(
    agentFilterContainer: HTMLElement,
    getTimeline: () => TimelineEvent[],
    onChanged: () => void,
  ) {
    this.agentFilterContainer = agentFilterContainer;
    this.getTimeline = getTimeline;
    this.onChanged = onChanged;
  }

  setCustomizationLookup(fn: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null): void {
    this.customizationLookup = fn;
  }

  /** Returns true if the event should be visible given the current event-type filters. */
  isEventVisible(event: TimelineEvent, category: EventCategory): boolean {
    return this.activeFilters.has(category);
  }

  /** Returns true if the given agent id should appear in swim lanes. */
  isAgentVisible(agentId: string): boolean {
    return this.visibleAgents.size === 0 || this.visibleAgents.has(agentId);
  }

  /** Toggle an event-category filter pill. Called from the pill click handler in Timeline. */
  toggleCategory(cat: EventCategory, pill: Element): void {
    if (this.activeFilters.has(cat)) {
      this.activeFilters.delete(cat);
      pill.classList.remove('active');
    } else {
      this.activeFilters.add(cat);
      pill.classList.add('active');
    }
    this.onChanged();
  }

  /** Get unique agents from timeline events, preserving order of first appearance. */
  getUniqueAgents(): AgentEntry[] {
    const events = this.getTimeline();
    const seen = new Map<string, AgentEntry>();
    for (const e of events) {
      if (!seen.has(e.agent.id)) {
        const custom = this.customizationLookup?.(e.agent);
        seen.set(e.agent.id, {
          id: e.agent.id,
          name: custom?.displayName || e.agent.agentName || e.agent.projectName || e.agent.id.slice(0, 8),
          colorIndex: custom?.colorIndex ?? e.agent.colorIndex,
        });
      }
    }
    return Array.from(seen.values());
  }

  /** Get the filtered list of agents to show in swim lanes. */
  getSwimLaneAgents(): AgentEntry[] {
    const all = this.getUniqueAgents();
    if (this.visibleAgents.size === 0) return all;
    return all.filter((a) => this.visibleAgents.has(a.id));
  }

  /** Rebuild the agent-filter pill DOM and wire up click handlers. */
  updateAgentFilters(): void {
    const agents = this.getUniqueAgents();
    this.agentFilterContainer.innerHTML = '';

    if (agents.length === 0) return;

    for (const agent of agents) {
      const palette = AGENT_PALETTES[agent.colorIndex % AGENT_PALETTES.length];
      const color = '#' + palette.body.toString(16).padStart(6, '0');
      const pill = document.createElement('button');
      pill.className = 'tl-agent-pill';
      // Show as active if visibleAgents is empty (show all) or this agent is in the set
      if (this.visibleAgents.size === 0 || this.visibleAgents.has(agent.id)) {
        pill.classList.add('active');
      }
      pill.innerHTML = `<span class="tl-agent-dot" style="background:${color}"></span>${agent.name}`;
      pill.title = `Toggle ${agent.name}`;
      pill.addEventListener('click', () => {
        this.toggleAgentFilter(agent.id);
      });
      this.agentFilterContainer.appendChild(pill);
    }
  }

  private toggleAgentFilter(agentId: string): void {
    const agents = this.getUniqueAgents();

    if (this.visibleAgents.size === 0) {
      // Currently showing all. Clicking one means "show only this one"
      // But if there's only 1 agent, toggling does nothing useful
      if (agents.length <= 1) return;
      // Set to show only the clicked agent
      this.visibleAgents.clear();
      this.visibleAgents.add(agentId);
    } else if (this.visibleAgents.has(agentId)) {
      this.visibleAgents.delete(agentId);
      // If none remain, go back to "show all"
      if (this.visibleAgents.size === 0) {
        // Already empty = show all
      }
    } else {
      this.visibleAgents.add(agentId);
      // If all are now selected, clear to "show all" mode
      if (this.visibleAgents.size >= agents.length) {
        this.visibleAgents.clear();
      }
    }

    this.updateAgentFilters();
    this.onChanged();
  }
}
