import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { AgentState, AgentPalette } from '@agent-move/shared';
import { COLORS, getFunnyName } from '@agent-move/shared';
import { MAIN_VARIANT_SETS, SUB_VARIANT_SETS, getVariantIndex, type SpriteSet } from '../sprites/sprite-data.js';
import { createSpriteTexture, spriteKey } from '../sprites/sprite-factory.js';
import { createBadge, drawCircleBadge, drawRoundRectBadge, type BadgeComponents } from './badge-factory.js';
import { SpeechBubble, type SpeechMessage } from './speech-bubble.js';

export type { SpeechMessage } from './speech-bubble.js';

type AnimState = 'idle' | 'walk' | 'working' | 'sleeping' | 'done';

const IDLE_FPS = 2;
const WALK_FPS = 4;
const SLEEPING_FPS = 0.7;
const MOVE_SPEED = 100; // pixels per second
const ARRIVAL_THRESHOLD = 3;
const BOB_AMPLITUDE = 1.5;
const BOB_SPEED = 2;
const SLEEPING_BOB_AMPLITUDE = 2.5;
const SLEEPING_BOB_SPEED = 0.8;
const DONE_BOB_AMPLITUDE = 1.0;
const DONE_BOB_SPEED = 1.5;
const FADE_OUT_DURATION = 600;
const ZZZ_CYCLE = 3000;
const ZZZ_HEIGHT = 30;
const ZZZ_DRIFT = 18;

/**
 * Animated agent sprite with name label and speech bubble.
 * Handles its own movement, animation, and speech.
 */
export class AgentSprite {
  public readonly container = new Container();

  private sprite: Sprite;
  private nameBg: Graphics;
  private nameLabel: Text;

  // Speech bubble
  private speechBubble: SpeechBubble;

  // Input-needed pulse
  private needsInputPulse = 0;

  // Child count badge
  private childBadge: BadgeComponents | null = null;

  // Planning mode badge
  private planBadge: BadgeComponents | null = null;
  private planPulseTimer = 0;
  private _isPlanning = false;

  // Waiting for user badge
  private waitBadge: BadgeComponents | null = null;
  private waitPulseTimer = 0;
  private _isWaiting = false;
  // Floating "?" letters for waiting state
  private waitQContainer: Container;
  private waitQLetters: Text[];
  private waitQTimer = 0;

  private animState: AnimState = 'idle';
  private isIdleState = false;
  private isDoneState = false;
  private idleTimer = 0;
  private static IDLE_TO_SLEEP_MS = 30_000; // 30s standing idle before sleeping

  // ZZZ floating letters for sleeping
  private zzzContainer: Container;
  private zzzLetters: Text[];
  private zzzTimer = 0;

  // Done badge (green checkmark)
  private doneBadge: BadgeComponents | null = null;

  // Done sparkles
  private sparkles: { gfx: Graphics; phase: number }[] = [];

  // Compacting badge (context compaction in progress)
  private compactBadge: BadgeComponents | null = null;
  private compactPulseTimer = 0;
  private _isCompacting = false;

  // Tool outcome flash (success = green, failure = red)
  private outcomeFlash: { outcome: 'success' | 'failure'; timer: number } | null = null;
  private static OUTCOME_FLASH_DURATION = 700;

  // Anomaly badge
  private anomalyBadge: BadgeComponents | null = null;
  private anomalyPulseTimer = 0;
  private _hasAnomaly = false;
  private anomalyAutoClearTimer: ReturnType<typeof setTimeout> | null = null;

  // Context health bar (below sprite, above name label)
  private contextBar: Graphics;
  private _contextPct = 0;

  // Activity ring
  private activityRing: Graphics;
  private activityLevel = 0; // 0..1, decays over time
  private activityPhase = 0; // rotation animation

  private isSubagent: boolean;
  private variantIndex: number;
  private spriteHeight: number;
  private textures: {
    idle: [Texture, Texture];
    walk: [Texture, Texture];
    working: Texture;
    sleeping: [Texture, Texture];
    done: Texture;
  };

  private frameTimer = 0;
  private frameIndex = 0;

