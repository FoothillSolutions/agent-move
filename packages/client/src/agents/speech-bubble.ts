import { Container, Graphics, Text, TextStyle } from 'pixi.js';

export interface SpeechMessage {
  text: string;
  type: 'tool' | 'text' | 'input-needed';
  icon?: string;
}

const SPEECH_DURATION = 3500;
const SPEECH_ROTATE_DURATION = 3000;
const SPEECH_FADE_DURATION = 500;
const BUBBLE_PAD_X = 8;
const BUBBLE_PAD_Y = 5;
const BUBBLE_RADIUS = 6;
const BUBBLE_MAX_WIDTH = 160;
const POINTER_SIZE = 5;

const BUBBLE_COLORS = {
  tool:           { bg: 0x1a2340, border: 0x3a5080, text: 0xe8f0ff },
  text:           { bg: 0x1a2340, border: 0x404860, text: 0xcccccc },
  'input-needed': { bg: 0x3a2010, border: 0xff9800, text: 0xffcc80 },
} as const;

/**
 * Self-contained speech bubble: holds its own Pixi container, manages the
 * message queue, rotation timer, and fade-out.  Call `update(dt)` each frame.
 */
export class SpeechBubble {
  public readonly container: Container;

  private bg: Graphics;
  private pointer: Graphics;
  private textObj: Text;

  private speechTimer = 0;
  private queue: SpeechMessage[] = [];
  private currentIndex = 0;
  private rotateTimer = 0;
  private currentType: SpeechMessage['type'] = 'tool';
  private needsInputPulse = 0;

  constructor(spriteHeight: number) {
    this.container = new Container();
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.pointer = new Graphics();
    this.container.addChild(this.pointer);

    const speechStyle = new TextStyle({
      fontSize: 10,
      fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      fill: 0xe8f0ff,
      wordWrap: true,
      wordWrapWidth: BUBBLE_MAX_WIDTH - BUBBLE_PAD_X * 2,
      lineHeight: 14,
    });
    this.textObj = new Text({ text: '', style: speechStyle });
    this.textObj.anchor.set(0.5, 1);
    this.container.addChild(this.textObj);

    this.container.position.set(0, -spriteHeight / 2 - 8);
  }

  /** Replace the current queue and start showing messages */
  set(messages: SpeechMessage | SpeechMessage[]): void {
    const msgArray = Array.isArray(messages) ? messages : [messages];
    if (msgArray.length === 0 || (msgArray.length === 1 && !msgArray[0].text)) {
      this.clear();
      return;
    }

    this.queue = msgArray.filter(m => m.text);
    if (this.queue.length === 0) {
      this.clear();
      return;
    }

    this.currentIndex = 0;
    this.rotateTimer = 0;
    this.speechTimer = SPEECH_DURATION;
    this.showCurrentMessage();
  }

  /** Hide and reset the speech bubble */
  clear(): void {
    this.container.visible = false;
    this.speechTimer = 0;
    this.queue = [];
    this.currentIndex = 0;
    this.needsInputPulse = 0;
  }

  /** Per-frame update — call from AgentSprite.update() */
  update(dt: number): void {
    if (this.speechTimer <= 0) return;

    this.speechTimer -= dt;

    // Rotate through queue
    if (this.queue.length > 1) {
      this.rotateTimer += dt;
      if (this.rotateTimer >= SPEECH_ROTATE_DURATION) {
        this.rotateTimer = 0;
        this.currentIndex = (this.currentIndex + 1) % this.queue.length;
        this.showCurrentMessage();
        this.speechTimer = SPEECH_DURATION;
      }
    }

    // Input-needed pulse effect
    if (this.currentType === 'input-needed') {
      this.needsInputPulse += dt * 0.004;
      const pulseAlpha = 0.7 + 0.3 * Math.sin(this.needsInputPulse);
      this.bg.alpha = pulseAlpha;
      // Keep bubble visible longer for input-needed
      this.speechTimer = Math.max(this.speechTimer, 1000);
    } else {
      this.bg.alpha = 1;
    }

    // Fade out at end
    if (this.speechTimer <= SPEECH_FADE_DURATION && this.currentType !== 'input-needed') {
      this.container.alpha = Math.max(0, this.speechTimer / SPEECH_FADE_DURATION);
    }
    if (this.speechTimer <= 0 && this.currentType !== 'input-needed') {
      this.container.visible = false;
      this.speechTimer = 0;
      this.queue = [];
    }
  }

  /** Whether the bubble is currently showing (used for animState logic) */
  isActive(): boolean {
    return this.speechTimer > 0;
  }

  private showCurrentMessage(): void {
    const msg = this.queue[this.currentIndex];
    if (!msg) return;

    this.currentType = msg.type;
    const colors = BUBBLE_COLORS[msg.type];

    const icon = msg.icon ?? '';
    const prefix = icon ? `${icon} ` : '';
    const maxChars = 80;
    const rawText = prefix + msg.text;
    const display = rawText.length > maxChars ? rawText.slice(0, maxChars - 1) + '\u2026' : rawText;

    this.textObj.text = display;
    this.textObj.style.fill = colors.text;

    const textW = Math.min(this.textObj.width, BUBBLE_MAX_WIDTH - BUBBLE_PAD_X * 2);
    const textH = this.textObj.height;
    const bgW = textW + BUBBLE_PAD_X * 2;
    const bgH = textH + BUBBLE_PAD_Y * 2;

    this.bg.clear();
    this.bg
      .roundRect(-bgW / 2, -(bgH + POINTER_SIZE), bgW, bgH, BUBBLE_RADIUS)
      .fill({ color: colors.bg, alpha: 0.92 })
      .stroke({ color: colors.border, width: 1, alpha: 0.6 });

    this.pointer.clear();
    this.pointer
      .moveTo(-POINTER_SIZE, 0)
      .lineTo(0, POINTER_SIZE)
      .lineTo(POINTER_SIZE, 0)
      .closePath()
      .fill({ color: colors.bg, alpha: 0.92 });
    this.pointer.position.set(0, -(POINTER_SIZE + 1));

    this.textObj.position.set(0, -(POINTER_SIZE + BUBBLE_PAD_Y));

    this.container.visible = true;
    this.container.alpha = 1;
  }
}
