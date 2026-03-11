/**
 * Synthesized sound effects using Web Audio API.
 * No audio files needed — all sounds are generated programmatically.
 * Each event type has multiple voice variants the user can choose from.
 */

export type SoundEvent = 'spawn' | 'zone-change' | 'tool-use' | 'idle' | 'shutdown' | 'input-needed';

/** Synthesizer function: receives AudioContext, current time, and volume multiplier */
type SynthFn = (ctx: AudioContext, now: number, vol: number) => void;

interface VoiceEntry {
  id: string;
  label: string;
  play: SynthFn;
}

// ── Synth helpers to reduce boilerplate ──

/** Play a sequence of notes as an arpeggio */
function arpeggio(
  ctx: AudioContext, now: number, vol: number,
  freqs: number[], type: OscillatorType, spacing: number, attack: number, decay: number,
): void {
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = now + i * spacing;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  });
}

/** Play a single oscillator with a frequency sweep and gain envelope */
function sweep(
  ctx: AudioContext, now: number, vol: number,
  startFreq: number, endFreq: number, type: OscillatorType, sweepTime: number, decayTime: number,
): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + sweepTime);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + decayTime);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + decayTime + 0.05);
}

// ── Voice definitions per event ──

const SPAWN_VOICES: VoiceEntry[] = [
  { id: 'chime', label: 'Chime',
    play: (ctx, now, vol) => arpeggio(ctx, now, vol * 0.25, [523.25, 659.25, 783.99], 'sine', 0.1, 0.03, 0.3) },
  { id: 'fanfare', label: 'Fanfare',
    play: (ctx, now, vol) => arpeggio(ctx, now, vol * 0.2, [392, 523.25, 659.25], 'square', 0.12, 0.02, 0.35) },
  { id: 'pixel-pop', label: 'Pixel Pop',
    play: (ctx, now, vol) => sweep(ctx, now, vol * 0.2, 200, 1200, 'square', 0.15, 0.25) },
  { id: 'synth-rise', label: 'Synth Rise',
    play: (ctx, now, vol) => sweep(ctx, now, vol * 0.18, 220, 880, 'sawtooth', 0.3, 0.4) },
  { id: 'harp', label: 'Harp',
    play: (ctx, now, vol) => arpeggio(ctx, now, vol * 0.2, [261.63, 329.63, 392, 523.25], 'triangle', 0.06, 0.01, 0.5) },
];

const ZONE_CHANGE_VOICES: VoiceEntry[] = [
  { id: 'blip', label: 'Blip',
    play: (ctx, now, vol) => sweep(ctx, now, vol * 0.12, 440, 660, 'sine', 0.08, 0.15) },
  { id: 'swoosh', label: 'Swoosh',
    play: (ctx, now, vol) => sweep(ctx, now, vol * 0.1, 1200, 200, 'sawtooth', 0.12, 0.18) },
  { id: 'pop', label: 'Pop',
    play: (ctx, now, vol) => sweep(ctx, now, vol * 0.15, 600, 300, 'sine', 0.04, 0.08) },
  {
    id: 'warp', label: 'Warp',
    play(ctx, now, vol) {
      const v = vol * 0.07;
      ['sine', 'triangle'].forEach((type, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type as OscillatorType;
        osc.frequency.setValueAtTime(300 + idx * 20, now);
        osc.frequency.exponentialRampToValueAtTime(800 + idx * 40, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.18);
        g.gain.setValueAtTime(v, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(g).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.27);
      });
    },
  },
];

