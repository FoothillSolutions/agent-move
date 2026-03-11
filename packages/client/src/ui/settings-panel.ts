import type { SoundEvent, SoundManager } from '../audio/sound-manager.js';
import { SOUND_VOICES, DEFAULT_VOICES } from '../audio/sound-manager.js';
import { storageGet, storageSet } from '../utils/storage.js';

/**
 * Persisted application settings with change callbacks.
 */

export interface AppSettings {
  // Sound
  masterVolume: number;       // 0-1
  muted: boolean;
  soundEvents: Record<SoundEvent, boolean>;
  soundVoices: Record<SoundEvent, string>;

  // Notifications
  browserNotifications: boolean;

  // Cost
  costThreshold: number;      // USD

  // Display
  showTrails: boolean;
  showHeatmap: boolean;
  showAgentNames: boolean;
}

const SOUND_EVENTS: SoundEvent[] = ['spawn', 'zone-change', 'tool-use', 'idle', 'shutdown', 'input-needed'];

const SOUND_EVENT_LABELS: Record<SoundEvent, string> = {
  'spawn': 'Agent Spawn',
  'zone-change': 'Zone Change',
  'tool-use': 'Tool Use',
  'idle': 'Agent Idle',
  'shutdown': 'Agent Shutdown',
  'input-needed': 'Input Needed',
};

const SOUND_EVENT_DESCRIPTIONS: Record<SoundEvent, string> = {
  'spawn': 'Ascending chime when an agent enters',
  'zone-change': 'Soft blip when agent moves zones',
  'tool-use': 'Gentle tap on each tool call',
  'idle': 'Descending tone when agent goes idle',
  'shutdown': 'Farewell notes when agent leaves',
  'input-needed': 'Alert when agent needs your input',
};

const DEFAULT_SETTINGS: AppSettings = {
  masterVolume: 0.3,
  muted: false,
  soundEvents: {
    'spawn': true,
    'zone-change': true,
    'tool-use': true,
    'idle': true,
    'shutdown': true,
    'input-needed': true,
  },
  soundVoices: { ...DEFAULT_VOICES },
  browserNotifications: true,
  costThreshold: 5.0,
  showTrails: false,
  showHeatmap: true,
  showAgentNames: true,
};

const STORAGE_KEY = 'settings';

type SettingsChangeHandler = (settings: AppSettings) => void;

export class SettingsPanel {
  private contentEl: HTMLElement;
  private containerEl: HTMLElement;
  private isVisible = false;
  private settings: AppSettings;
  private onChange: SettingsChangeHandler | null = null;
  private soundManager: SoundManager | null = null;

  constructor(container: HTMLElement) {
    this.containerEl = container;
    this.settings = this.loadSettings();

    this.contentEl = document.createElement('div');
    this.contentEl.id = 'settings-content';
    this.contentEl.style.display = 'none';
    this.containerEl.appendChild(this.contentEl);
  }

  /** Give the panel access to SoundManager for preview playback */
  setSoundManager(sound: SoundManager): void {
    this.soundManager = sound;
  }

