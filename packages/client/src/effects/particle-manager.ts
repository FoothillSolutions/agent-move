import { Container, Graphics, Sprite, Texture } from 'pixi.js';

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

const PARTICLE_COUNT = 8;
const PARTICLE_SIZE = 3;
const PARTICLE_LIFE = 800; // ms
const PARTICLE_SPEED = 30; // pixels/sec

/**
 * Simple particle effects.
 * Small colored dots emit when an agent uses a tool,
 * then fade and drift upward.
 */
export class ParticleManager {
  public readonly container = new Container();
  private particles: Particle[] = [];
  private particleTextures = new Map<number, Texture>();

  constructor(private renderer: any) {}

  /** Emit particles at a position with a given color */
  emit(x: number, y: number, color: number): void {
    const texture = this.getTexture(color);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(x, y);
      sprite.alpha = 1;

      const angle = Math.random() * Math.PI * 2;
      const speed = PARTICLE_SPEED * (0.5 + Math.random() * 0.5);

      this.container.addChild(sprite);
      this.particles.push({
        sprite,
        vx: Math.cos(angle) * speed,
        vy: -Math.abs(Math.sin(angle) * speed) - PARTICLE_SPEED * 0.5, // bias upward
        life: PARTICLE_LIFE,
        maxLife: PARTICLE_LIFE,
      });
    }
  }

  /** Update all particles, remove dead ones */
  update(dt: number): void {
    const dtSec = dt / 1000;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.container.removeChild(p.sprite);
        p.sprite.destroy();
        this.particles.splice(i, 1);
        continue;
      }

      // Move
      p.sprite.x += p.vx * dtSec;
      p.sprite.y += p.vy * dtSec;

      // Fade
      p.sprite.alpha = Math.max(0, p.life / p.maxLife);

      // Shrink
      const scale = 0.3 + 0.7 * (p.life / p.maxLife);
      p.sprite.scale.set(scale);
    }
  }

  private getTexture(color: number): Texture {
    let tex = this.particleTextures.get(color);
    if (tex) return tex;

    const g = new Graphics();
    g.circle(PARTICLE_SIZE, PARTICLE_SIZE, PARTICLE_SIZE).fill(color);
    tex = this.renderer.generateTexture({ target: g });
    g.destroy();
    this.particleTextures.set(color, tex);
    return tex;
  }

  destroy(): void {
    for (const p of this.particles) {
      p.sprite.destroy();
    }
    this.particles = [];
    for (const tex of this.particleTextures.values()) {
      tex.destroy(true);
    }
    this.particleTextures.clear();
    this.container.destroy({ children: true });
  }
}