const TOOL_USE_VOICES: VoiceEntry[] = [
  { id: 'tap', label: 'Tap',
    play: (ctx, now, vol) => sweep(ctx, now, vol * 0.06, 880, 600, 'sine', 0.06, 0.08) },
  { id: 'click', label: 'Click',
    play: (ctx, now, vol) => sweep(ctx, now, vol * 0.08, 1200, 400, 'square', 0.02, 0.04) },
  { id: 'hammer', label: 'Hammer',
    play: (ctx, now, vol) => sweep(ctx, now, vol * 0.07, 200, 80, 'triangle', 0.05, 0.1) },
  { id: 'beep', label: 'Beep',
    play: (ctx, now, vol) => sweep(ctx, now, vol * 0.06, 1000, 980, 'sine', 0.04, 0.06) },
  {
    id: 'typewriter', label: 'Typewriter',
    play(ctx, now, vol) {
      const v = vol * 0.05;
      [0, 0.03].forEach((offset) => {
        sweep(ctx, now + offset, v, 800 + Math.random() * 400, 200, 'square', 0.015, 0.025);
      });
    },
  },
];

const IDLE_VOICES: VoiceEntry[] = [
  { id: 'descend', label: 'Descend',
    play: (ctx, now, vol) => sweep(ctx, now, vol * 0.1, 440, 330, 'sine', 0.2, 0.3) },
  {
    id: 'wind-down', label: 'Wind Down',
    play(ctx, now, vol) {
      const v = vol * 0.08;
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.4);
      lfo.type = 'sine';
      lfo.frequency.value = 8;
      lfoGain.gain.value = 30;
      lfo.connect(lfoGain).connect(osc.frequency);
      g.gain.setValueAtTime(v, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(g).connect(ctx.destination);
      lfo.start(now);
      osc.start(now);
      osc.stop(now + 0.5);
      lfo.stop(now + 0.5);
    },
  },
  { id: 'sigh', label: 'Sigh',
    play: (ctx, now, vol) => sweep(ctx, now, vol * 0.08, 600, 200, 'sawtooth', 0.3, 0.4) },
  { id: 'music-box', label: 'Music Box',
    play: (ctx, now, vol) => arpeggio(ctx, now, vol * 0.12, [659.25, 440], 'sine', 0.2, 0.01, 0.4) },
];

const SHUTDOWN_VOICES: VoiceEntry[] = [
  { id: 'farewell', label: 'Farewell',
    play: (ctx, now, vol) => arpeggio(ctx, now, vol * 0.2, [659.25, 523.25, 392.0], 'triangle', 0.12, 0.02, 0.3) },
  { id: 'power-down', label: 'Power Down',
    play: (ctx, now, vol) => sweep(ctx, now, vol * 0.15, 800, 60, 'square', 0.5, 0.55) },
  {
    id: 'portal', label: 'Portal',
    play(ctx, now, vol) {
      const v = vol * 0.12;
      // Shimmering vanish: two detuned oscillators sweeping down
      [0, 5].forEach((detune) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(900 + detune, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.35);
        osc.detune.value = detune * 10;
        g.gain.setValueAtTime(v * 0.6, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(g).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
      });
    },
  },
  { id: 'wave', label: 'Wave',
    play: (ctx, now, vol) => arpeggio(ctx, now, vol * 0.15, [392, 523.25, 440, 330], 'sine', 0.08, 0.02, 0.2) },
];

const INPUT_NEEDED_VOICES: VoiceEntry[] = [
  { id: 'doorbell', label: 'Doorbell',
    play: (ctx, now, vol) => arpeggio(ctx, now, vol * 0.3, [880, 660], 'sine', 0.15, 0.02, 0.25) },
  {
    id: 'alarm', label: 'Alarm',
    play(ctx, now, vol) {
      const v = vol * 0.2;
      // Rapid alternating beeps
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = i % 2 === 0 ? 1000 : 800;
        const t = now + i * 0.08;
        g.gain.setValueAtTime(v, t);
        g.gain.setValueAtTime(0.001, t + 0.06);
        osc.connect(g).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.07);
      }
    },
  },
  { id: 'ping', label: 'Ping',
    play: (ctx, now, vol) => arpeggio(ctx, now, vol * 0.25, [1047], 'sine', 0, 0.01, 0.6) },
  {
    id: 'siren', label: 'Siren',
    play(ctx, now, vol) {
      const v = vol * 0.15;
      // Mini siren sweep up-down
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.linearRampToValueAtTime(1000, now + 0.15);
      osc.frequency.linearRampToValueAtTime(600, now + 0.3);
      osc.frequency.linearRampToValueAtTime(1000, now + 0.45);
      g.gain.setValueAtTime(v, now);
      g.gain.setValueAtTime(v, now + 0.4);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(g).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.55);
    },
  },
  { id: 'chime-alert', label: 'Chime Alert',
    play: (ctx, now, vol) => arpeggio(ctx, now, vol * 0.25, [1047, 1319], 'sine', 0.12, 0.01, 0.4) },
];