  private loadSettings(): AppSettings {
    const saved = storageGet<Partial<AppSettings>>(STORAGE_KEY, {});
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      soundEvents: {
        ...DEFAULT_SETTINGS.soundEvents,
        ...(saved.soundEvents ?? {}),
      },
      soundVoices: {
        ...DEFAULT_SETTINGS.soundVoices,
        ...(saved.soundVoices ?? {}),
      },
    };
  }

  private save(): void {
    storageSet(STORAGE_KEY, this.settings);
    this.onChange?.(this.settings);
  }

  getSettings(): AppSettings {
    return this.settings;
  }

  /** Update a setting programmatically (e.g. from volume slider in sidebar).
   *  Only persists — does NOT fire onChange to avoid round-trip syncs. */
  updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    if (this.settings[key] === value) return;
    this.settings[key] = value;
    storageSet(STORAGE_KEY, this.settings);
    if (this.isVisible) this.render();
  }

  setChangeHandler(handler: SettingsChangeHandler): void {
    this.onChange = handler;
  }

  show(): void {
    this.isVisible = true;
    this.contentEl.style.display = '';
    this.render();
  }

  hide(): void {
    this.isVisible = false;
    this.contentEl.style.display = 'none';
  }

  private render(): void {
    const s = this.settings;

    this.contentEl.innerHTML = `
      <div class="settings-panel">
        <!-- Sound -->
        <div class="settings-section">
          <h3 class="settings-section-title">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            Sound
          </h3>
          <div class="settings-row">
            <label class="settings-label">Master Volume</label>
            <div class="settings-control">
              <input type="range" id="s-volume" min="0" max="100" value="${Math.round(s.masterVolume * 100)}" class="settings-slider" />
              <span class="settings-value" id="s-volume-val">${Math.round(s.masterVolume * 100)}%</span>
            </div>
          </div>
          <div class="settings-row">
            <label class="settings-label">Mute All</label>
            <div class="settings-control">
              <label class="settings-toggle">
                <input type="checkbox" id="s-mute" ${s.muted ? 'checked' : ''} />
                <span class="settings-toggle-track"></span>
              </label>
            </div>
          </div>
          <div class="settings-sub-title">Sound Events</div>
          ${SOUND_EVENTS.map(ev => {
            const voices = SOUND_VOICES[ev];
            const selectedVoice = s.soundVoices[ev] || DEFAULT_VOICES[ev];
            return `
            <div class="settings-sound-row">
              <label class="settings-toggle settings-sound-toggle">
                <input type="checkbox" data-sound="${ev}" ${s.soundEvents[ev] ? 'checked' : ''} />
                <span class="settings-toggle-track"></span>
              </label>
              <span class="settings-sound-label">${SOUND_EVENT_LABELS[ev]}</span>
              <select class="settings-voice-select" data-voice-event="${ev}">
                ${voices.map(v => `<option value="${v.id}" ${v.id === selectedVoice ? 'selected' : ''}>${v.label}</option>`).join('')}
              </select>
              <button class="settings-preview-btn" data-preview="${ev}" title="Preview sound">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
          `}).join('')}
        </div>

        <!-- Notifications -->
        <div class="settings-section">
          <h3 class="settings-section-title">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
            Notifications
          </h3>
          <div class="settings-row">
            <div class="settings-label-group">
              <label class="settings-label">Browser Notifications</label>
              <span class="settings-hint">Show alerts when tab is in background</span>
            </div>
            <div class="settings-control">
              <label class="settings-toggle">
                <input type="checkbox" id="s-notif" ${s.browserNotifications ? 'checked' : ''} />
                <span class="settings-toggle-track"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- Cost Alerts -->
        <div class="settings-section">
          <h3 class="settings-section-title">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
            Cost Alerts
          </h3>
          <div class="settings-row">
            <div class="settings-label-group">
              <label class="settings-label">Spend Threshold</label>
              <span class="settings-hint">Alert when total cost exceeds this amount</span>
            </div>
            <div class="settings-control">
              <span class="settings-input-prefix">$</span>
              <input type="number" id="s-threshold" value="${s.costThreshold}" min="0.1" step="0.5" class="settings-number" />
            </div>
          </div>
        </div>

        <!-- Display -->
        <div class="settings-section">
          <h3 class="settings-section-title">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
            Display
          </h3>
          <div class="settings-row">
            <div class="settings-label-group">
              <label class="settings-label">Agent Trails</label>
              <span class="settings-hint">Show movement trails behind agents</span>
            </div>
            <div class="settings-control">
              <label class="settings-toggle">
                <input type="checkbox" id="s-trails" ${s.showTrails ? 'checked' : ''} />
                <span class="settings-toggle-track"></span>
              </label>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-label-group">
              <label class="settings-label">Zone Heatmap</label>
              <span class="settings-hint">Overlay showing zone activity intensity</span>
            </div>
            <div class="settings-control">
              <label class="settings-toggle">
                <input type="checkbox" id="s-heatmap" ${s.showHeatmap ? 'checked' : ''} />
                <span class="settings-toggle-track"></span>
              </label>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-label-group">
              <label class="settings-label">Agent Names</label>
              <span class="settings-hint">Show name labels above agent sprites</span>
            </div>
            <div class="settings-control">
              <label class="settings-toggle">
                <input type="checkbox" id="s-names" ${s.showAgentNames ? 'checked' : ''} />
                <span class="settings-toggle-track"></span>
              </label>
            </div>
          </div>
        </div>

        <div class="settings-footer">
          <button id="s-reset" class="settings-reset-btn">Reset to Defaults</button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    // Volume slider
    const volSlider = this.contentEl.querySelector('#s-volume') as HTMLInputElement;
    const volVal = this.contentEl.querySelector('#s-volume-val')!;
    volSlider?.addEventListener('input', () => {
      const v = Number(volSlider.value);
      volVal.textContent = `${v}%`;
      this.settings.masterVolume = v / 100;
      this.save();
    });

    // Mute
    const muteBox = this.contentEl.querySelector('#s-mute') as HTMLInputElement;
    muteBox?.addEventListener('change', () => {
      this.settings.muted = muteBox.checked;
      this.save();
    });

    // Sound event toggles
    this.contentEl.querySelectorAll<HTMLInputElement>('[data-sound]').forEach(cb => {
      cb.addEventListener('change', () => {
        const ev = cb.dataset.sound as SoundEvent;
        this.settings.soundEvents[ev] = cb.checked;
        this.save();
      });
    });

    // Voice selectors
    this.contentEl.querySelectorAll<HTMLSelectElement>('[data-voice-event]').forEach(sel => {
      sel.addEventListener('change', () => {
        const ev = sel.dataset.voiceEvent as SoundEvent;
        this.settings.soundVoices[ev] = sel.value;
        this.save();
        // Auto-preview when changing voice
        this.soundManager?.preview(ev, sel.value);
      });
    });

    // Preview buttons
    this.contentEl.querySelectorAll<HTMLButtonElement>('[data-preview]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ev = btn.dataset.preview as SoundEvent;
        const voiceId = this.settings.soundVoices[ev] || DEFAULT_VOICES[ev];
        this.soundManager?.preview(ev, voiceId);
        // Brief visual feedback
        btn.classList.add('settings-preview-active');
        setTimeout(() => btn.classList.remove('settings-preview-active'), 300);
      });
    });

    // Browser notifications
    const notifBox = this.contentEl.querySelector('#s-notif') as HTMLInputElement;
    notifBox?.addEventListener('change', () => {
      this.settings.browserNotifications = notifBox.checked;
      this.save();
    });

    // Cost threshold
    const thresholdInput = this.contentEl.querySelector('#s-threshold') as HTMLInputElement;
    thresholdInput?.addEventListener('change', () => {
      this.settings.costThreshold = parseFloat(thresholdInput.value) || 5.0;
      this.save();
    });

    // Display toggles
    const trailsBox = this.contentEl.querySelector('#s-trails') as HTMLInputElement;
    trailsBox?.addEventListener('change', () => {
      this.settings.showTrails = trailsBox.checked;
      this.save();
    });

    const heatmapBox = this.contentEl.querySelector('#s-heatmap') as HTMLInputElement;
    heatmapBox?.addEventListener('change', () => {
      this.settings.showHeatmap = heatmapBox.checked;
      this.save();
    });

    const namesBox = this.contentEl.querySelector('#s-names') as HTMLInputElement;
    namesBox?.addEventListener('change', () => {
      this.settings.showAgentNames = namesBox.checked;
      this.save();
    });

    // Reset
    const resetBtn = this.contentEl.querySelector('#s-reset');
    resetBtn?.addEventListener('click', () => {
      this.settings = {
        ...DEFAULT_SETTINGS,
        soundEvents: { ...DEFAULT_SETTINGS.soundEvents },
        soundVoices: { ...DEFAULT_SETTINGS.soundVoices },
      };
      this.save();
      this.render();
    });
  }
}
