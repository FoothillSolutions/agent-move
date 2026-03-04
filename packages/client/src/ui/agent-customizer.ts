import type { AgentState } from '@agent-move/shared';
import { AGENT_PALETTES } from '@agent-move/shared';
import { storageGet, storageSet } from '../utils/storage.js';

export interface CustomizationData {
  displayName?: string;
  colorIndex?: number;
}

type CustomizationMap = Record<string, CustomizationData>;

const STORAGE_KEY = 'agent-customizations';

export class AgentCustomizer {
  private el: HTMLElement;
  private customizations: CustomizationMap;
  /** The agent currently being edited */
  private currentAgent: AgentState | null = null;
  private onChange: ((agentId: string, data: CustomizationData) => void) | null = null;

  constructor() {
    this.customizations = storageGet<CustomizationMap>(STORAGE_KEY, {});

    this.el = document.createElement('div');
    this.el.id = 'agent-customizer';
    this.el.innerHTML = `
      <div class="ac-backdrop"></div>
      <div class="ac-popover">
        <div class="ac-header">Customize Agent<button class="ac-close">&times;</button></div>
        <div class="ac-field">
          <label>Display Name</label>
          <input type="text" class="ac-name-input" maxlength="14" placeholder="Custom name..." />
        </div>
        <div class="ac-field">
          <label>Color</label>
          <div class="ac-palette"></div>
        </div>
        <div class="ac-actions">
          <button class="ac-reset">Reset</button>
          <button class="ac-save">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);

    // Build palette grid
    const paletteEl = this.el.querySelector('.ac-palette')!;
    AGENT_PALETTES.forEach((p, i) => {
      const swatch = document.createElement('div');
      swatch.className = 'ac-swatch';
      swatch.style.background = '#' + p.body.toString(16).padStart(6, '0');
      swatch.dataset.index = String(i);
      swatch.addEventListener('click', () => {
        paletteEl.querySelectorAll('.ac-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
      });
      paletteEl.appendChild(swatch);
    });

    this.el.querySelector('.ac-backdrop')!.addEventListener('click', () => this.close());
    this.el.querySelector('.ac-close')!.addEventListener('click', () => this.close());
    this.el.querySelector('.ac-save')!.addEventListener('click', () => this.save());
    this.el.querySelector('.ac-reset')!.addEventListener('click', () => this.reset());
  }

  setChangeHandler(handler: (agentId: string, data: CustomizationData) => void): void {
    this.onChange = handler;
  }

  /** Get the default display name for an agent (before customization) */
  private getDefaultName(agent: AgentState): string {
    return agent.agentName || agent.projectName || agent.id.slice(0, 8);
  }

  /** Get display name for an agent, respecting customizations keyed by sessionId */
  getDisplayName(agent: AgentState): string {
    const custom = this.customizations[agent.id];
    return custom?.displayName || this.getDefaultName(agent);
  }

  /** Get effective color index for an agent, respecting customizations keyed by sessionId */
  getDisplayColorIndex(agent: AgentState): number {
    const custom = this.customizations[agent.id];
    return custom?.colorIndex ?? agent.colorIndex;
  }

  /** Convenience: get both display name and color index */
  getCustomDisplay(agent: AgentState): { displayName: string; colorIndex: number } {
    return {
      displayName: this.getDisplayName(agent),
      colorIndex: this.getDisplayColorIndex(agent),
    };
  }

  /**
   * Open the customizer for an agent.
   * @param agent - full agent state (sessionId used as persistent key)
   */
  open(agent: AgentState): void {
    this.currentAgent = agent;
    const data = this.customizations[agent.id];
    const defaultName = this.getDefaultName(agent);
    (this.el.querySelector('.ac-name-input') as HTMLInputElement).value = data?.displayName ?? defaultName;

    const selectedIdx = data?.colorIndex ?? -1;
    this.el.querySelectorAll('.ac-swatch').forEach(s => {
      s.classList.toggle('selected', (s as HTMLElement).dataset.index === String(selectedIdx));
    });

    this.el.classList.add('open');
  }

  close(): void {
    this.el.classList.remove('open');
    this.currentAgent = null;
  }

  private save(): void {
    if (!this.currentAgent) return;
    const name = (this.el.querySelector('.ac-name-input') as HTMLInputElement).value.trim();
    const selectedSwatch = this.el.querySelector('.ac-swatch.selected') as HTMLElement | null;
    const colorIndex = selectedSwatch ? parseInt(selectedSwatch.dataset.index!, 10) : undefined;

    const data: CustomizationData = {};
    if (name) data.displayName = name;
    if (colorIndex !== undefined) data.colorIndex = colorIndex;

    this.customizations[this.currentAgent.id] = data;
    storageSet(STORAGE_KEY, this.customizations);
    this.onChange?.(this.currentAgent.id, data);
    this.close();
  }

  private reset(): void {
    if (!this.currentAgent) return;
    delete this.customizations[this.currentAgent.id];
    storageSet(STORAGE_KEY, this.customizations);
    this.onChange?.(this.currentAgent.id, {});
    this.close();
  }

  dispose(): void {
    this.el.remove();
  }
}