  // Movement
  private targetX: number;
  private targetY: number;
  private isMoving = false;
  private bobTimer: number;
  private baseY: number;

  // Fade out
  private fadingOut = false;
  private fadeTimer = 0;
  private fadeResolve: (() => void) | null = null;

  // Spawn animation
  public spawnAnimTimer = 0;
  private static SPAWN_ANIM_DURATION = 400;

  constructor(
    agent: AgentState,
    palette: AgentPalette,
    renderer: any,
  ) {
    this.isSubagent = agent.role === 'subagent';
    const isSubagent = this.isSubagent;
    this.variantIndex = getVariantIndex(agent.projectPath ?? agent.sessionId);
    const vi = this.variantIndex;
    const spriteSet: SpriteSet = isSubagent ? SUB_VARIANT_SETS[vi] : MAIN_VARIANT_SETS[vi];
    const keyPrefix = isSubagent ? `sub_v${vi}` : `main_v${vi}`;
    const ci = agent.colorIndex;

    this.spriteHeight = spriteSet.size * 3;

    // Generate all textures
    this.textures = {
      idle: [
        createSpriteTexture(renderer, spriteSet.idle[0], palette, spriteKey(`${keyPrefix}_idle0`, ci)),
        createSpriteTexture(renderer, spriteSet.idle[1], palette, spriteKey(`${keyPrefix}_idle1`, ci)),
      ],
      walk: [
        createSpriteTexture(renderer, spriteSet.walk[0], palette, spriteKey(`${keyPrefix}_walk0`, ci)),
        createSpriteTexture(renderer, spriteSet.walk[1], palette, spriteKey(`${keyPrefix}_walk1`, ci)),
      ],
      working: createSpriteTexture(renderer, spriteSet.working, palette, spriteKey(`${keyPrefix}_working`, ci)),
      sleeping: [
        createSpriteTexture(renderer, spriteSet.sleeping[0], palette, spriteKey(`${keyPrefix}_sleeping0`, ci)),
        createSpriteTexture(renderer, spriteSet.sleeping[1], palette, spriteKey(`${keyPrefix}_sleeping1`, ci)),
      ],
      done: createSpriteTexture(renderer, spriteSet.done, palette, spriteKey(`${keyPrefix}_done`, ci)),
    };

    // Create sprite
    this.sprite = new Sprite(this.textures.idle[0]);
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);

    // Dark background pill behind name label
    this.nameBg = new Graphics();
    this.container.addChild(this.nameBg);

    // Name label below sprite
    const rawName = agent.agentName || getFunnyName(agent.sessionId);
    const name = rawName.length > 14 ? rawName.slice(0, 12) + '..' : rawName;
    const labelStyle = new TextStyle({
      fontSize: 11,
      fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      fill: 0xffffff,
      align: 'center',
      fontWeight: '700',
    });
    this.nameLabel = new Text({ text: name, style: labelStyle });
    this.nameLabel.anchor.set(0.5, 0);
    this.nameLabel.position.set(0, this.spriteHeight / 2 + 8);
    this.container.addChild(this.nameLabel);

    // Draw initial name background
    this.updateNameBg();

    // Context health bar — vertical bar on the right side of the sprite
    this.contextBar = new Graphics();
    this.container.addChild(this.contextBar);
    this.setContextHealth(0); // draw empty track immediately

    // Speech bubble
    this.speechBubble = new SpeechBubble(this.spriteHeight);
    this.container.addChild(this.speechBubble.container);

    // ZZZ floating letters for sleeping state
    this.zzzContainer = new Container();
    this.zzzContainer.visible = false;
    this.zzzLetters = [];
    const zSizes = [8, 10, 13];
    const zTexts = ['z', 'z', 'Z'];
    for (let i = 0; i < 3; i++) {
      const z = new Text({
        text: zTexts[i],
        style: new TextStyle({
          fontSize: zSizes[i],
          fontFamily: "'Segoe UI', sans-serif",
          fill: 0x8899cc,
          fontWeight: '700',
          dropShadow: {
            alpha: 0.5,
            blur: 2,
            color: 0x000000,
            distance: 1,
          },
        }),
      });
      z.anchor.set(0.5, 0.5);
      this.zzzLetters.push(z);
      this.zzzContainer.addChild(z);
    }
    this.zzzContainer.position.set(this.spriteHeight / 3, -this.spriteHeight / 2);
    this.container.addChild(this.zzzContainer);

