import { Container, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { AgentState, AgentPalette } from '@agentflow/shared';
import { COLORS } from '@agentflow/shared';
import { MAIN_SPRITES, SUB_SPRITES, type SpriteSet } from '../sprites/sprite-data.js';
import { createSpriteTexture, spriteKey } from '../sprites/sprite-factory.js';

type AnimState = 'idle' | 'walk' | 'working';

const IDLE_FPS = 2;
const WALK_FPS = 4;
const MOVE_SPEED = 100; // pixels per second
const ARRIVAL_THRESHOLD = 3;
const BOB_AMPLITUDE = 1.5;
const BOB_SPEED = 2;
const SPEECH_DURATION = 3000;
const SPEECH_FADE_DURATION = 500;
const FADE_OUT_DURATION = 600;

/**
 * Animated agent sprite with name label and speech bubble.
 * Handles its own movement, animation, and speech.
 */
export class AgentSprite {
  public readonly container = new Container();

  private sprite: Sprite;
  private nameLabel: Text;
  private speechBubble: Container;
  private speechText: Text;
  private speechTimer = 0;

  private animState: AnimState = 'idle';
  private isIdleState = false;

  private textures: {
    idle: [Texture, Texture];
    walk: [Texture, Texture];
    working: Texture;
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

  constructor(
    agent: AgentState,
    palette: AgentPalette,
    renderer: any,
  ) {
    const isSubagent = agent.role === 'subagent';
    const spriteSet: SpriteSet = isSubagent ? SUB_SPRITES : MAIN_SPRITES;
    const keyPrefix = isSubagent ? 'sub' : 'main';
    const ci = agent.colorIndex;

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
    };

    // Create sprite
    this.sprite = new Sprite(this.textures.idle[0]);
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);

    // Name label below sprite
    const spriteHeight = spriteSet.size * 3;
    const rawName = agent.projectName || agent.id.slice(0, 8);
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
    this.nameLabel.position.set(0, spriteHeight / 2 + 6);
    this.container.addChild(this.nameLabel);

    // Speech bubble (hidden by default)
    this.speechBubble = new Container();
    this.speechBubble.visible = false;

    const speechStyle = new TextStyle({
      fontSize: 11,
      fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      fill: 0xffdd57,
      wordWrap: true,
      wordWrapWidth: 140,
      dropShadow: {
        alpha: 0.9,
        blur: 3,
        color: 0x000000,
        distance: 1,
      },
    });
    this.speechText = new Text({ text: '', style: speechStyle });
    this.speechText.anchor.set(0.5, 1);
    this.speechText.position.set(0, -4);
    this.speechBubble.addChild(this.speechText);
    this.speechBubble.position.set(0, -spriteHeight / 2 - 10);
    this.container.addChild(this.speechBubble);

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

  /** Show speech bubble text */
  setSpeech(text: string): void {
    if (!text) {
      // Clear speech
      this.speechBubble.visible = false;
      this.speechTimer = 0;
      return;
    }
    const display = text.length > 60 ? text.slice(0, 57) + '...' : text;
    this.speechText.text = display;
    this.speechBubble.visible = true;
    this.speechBubble.alpha = 1;
    this.speechTimer = SPEECH_DURATION;
  }

  /** Set idle visual state */
  setIdle(idle: boolean): void {
    this.isIdleState = idle;
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

    // Determine animation state
    if (this.isMoving) {
      this.animState = 'walk';
    } else if (this.isIdleState) {
      this.animState = 'idle';
    } else if (this.speechTimer > 0) {
      this.animState = 'working';
    } else {
      this.animState = 'idle';
    }

    // Animate sprite frames
    this.frameTimer += dt;
    const fps = this.animState === 'walk' ? WALK_FPS : IDLE_FPS;
    const frameDuration = 1000 / fps;

    if (this.animState === 'working') {
      this.sprite.texture = this.textures.working;
    } else {
      if (this.frameTimer >= frameDuration) {
        this.frameTimer -= frameDuration;
        this.frameIndex = (this.frameIndex + 1) % 2;
      }
      const frames = this.animState === 'walk' ? this.textures.walk : this.textures.idle;
      this.sprite.texture = frames[this.frameIndex];
    }

    // Update speech bubble timer
    if (this.speechTimer > 0) {
      this.speechTimer -= dt;
      if (this.speechTimer <= SPEECH_FADE_DURATION) {
        this.speechBubble.alpha = Math.max(0, this.speechTimer / SPEECH_FADE_DURATION);
      }
      if (this.speechTimer <= 0) {
        this.speechBubble.visible = false;
        this.speechTimer = 0;
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
    this.bobTimer += (dt / 1000) * BOB_SPEED * Math.PI * 2;
    this.container.y = this.baseY + Math.sin(this.bobTimer) * BOB_AMPLITUDE;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