/** All voice entries per event, exported for settings UI */
export const SOUND_VOICES: Record<SoundEvent, VoiceEntry[]> = {
  'spawn': SPAWN_VOICES,
  'zone-change': ZONE_CHANGE_VOICES,
  'tool-use': TOOL_USE_VOICES,
  'idle': IDLE_VOICES,
  'shutdown': SHUTDOWN_VOICES,
  'input-needed': INPUT_NEEDED_VOICES,
};

/** Default voice ID per event */
export const DEFAULT_VOICES: Record<SoundEvent, string> = {
  'spawn': 'chime',
  'zone-change': 'blip',
  'tool-use': 'tap',
  'idle': 'descend',
  'shutdown': 'farewell',
  'input-needed': 'doorbell',
};

export class SoundManager {
  private ctx: AudioContext | null = null;
  private _volume = 0.3;
  private _muted = false;
  private initialized = false;
  private lastToolUseTime = 0;
  private static TOOL_USE_COOLDOWN = 300; // ms between tool-use sounds
  private _enabledEvents: Record<SoundEvent, boolean> = {
    'spawn': true, 'zone-change': true, 'tool-use': true,
    'idle': true, 'shutdown': true, 'input-needed': true,
  };
  private _voices: Record<SoundEvent, string> = { ...DEFAULT_VOICES };

  get volume(): number {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(m: boolean) {
    this._muted = m;
  }

  /** Set which sound events are enabled */
  setEnabledEvents(events: Record<SoundEvent, boolean>): void {
    this._enabledEvents = { ...events };
  }

  /** Set which voice variant to use per event */
  setVoices(voices: Record<SoundEvent, string>): void {
    this._voices = { ...voices };
  }

  /** Must be called from a user gesture to unlock AudioContext */
  init(): void {
    if (this.initialized) return;
    this.ctx = new AudioContext();
    this.initialized = true;
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.initialized = true;
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private gain(): number {
    return this._muted ? 0 : this._volume;
  }

  private getVoice(event: SoundEvent): VoiceEntry | undefined {
    const voiceId = this._voices[event];
    const voices = SOUND_VOICES[event];
    return voices.find(v => v.id === voiceId) ?? voices[0];
  }

  play(event: SoundEvent): void {
    if (this._muted || this._volume === 0) return;
    if (!this._enabledEvents[event]) return;

    if (event === 'tool-use') {
      const now2 = performance.now();
      if (now2 - this.lastToolUseTime < SoundManager.TOOL_USE_COOLDOWN) return;
      this.lastToolUseTime = now2;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;
    const voice = this.getVoice(event);
    voice?.play(ctx, ctx.currentTime, this.gain());
  }

  /** Preview a specific voice variant (ignores mute/enabled for testing in settings) */
  preview(event: SoundEvent, voiceId: string): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const voices = SOUND_VOICES[event];
    const voice = voices.find(v => v.id === voiceId) ?? voices[0];
    const vol = this._volume > 0 ? this._volume : 0.3; // use at least 0.3 for preview
    voice?.play(ctx, ctx.currentTime, vol);
  }
}