    // Floating "?" letters for waiting-for-user state
    this.waitQContainer = new Container();
    this.waitQContainer.visible = false;
    this.waitQLetters = [];
    const qSizes = [9, 11, 14];
    for (let i = 0; i < 3; i++) {
      const q = new Text({
        text: '?',
        style: new TextStyle({
          fontSize: qSizes[i],
          fontFamily: "'Segoe UI', sans-serif",
          fill: 0xff9800,
          fontWeight: '700',
          dropShadow: {
            alpha: 0.5,
            blur: 2,
            color: 0x000000,
            distance: 1,
          },
        }),
      });
      q.anchor.set(0.5, 0.5);
      this.waitQLetters.push(q);
      this.waitQContainer.addChild(q);
    }
    this.waitQContainer.position.set(this.spriteHeight / 3, -this.spriteHeight / 2);
    this.container.addChild(this.waitQContainer);

    // Activity ring (drawn behind sprite)
    this.activityRing = new Graphics();
    this.activityRing.visible = false;
    this.container.addChildAt(this.activityRing, 0);

    // Make clickable
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.hitArea = {
      contains: (x: number, y: number) => {
        const halfW = this.spriteHeight / 2 + 10;
        const top = -this.spriteHeight / 2 - 10;
        const bottom = this.spriteHeight / 2 + 25; // include name label
        return x >= -halfW && x <= halfW && y >= top && y <= bottom;
      },
    };

    // Spawn animation
    this.spawnAnimTimer = AgentSprite.SPAWN_ANIM_DURATION;
    this.container.scale.set(0.3);

