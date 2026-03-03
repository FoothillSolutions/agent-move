import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { AgentState, AgentPalette } from '@agent-move/shared';
import { COLORS } from '@agent-move/shared';
import { MAIN_SPRITES, SUB_SPRITES, type SpriteSet } from '../sprites/sprite-data.js';
import { createSpriteTexture, spriteKey } from '../sprites/sprite-factory.js';

type AnimState = 'idle' | 'walk' | 'working' | 'sleeping' | 'done';

export interface SpeechMessage {
  text: string;
  type: 'tool' | 'text' | 'input-needed';
  icon?: string;
}

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
const SPEECH_DURATION = 3500;
const SPEECH_ROTATE_DURATION = 3000; // time per message in queue
const SPEECH_FADE_DURATION = 500;
const FADE_OUT_DURATION = 600;
const BUBBLE_PAD_X = 8;
const BUBBLE_PAD_Y = 5;
const BUBBLE_RADIUS = 6;
const BUBBLE_MAX_WIDTH = 160;
const POINTER_SIZE = 5;
const ZZZ_CYCLE = 3000;
const ZZZ_HEIGHT = 30;
const ZZZ_DRIFT = 18;

// Bubble colors by type
const BUBBLE_COLORS = {
  tool:         { bg: 0x1a2340, border: 0x3a5080, text: 0xe8f0ff },
  text:         { bg: 0x1a2340, border: 0x404860, text: 0xcccccc },
  'input-needed': { bg: 0x3a2010, border: 0xff9800, text: 0xffcc80 },
} as const;

/**
 * Animated agent sprite with name label and speech bubble.
 * Handles its own movement, animation, and speech.
 */
export class AgentSprite {
  public readonly container = new Container();

  private sprite: Sprite;
  private nameLabel: Text;

  // Speech bubble components
  private speechBubble: Container;
  private speechBg: Graphics;
  private speechText: Text;
  private speechPointer: Graphics;
  private speechTimer = 0;
  private speechQueue: SpeechMessage[] = [];
  private currentSpeechIndex = 0;
  private rotateTimer = 0;
  private currentSpeechType: SpeechMessage['type'] = 'tool';

  // Input-needed pulse
  private needsInputPulse = 0;

  // Child count badge
  private childBadge: Container | null = null;
  private childBadgeBg: Graphics | null = null;
  private childBadgeText: Text | null = null;

  // Planning mode badge
  private planBadge: Container | null = null;
  private planBadgeBg: Graphics | null = null;
  private planBadgeText: Text | null = null;
  private planPulseTimer = 0;
  private _isPlanning = false;

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
  private doneBadge: Container | null = null;
  private doneBadgeBg: Graphics | null = null;
  private doneBadgeText: Text | null = null;

  // Done sparkles
  private sparkles: { gfx: Graphics; phase: number }[] = [];

  // Activity ring
  private activityRing: Graphics;
  private activityLevel = 0; // 0..1, decays over time
  private activityPhase = 0; // rotation animation

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
    const isSubagent = agent.role === 'subagent';
    const spriteSet: SpriteSet = isSubagent ? SUB_SPRITES : MAIN_SPRITES;
    const keyPrefix = isSubagent ? 'sub' : 'main';
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

    // Name label below sprite
    const rawName = agent.agentName || agent.projectName || agent.id.slice(0, 8);
    const name = rawName.length > 14 ? rawName.slice(0, 12) + '..' : rawName;
    const labelStyle = new TextStyle({
      fontSize: 13,
      fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      fill: COLORS.text,
      align: 'center',
      fontWeight: '600',
      dropShadow: {
        alpha: 0.8,
        blur: 2,
        color: 0x000000,
        distance: 1,
      },
    });
    this.nameLabel = new Text({ text: name, style: labelStyle });
    this.nameLabel.anchor.set(0.5, 0);
    this.nameLabel.position.set(0, this.spriteHeight / 2 + 6);
    this.container.addChild(this.nameLabel);

    // Speech bubble with background
    this.speechBubble = new Container();
    this.speechBubble.visible = false;

    this.speechBg = new Graphics();
    this.speechBubble.addChild(this.speechBg);

    this.speechPointer = new Graphics();
    this.speechBubble.addChild(this.speechPointer);

    const speechStyle = new TextStyle({
      fontSize: 10,
      fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      fill: 0xe8f0ff,
      wordWrap: true,
      wordWrapWidth: BUBBLE_MAX_WIDTH - BUBBLE_PAD_X * 2,
      lineHeight: 14,
    });
    this.speechText = new Text({ text: '', style: speechStyle });
    this.speechText.anchor.set(0.5, 1);
    this.speechBubble.addChild(this.speechText);
    this.speechBubble.position.set(0, -this.spriteHeight / 2 - 8);
    this.container.addChild(this.speechBubble);

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