    // Initial position
    this.targetX = 0;
    this.targetY = 0;
    this.baseY = 0;
    this.bobTimer = Math.random() * Math.PI * 2;
  }

  /** Move toward a world position */
  moveTo(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
    this.isMoving = true;
  }

  /** Set speech with a queue of messages. Shows first, rotates through. */
  setSpeech(messages: SpeechMessage | SpeechMessage[]): void {
    this.speechBubble.set(messages);
  }

  /** Clear speech bubble */
  clearSpeech(): void {
    this.speechBubble.clear();
  }

  /** Override the displayed name with a custom one */
  setCustomName(name: string): void {
    const display = name.length > 14 ? name.slice(0, 12) + '..' : name;
    this.nameLabel.text = display;
    this.updateNameBg();
  }

  /** Redraw the dark pill behind the name + project labels */
  private updateNameBg(): void {
    this.nameBg.clear();
    const padX = 6;
    const padY = 3;
    const nameW = this.nameLabel.width;
    const nameH = this.nameLabel.height;
    const w = nameW + padX * 2;
    const h = nameH + padY * 2;
    const bgY = this.spriteHeight / 2 + 8 - padY;
    this.nameBg
      .roundRect(-w / 2, bgY, w, h, 4)
      .fill({ color: 0x000000, alpha: 0.55 });
  }

  /** Rebuild all sprite textures with a new palette (for color customization) */
  rebuildTextures(palette: AgentPalette, colorIndex: number, renderer: any): void {
    const vi = this.variantIndex;
    const spriteSet: SpriteSet = this.isSubagent ? SUB_VARIANT_SETS[vi] : MAIN_VARIANT_SETS[vi];
    const keyPrefix = this.isSubagent ? `sub_v${vi}` : `main_v${vi}`;
    const ci = colorIndex;

    this.textures = {
      idle: [
        createSpriteTexture(renderer, spriteSet.idle[0], palette, spriteKey(`${keyPrefix}_idle0`, ci)),
        createSpriteTexture(renderer, spriteSet.idle[1], palette, spriteKey(`${keyPrefix}_idle1`, ci)),
      ],
      walk: [
        createSpriteTexture(renderer, spriteSet.walk[0], palette, spriteKey(`${keyPrefix}_walk0`, ci)),
        createSpriteTexture(renderer, spriteSet.walk[1], palette, spriteKey(`${keyPrefix}_walk1`, ci)),
      ],
      working: createSpriteTexture(renderer, spriteSet.working, palette, spriteKey(`${keyPrefix}_working`, ci)),
      sleeping: [
        createSpriteTexture(renderer, spriteSet.sleeping[0], palette, spriteKey(`${keyPrefix}_sleeping0`, ci)),
        createSpriteTexture(renderer, spriteSet.sleeping[1], palette, spriteKey(`${keyPrefix}_sleeping1`, ci)),
      ],
      done: createSpriteTexture(renderer, spriteSet.done, palette, spriteKey(`${keyPrefix}_done`, ci)),
    };

    // Apply the current animation frame's texture immediately
    this.sprite.texture = this.textures.idle[0];
  }

  /** Update context window health bar. Vertical bar on the right side of the sprite. */
  setContextHealth(pct: number, _cachePct = 0): void {
    this._contextPct = Math.max(0, Math.min(1, pct));
    const barW = 4;
    const barH = this.spriteHeight;
    const barX = this.spriteHeight / 2 + 4;
    const barTopY = -barH / 2;

    this.contextBar.clear();
    this.contextBar.visible = true;

    // Dark track (full height)
    this.contextBar
      .roundRect(barX, barTopY, barW, barH, 2)
      .fill({ color: 0x000000, alpha: 0.4 });

    if (this._contextPct > 0) {
      let fillColor: number;
      if (this._contextPct < 0.5) fillColor = 0x22c55e;
      else if (this._contextPct < 0.75) fillColor = 0xeab308;
      else if (this._contextPct < 0.9) fillColor = 0xf97316;
      else fillColor = 0xef4444;

      const fillH = Math.max(2, barH * this._contextPct);
      this.contextBar
        .roundRect(barX, barTopY + barH - fillH, barW, fillH, 2)
        .fill({ color: fillColor, alpha: 0.9 });
    }
  }

  setIdle(idle: boolean): void {
    if (idle && !this.isIdleState) {
      this.idleTimer = 0; // reset timer on fresh idle transition
    }
    this.isIdleState = idle;
  }

  /** Set done visual state with checkmark badge and sparkles */
  setDone(done: boolean): void {
    this.isDoneState = done;

    if (done) {
      if (!this.doneBadge) {
        this.doneBadge = createBadge({ label: '\u2713', fontSize: 10 });
        this.doneBadge.container.position.set(0, -this.spriteHeight / 2 - 14);
        this.container.addChild(this.doneBadge.container);
      }

      drawCircleBadge(this.doneBadge.bg, 8, 0x4caf50, 0x81c784, 1.5, 0.9, 0.7);
      this.doneBadge.container.visible = true;

      // Create sparkles (small cross-shaped twinkles)
      if (this.sparkles.length === 0) {
        const positions = [
          { x: -14, y: -18 }, { x: 16, y: -12 },
          { x: -10, y: 8 }, { x: 18, y: 4 },
        ];
        for (let i = 0; i < 4; i++) {
          const gfx = new Graphics();
          gfx.rect(-0.75, -3, 1.5, 6).fill({ color: 0xffd54f });
          gfx.rect(-3, -0.75, 6, 1.5).fill({ color: 0xffd54f });
          gfx.position.set(positions[i].x, positions[i].y);
          gfx.visible = false;
          this.container.addChild(gfx);
          this.sparkles.push({ gfx, phase: Math.random() * 4000 });
        }
      }
      for (const s of this.sparkles) s.gfx.visible = false;
    } else {
      if (this.doneBadge) this.doneBadge.container.visible = false;
      for (const s of this.sparkles) s.gfx.visible = false;
    }
  }

  /** Update child count badge */
  setChildCount(count: number): void {
    if (count <= 0) {
      if (this.childBadge) this.childBadge.container.visible = false;
      return;
    }

    if (!this.childBadge) {
      this.childBadge = createBadge({ label: '', fontSize: 9 });
      this.childBadge.container.position.set(this.spriteHeight / 2 - 4, -this.spriteHeight / 2 + 4);
      this.container.addChild(this.childBadge.container);
    }

    this.childBadge.text.text = `${count}`;
    drawCircleBadge(this.childBadge.bg, 8, 0xab47bc, 0xffffff, 1, 1, 0.5);
    this.childBadge.container.visible = true;
  }

  /** Show or hide planning mode badge */
  setPlanning(planning: boolean): void {
    this._isPlanning = planning;

    if (!planning) {
      if (this.planBadge) this.planBadge.container.visible = false;
      return;
    }

    if (!this.planBadge) {
      this.planBadge = createBadge({ label: 'PLAN', fontSize: 8, letterSpacing: 0.5 });
      this.planBadge.container.position.set(-this.spriteHeight / 2 + 2, -this.spriteHeight / 2 + 2);
      this.container.addChild(this.planBadge.container);
    }

    this.drawPlanBadge(1);
    this.planBadge.container.visible = true;
  }

  private drawPlanBadge(alpha: number): void {
    if (!this.planBadge) return;
    drawRoundRectBadge(this.planBadge.bg, 30, 13, 3, 0xf97316, 0xfbbf24, alpha * 0.9, alpha * 0.7);
  }

  /** Show or hide waiting-for-user badge */
  setWaiting(waiting: boolean): void {
    this._isWaiting = waiting;

    if (!waiting) {
      if (this.waitBadge) this.waitBadge.container.visible = false;
      this.waitQContainer.visible = false;
      return;
    }

    if (!this.waitBadge) {
      this.waitBadge = createBadge({ label: '?', fontSize: 11 });
      this.waitBadge.container.position.set(0, -this.spriteHeight / 2 - 14);
      this.container.addChild(this.waitBadge.container);
    }

    this.drawWaitBadge(1);
    this.waitBadge.container.visible = true;
  }

  private drawWaitBadge(alpha: number): void {
    if (!this.waitBadge) return;
    drawCircleBadge(this.waitBadge.bg, 9, 0xff9800, 0xffcc80, 1.5, alpha * 0.9, alpha * 0.7);
  }

  /** Show or hide context-compaction badge */
  setCompacting(compacting: boolean): void {
    this._isCompacting = compacting;

    if (!compacting) {
      if (this.compactBadge) this.compactBadge.container.visible = false;
      return;
    }

    if (!this.compactBadge) {
      this.compactBadge = createBadge({ label: '\u21BA COMPACT', fontSize: 8, letterSpacing: 0.3 });
      this.compactBadge.container.position.set(0, this.spriteHeight / 2 + 28);
      this.container.addChild(this.compactBadge.container);
    }

    this.drawCompactBadge(1);
    this.compactBadge.container.visible = true;
  }

  private drawCompactBadge(alpha: number): void {
    if (!this.compactBadge) return;
    drawRoundRectBadge(this.compactBadge.bg, 58, 13, 3, 0x7c3aed, 0xa78bfa, alpha * 0.9, alpha * 0.7);
  }

  /** Flash a brief success (green) or failure (red) ring around the agent */
  flashOutcome(outcome: 'success' | 'failure'): void {
    this.outcomeFlash = { outcome, timer: AgentSprite.OUTCOME_FLASH_DURATION };
  }

  /** Bump activity level (called on each tool use) */
  bumpActivity(): void {
    this.activityLevel = Math.min(1, this.activityLevel + 0.35);
  }

  /** Show pulsing anomaly badge (red/yellow circle with !) */
  setAnomaly(_kind: string): void {
    this._hasAnomaly = true;
    this.anomalyPulseTimer = 0;

    if (!this.anomalyBadge) {
      this.anomalyBadge = createBadge({ label: '!', fontSize: 10 });
      this.anomalyBadge.container.position.set(this.spriteHeight / 2 + 2, -this.spriteHeight / 2 - 2);
      this.container.addChild(this.anomalyBadge.container);
    }

    this.anomalyBadge.container.visible = true;

    // Auto-clear after 30s
    if (this.anomalyAutoClearTimer) clearTimeout(this.anomalyAutoClearTimer);
    this.anomalyAutoClearTimer = setTimeout(() => this.clearAnomaly(), 30_000);
  }

  clearAnomaly(): void {
    this._hasAnomaly = false;
    if (this.anomalyBadge) this.anomalyBadge.container.visible = false;
    if (this.anomalyAutoClearTimer) {
      clearTimeout(this.anomalyAutoClearTimer);
      this.anomalyAutoClearTimer = null;
    }
  }

  /** Fade out and resolve when done */
  fadeOut(): Promise<void> {
    if (this.fadingOut) {
      // Already fading — return a promise that resolves with the existing fade
      return new Promise<void>((resolve) => {
        const prev = this.fadeResolve;
        this.fadeResolve = () => { prev?.(); resolve(); };
      });
    }
    this.fadingOut = true;
    this.fadeTimer = FADE_OUT_DURATION;
    return new Promise<void>((resolve) => {
      this.fadeResolve = resolve;
    });
  }

  /** Per-frame update */
  update(dt: number): void {
    // Spawn animation (scale up)
    if (this.spawnAnimTimer > 0) {
      this.spawnAnimTimer -= dt;
      if (this.spawnAnimTimer <= 0) {
        this.spawnAnimTimer = 0;
        this.container.scale.set(1);
      } else {
        const t = 1 - this.spawnAnimTimer / AgentSprite.SPAWN_ANIM_DURATION;
        // Elastic ease out
        const scale = 1 - Math.pow(2, -8 * t) * Math.cos(t * Math.PI * 3);
        this.container.scale.set(Math.max(0.3, Math.min(1, scale)));
      }
    }

    // Handle fade out
    if (this.fadingOut) {
      this.fadeTimer -= dt;
      this.container.alpha = Math.max(0, this.fadeTimer / FADE_OUT_DURATION);
      if (this.fadeTimer <= 0) {
        this.fadingOut = false;
        this.fadeResolve?.();
        this.fadeResolve = null;
      }
      return;
    }

    // Movement
    if (this.isMoving) {
      this.updateMovement(dt);
    } else {
      this.updateBob(dt);
    }

    // Accumulate idle time for standing → sleeping transition
    if (this.isIdleState && !this.isDoneState) {
      this.idleTimer += dt;
    }

    // Determine animation state
    if (this.isMoving) {
      this.animState = 'walk';
    } else if (this.isDoneState) {
      this.animState = 'done';
    } else if (this.isIdleState && this.idleTimer >= AgentSprite.IDLE_TO_SLEEP_MS) {
      this.animState = 'sleeping';
    } else if (this.speechBubble.isActive()) {
      this.animState = 'working';
    } else {
      this.animState = 'idle';
    }

    // Animate sprite frames
    this.frameTimer += dt;
    const fps = this.animState === 'walk' ? WALK_FPS
      : this.animState === 'sleeping' ? SLEEPING_FPS
      : IDLE_FPS;
    const frameDuration = 1000 / fps;

    if (this.animState === 'working') {
      this.sprite.texture = this.textures.working;
    } else if (this.animState === 'done') {
      this.sprite.texture = this.textures.done;
    } else {
      if (this.frameTimer >= frameDuration) {
        this.frameTimer -= frameDuration;
        this.frameIndex = (this.frameIndex + 1) % 2;
      }
      const frames = this.animState === 'walk' ? this.textures.walk
        : this.animState === 'sleeping' ? this.textures.sleeping
        : this.textures.idle;
      this.sprite.texture = frames[this.frameIndex];
    }

    // ZZZ floating animation for sleeping
    if (this.animState === 'sleeping') {
      this.zzzContainer.visible = true;
      this.zzzTimer += dt;
      for (let i = 0; i < this.zzzLetters.length; i++) {
        const offset = i / this.zzzLetters.length;
        const t = ((this.zzzTimer / ZZZ_CYCLE + offset) % 1);
        const z = this.zzzLetters[i];
        z.position.set(t * ZZZ_DRIFT, -t * ZZZ_HEIGHT);
        z.alpha = Math.max(0, 1 - t * 1.3);
        z.scale.set(0.5 + t * 0.6);
      }
    } else {
      this.zzzContainer.visible = false;
    }

    // Floating "?" animation for waiting-for-user
    if (this._isWaiting) {
      this.waitQContainer.visible = true;
      this.waitQTimer += dt;
      for (let i = 0; i < this.waitQLetters.length; i++) {
        const offset = i / this.waitQLetters.length;
        const t = ((this.waitQTimer / ZZZ_CYCLE + offset) % 1);
        const q = this.waitQLetters[i];
        q.position.set(t * ZZZ_DRIFT, -t * ZZZ_HEIGHT);
        q.alpha = Math.max(0, 1 - t * 1.3);
        q.scale.set(0.5 + t * 0.6);
      }
    } else {
      this.waitQContainer.visible = false;
    }

    // Sparkle animation for done
    if (this.isDoneState && this.sparkles.length > 0) {
      for (let i = 0; i < this.sparkles.length; i++) {
        const s = this.sparkles[i];
        s.phase += dt;
        const period = 2000 + i * 700;
        const t = (s.phase % period) / period;
        if (t < 0.15) {
          s.gfx.visible = true;
          s.gfx.alpha = t / 0.15;
        } else if (t < 0.3) {
          s.gfx.visible = true;
          s.gfx.alpha = 1 - (t - 0.15) / 0.15;
        } else {
          s.gfx.visible = false;
        }
      }
    }

    // Activity ring (skip normal logic while outcome flash is active)
    if (this.outcomeFlash) {
      // Handled below in outcome flash section
    } else
    // Activity ring (orange when waiting for user, green otherwise)
    if (this._isWaiting) {
      // Persistent pulsing orange ring when waiting for user input
      this.activityRing.visible = true;
      this.activityPhase += dt * 0.004;
      this.activityRing.clear();
      const radius = this.spriteHeight / 2 + 6;
      const pulseAlpha = 0.4 + 0.3 * Math.sin(this.activityPhase * 2);
      const arcLen = Math.PI * 1.2;
      for (let i = 0; i < 2; i++) {
        const start = this.activityPhase + i * Math.PI;
        this.activityRing.arc(0, 0, radius, start, start + arcLen)
          .stroke({ color: 0xff9800, width: 2.5, alpha: pulseAlpha });
      }
      for (let i = 0; i < 2; i++) {
        const start = this.activityPhase + i * Math.PI;
        this.activityRing.arc(0, 0, radius + 2, start, start + arcLen * 0.8)
          .stroke({ color: 0xff9800, width: 3, alpha: pulseAlpha * 0.3 });
      }
    } else {
      this.activityLevel = Math.max(0, this.activityLevel - dt * 0.0004); // decay
      if (this.activityLevel > 0.02 && !this.isDoneState) {
        this.activityRing.visible = true;
        this.activityPhase += dt * 0.003;
        this.activityRing.clear();
        const radius = this.spriteHeight / 2 + 6;
        const alpha = this.activityLevel * 0.6;
        // Draw rotating arc segments
        const arcLen = Math.PI * 0.4 + this.activityLevel * Math.PI * 0.8;
        for (let i = 0; i < 2; i++) {
          const start = this.activityPhase + i * Math.PI;
          this.activityRing.arc(0, 0, radius, start, start + arcLen)
            .stroke({ color: 0x4ade80, width: 2, alpha });
        }
        // Outer glow
        if (this.activityLevel > 0.3) {
          for (let i = 0; i < 2; i++) {
            const start = this.activityPhase + i * Math.PI;
            this.activityRing.arc(0, 0, radius + 2, start, start + arcLen * 0.8)
              .stroke({ color: 0x4ade80, width: 3, alpha: alpha * 0.25 });
          }
        }
      } else {
        this.activityRing.visible = false;
      }
    }

    // Planning badge pulse
    if (this._isPlanning && this.planBadge?.container.visible) {
      this.planPulseTimer += dt * 0.003;
      const pulseAlpha = 0.7 + 0.3 * Math.sin(this.planPulseTimer);
      this.drawPlanBadge(pulseAlpha);
    }

    // Compacting badge pulse
    if (this._isCompacting && this.compactBadge?.container.visible) {
      this.compactPulseTimer += dt * 0.003;
      const pulseAlpha = 0.65 + 0.35 * Math.sin(this.compactPulseTimer * 1.5);
      this.drawCompactBadge(pulseAlpha);
      // Gently rotate the ↺ symbol via badge scale oscillation
      const scaleX = 1 + 0.04 * Math.sin(this.compactPulseTimer * 2);
      this.compactBadge.container.scale.set(scaleX, 1);
    }

    // Outcome flash (brief green or red ring)
    if (this.outcomeFlash) {
      this.outcomeFlash.timer -= dt;
      if (this.outcomeFlash.timer <= 0) {
        this.outcomeFlash = null;
        this.activityRing.visible = false;
      } else {
        const progress = this.outcomeFlash.timer / AgentSprite.OUTCOME_FLASH_DURATION;
        const alpha = progress * 0.85;
        const radius = this.spriteHeight / 2 + 6 + (1 - progress) * 8;
        const color = this.outcomeFlash.outcome === 'success' ? 0x4ade80 : 0xf87171;
        this.activityRing.visible = true;
        this.activityRing.clear();
        this.activityRing
          .circle(0, 0, radius)
          .stroke({ color, width: 3, alpha });
        // Second expanding ring
        this.activityRing
          .circle(0, 0, radius + 4)
          .stroke({ color, width: 1.5, alpha: alpha * 0.4 });
      }
    }

    // Anomaly badge pulse
    if (this._hasAnomaly && this.anomalyBadge?.container.visible && this.anomalyBadge.bg) {
      this.anomalyPulseTimer += dt * 0.005;
      const pulseScale = 0.85 + 0.15 * Math.sin(this.anomalyPulseTimer);
      this.anomalyBadge.container.scale.set(pulseScale);
      drawCircleBadge(this.anomalyBadge.bg, 8, 0xef4444, 0xfbbf24, 1.5, 0.9, 0.7);
    }

    // Waiting badge pulse (faster, more urgent)
    if (this._isWaiting && this.waitBadge?.container.visible) {
      this.waitPulseTimer += dt * 0.005;
      const pulseAlpha = 0.5 + 0.5 * Math.sin(this.waitPulseTimer);
      this.drawWaitBadge(pulseAlpha);
      // Also pulse the badge scale for extra attention
      const scale = 1 + 0.15 * Math.sin(this.waitPulseTimer * 0.7);
      this.waitBadge.container.scale.set(scale);
    }

    // Speech bubble update
    this.speechBubble.update(dt);
  }

  private updateMovement(dt: number): void {
    const dtSec = dt / 1000;
    const dx = this.targetX - this.container.x;
    const dy = this.targetY - this.container.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ARRIVAL_THRESHOLD) {
      this.container.x = this.targetX;
      this.container.y = this.targetY;
      this.baseY = this.container.y;
      this.isMoving = false;
      return;
    }

    const step = Math.min(MOVE_SPEED * dtSec, dist);
    this.container.x += (dx / dist) * step;
    this.container.y += (dy / dist) * step;
  }

  private updateBob(dt: number): void {
    const amp = this.animState === 'sleeping' ? SLEEPING_BOB_AMPLITUDE
      : this.animState === 'done' ? DONE_BOB_AMPLITUDE
      : BOB_AMPLITUDE;
    const spd = this.animState === 'sleeping' ? SLEEPING_BOB_SPEED
      : this.animState === 'done' ? DONE_BOB_SPEED
      : BOB_SPEED;
    this.bobTimer = (this.bobTimer + (dt / 1000) * spd * Math.PI * 2) % (Math.PI * 2);
    this.container.y = this.baseY + Math.sin(this.bobTimer) * amp;
  }

  /** Register a click handler on this sprite */
  onClick(handler: () => void): void {
    this.container.on('pointertap', handler);
  }

  /** Register hover handlers */
  onHover(enter: () => void, leave: () => void): void {
    this.container.on('pointerover', enter);
    this.container.on('pointerout', leave);
  }

  /** Get current world position */
  getPosition(): { x: number; y: number } {
    return { x: this.container.x, y: this.container.y };
  }

  destroy(): void {
    if (this.anomalyAutoClearTimer) {
      clearTimeout(this.anomalyAutoClearTimer);
      this.anomalyAutoClearTimer = null;
    }
    this.container.destroy({ children: true });
  }
}