    // Activity ring (drawn behind sprite)
    this.activityRing = new Graphics();
    this.activityRing.visible = false;
    this.container.addChildAt(this.activityRing, 0);

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
    const msgArray = Array.isArray(messages) ? messages : [messages];
    if (msgArray.length === 0 || (msgArray.length === 1 && !msgArray[0].text)) {
      this.clearSpeech();
      return;
    }

    this.speechQueue = msgArray.filter(m => m.text);
    if (this.speechQueue.length === 0) {
      this.clearSpeech();
      return;
    }

    this.currentSpeechIndex = 0;
    this.rotateTimer = 0;
    this.speechTimer = SPEECH_DURATION;
    this.showCurrentMessage();
  }

  /** Clear speech bubble */
  clearSpeech(): void {
    this.speechBubble.visible = false;
    this.speechTimer = 0;
    this.speechQueue = [];
    this.currentSpeechIndex = 0;
    this.needsInputPulse = 0;
  }

  private showCurrentMessage(): void {
    const msg = this.speechQueue[this.currentSpeechIndex];
    if (!msg) return;

    this.currentSpeechType = msg.type;
    const colors = BUBBLE_COLORS[msg.type];

    // Format text with icon prefix
    const icon = msg.icon || '';
    const prefix = icon ? `${icon} ` : '';
    const maxChars = 80;
    const rawText = prefix + msg.text;
    const display = rawText.length > maxChars ? rawText.slice(0, maxChars - 1) + '\u2026' : rawText;

    this.speechText.text = display;
    this.speechText.style.fill = colors.text;

    // Measure text to size background
    const textW = Math.min(this.speechText.width, BUBBLE_MAX_WIDTH - BUBBLE_PAD_X * 2);
    const textH = this.speechText.height;
    const bgW = textW + BUBBLE_PAD_X * 2;
    const bgH = textH + BUBBLE_PAD_Y * 2;

    // Draw rounded rect background
    this.speechBg.clear();
    this.speechBg
      .roundRect(-bgW / 2, -(bgH + POINTER_SIZE), bgW, bgH, BUBBLE_RADIUS)
      .fill({ color: colors.bg, alpha: 0.92 })
      .stroke({ color: colors.border, width: 1, alpha: 0.6 });

    // Draw pointer triangle
    this.speechPointer.clear();
    this.speechPointer
      .moveTo(-POINTER_SIZE, 0)
      .lineTo(0, POINTER_SIZE)
      .lineTo(POINTER_SIZE, 0)
      .closePath()
      .fill({ color: colors.bg, alpha: 0.92 });
    this.speechPointer.position.set(0, -(POINTER_SIZE + 1));

    // Position text centered in background
    this.speechText.position.set(0, -(POINTER_SIZE + BUBBLE_PAD_Y));

    this.speechBubble.visible = true;
    this.speechBubble.alpha = 1;
  }

  /** Set idle visual state */
  /** Update the displayed name label (e.g. when agentName is discovered after spawn) */
  updateName(agent: AgentState): void {
    const rawName = agent.agentName || agent.projectName || agent.id.slice(0, 8);
    const name = rawName.length > 14 ? rawName.slice(0, 12) + '..' : rawName;
    if (this.nameLabel.text !== name) {
      this.nameLabel.text = name;
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
      // Create done badge (green checkmark)
      if (!this.doneBadge) {
        this.doneBadge = new Container();
        this.doneBadgeBg = new Graphics();
        this.doneBadge.addChild(this.doneBadgeBg);

        this.doneBadgeText = new Text({
          text: '\u2713',
          style: new TextStyle({
            fontSize: 10,
            fontFamily: "'Segoe UI', sans-serif",
            fill: 0xffffff,
            fontWeight: '700',
          }),
        });
        this.doneBadgeText.anchor.set(0.5, 0.5);
        this.doneBadge.addChild(this.doneBadgeText);

        this.doneBadge.position.set(0, -this.spriteHeight / 2 - 14);
        this.container.addChild(this.doneBadge);
      }

      this.doneBadgeBg!.clear();
      this.doneBadgeBg!
        .circle(0, 0, 8)
        .fill({ color: 0x4caf50, alpha: 0.9 })
        .stroke({ color: 0x81c784, width: 1.5, alpha: 0.7 });
      this.doneBadge.visible = true;

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
      if (this.doneBadge) this.doneBadge.visible = false;
      for (const s of this.sparkles) s.gfx.visible = false;
    }
  }

  /** Update child count badge */
  setChildCount(count: number): void {
    if (count <= 0) {
      if (this.childBadge) {
        this.childBadge.visible = false;
      }
      return;
    }

    if (!this.childBadge) {
      this.childBadge = new Container();
      this.childBadgeBg = new Graphics();
      this.childBadge.addChild(this.childBadgeBg);

      this.childBadgeText = new Text({
        text: '',
        style: new TextStyle({
          fontSize: 9,
          fontFamily: "'Segoe UI', sans-serif",
          fill: 0xffffff,
          fontWeight: '700',
        }),
      });
      this.childBadgeText.anchor.set(0.5, 0.5);
      this.childBadge.addChild(this.childBadgeText);

      this.childBadge.position.set(this.spriteHeight / 2 - 4, -this.spriteHeight / 2 + 4);
      this.container.addChild(this.childBadge);
    }

    this.childBadgeText!.text = `${count}`;
    const r = 8;
    this.childBadgeBg!.clear();
    this.childBadgeBg!
      .circle(0, 0, r)
      .fill({ color: 0xab47bc })
      .stroke({ color: 0xffffff, width: 1, alpha: 0.5 });

    this.childBadge.visible = true;
  }

  /** Show or hide planning mode badge */
  setPlanning(planning: boolean): void {
    this._isPlanning = planning;

    if (!planning) {
      if (this.planBadge) this.planBadge.visible = false;
      return;
    }

    if (!this.planBadge) {
      this.planBadge = new Container();

      this.planBadgeBg = new Graphics();
      this.planBadge.addChild(this.planBadgeBg);

      this.planBadgeText = new Text({
        text: 'PLAN',
        style: new TextStyle({
          fontSize: 8,
          fontFamily: "'Segoe UI', sans-serif",
          fill: 0xffffff,
          fontWeight: '700',
          letterSpacing: 0.5,
        }),
      });
      this.planBadgeText.anchor.set(0.5, 0.5);
      this.planBadge.addChild(this.planBadgeText);

      // Position above and to the left of the sprite
      this.planBadge.position.set(-this.spriteHeight / 2 + 2, -this.spriteHeight / 2 + 2);
      this.container.addChild(this.planBadge);
    }

    this.drawPlanBadge(1);
    this.planBadge.visible = true;
  }

  private drawPlanBadge(alpha: number): void {
    if (!this.planBadgeBg) return;
    const w = 30;
    const h = 13;
    this.planBadgeBg.clear();
    this.planBadgeBg
      .roundRect(-w / 2, -h / 2, w, h, 3)
      .fill({ color: 0xf97316, alpha: alpha * 0.9 })
      .stroke({ color: 0xfbbf24, width: 1, alpha: alpha * 0.7 });
  }

  /** Bump activity level (called on each tool use) */
  bumpActivity(): void {
    this.activityLevel = Math.min(1, this.activityLevel + 0.35);
  }

  /** Fade out and resolve when done */
  fadeOut(): Promise<void> {
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
      const t = 1 - Math.max(0, this.spawnAnimTimer / AgentSprite.SPAWN_ANIM_DURATION);
      // Elastic ease out
      const scale = 1 - Math.pow(2, -8 * t) * Math.cos(t * Math.PI * 3);
      this.container.scale.set(Math.max(0.3, scale));
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
    } else if (this.speechTimer > 0) {
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

    // Activity ring
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

    // Planning badge pulse
    if (this._isPlanning && this.planBadge?.visible) {
      this.planPulseTimer += dt * 0.003;
      const pulseAlpha = 0.7 + 0.3 * Math.sin(this.planPulseTimer);
      this.drawPlanBadge(pulseAlpha);
    }

    // Speech bubble: rotation and timer
    if (this.speechTimer > 0) {
      this.speechTimer -= dt;

      // Rotate through queue
      if (this.speechQueue.length > 1) {
        this.rotateTimer += dt;
        if (this.rotateTimer >= SPEECH_ROTATE_DURATION) {
          this.rotateTimer = 0;
          this.currentSpeechIndex = (this.currentSpeechIndex + 1) % this.speechQueue.length;
          this.showCurrentMessage();
          this.speechTimer = SPEECH_DURATION; // reset timer on rotate
        }
      }

      // Input-needed pulse effect
      if (this.currentSpeechType === 'input-needed') {
        this.needsInputPulse += dt * 0.004;
        const pulseAlpha = 0.7 + 0.3 * Math.sin(this.needsInputPulse);
        this.speechBg.alpha = pulseAlpha;
        // Keep bubble visible longer for input-needed
        this.speechTimer = Math.max(this.speechTimer, 1000);
      } else {
        this.speechBg.alpha = 1;
      }

      // Fade out at end
      if (this.speechTimer <= SPEECH_FADE_DURATION && this.currentSpeechType !== 'input-needed') {
        this.speechBubble.alpha = Math.max(0, this.speechTimer / SPEECH_FADE_DURATION);
      }
      if (this.speechTimer <= 0 && this.currentSpeechType !== 'input-needed') {
        this.speechBubble.visible = false;
        this.speechTimer = 0;
        this.speechQueue = [];
      }
    }
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
    this.bobTimer += (dt / 1000) * spd * Math.PI * 2;
    this.container.y = this.baseY + Math.sin(this.bobTimer) * amp;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
