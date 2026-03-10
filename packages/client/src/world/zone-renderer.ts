import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { ZONES } from '@agent-move/shared';
import type { ZoneConfig, ZoneId } from '@agent-move/shared';
import { ZONE_DECORATORS } from './furniture.js';
import type { ZoneDecoratorFn } from './themes/theme-types.js';

interface ZoneDisplay {
  container: Container;
  staticBg: Graphics;
  glowBorder: Graphics;
  outerGlow: Graphics;
  config: ZoneConfig;
  agentCount: number;
  currentGlow: number;
}

const BORDER_RADIUS = 4;          // Small radius — pixel art rooms have sharp corners
const GLOW_ALPHA_IDLE = 0.0;
const GLOW_ALPHA_ACTIVE = 0.8;
const OUTER_GLOW_ALPHA_ACTIVE = 0.2;
const BORDER_WIDTH_IDLE = 0;
const BORDER_WIDTH_ACTIVE = 3;

// Glass panel colors (fallback dark theme)
const GLASS_BG = 0x1a1a2e;
const GLASS_ALPHA = 0.55;
const GLASS_HIGHLIGHT = 0xffffff;
const GLASS_HIGHLIGHT_ALPHA = 0.04;

// ── Pixel-art room wall constants ────────────────────────────
const WALL_W = 8;             // Wall thickness in pixels
const WALL_TOP_COLOR    = 0xb8aaa0;  // Top/back wall face (shadowed)
const WALL_TOP_LIT      = 0xd0c4b8;  // Top wall inner highlight strip
const WALL_SIDE_COLOR   = 0xd8cec4;  // Left/right wall face (mid)
const WALL_BOTTOM_COLOR = 0xe8ddd4;  // South/front wall face (lit)
const WALL_CORNER_DARK  = 0xa09088;  // Dark corner pixels
const DOORWAY_COLOR     = 0xd4c8b8;  // Doorway opening (matches hallway)

/**
 * Renders zone panels as Gather.town-style pixel-art office rooms.
 * Each room has: thick top/left wall (shadowed), thinner south/right face (lit),
 * interior floor decorator, and an animated color glow when agents are present.
 */
export class ZoneRenderer {
  private zones = new Map<ZoneId, ZoneDisplay>();
  public readonly container = new Container();
  private themeDecorators: Record<string, ZoneDecoratorFn> | null = null;
  private useRetro = false;

  /** Override decorators with a custom theme */
  setThemeDecorators(decorators: Record<string, ZoneDecoratorFn>): void {
    this.themeDecorators = decorators;
    this.useRetro = !!decorators;
    this.rebuild();
  }

  constructor() {
    for (const zone of ZONES) {
      const zoneDisplay = this.createZone(zone);
      this.zones.set(zone.id, zoneDisplay);
      this.container.addChild(zoneDisplay.container);
    }
  }

  private createZone(config: ZoneConfig): ZoneDisplay {
    const container = new Container();
    container.position.set(config.x, config.y);

    // Outer glow layer (animated, behind room)
    const outerGlow = new Graphics();
    container.addChild(outerGlow);

    // Static room background
    const staticBg = new Graphics();
    this.drawRoom(staticBg, config);
    container.addChild(staticBg);

    // Dynamic glow border
    const glowBorder = new Graphics();
    container.addChild(glowBorder);

    // Room label
    if (this.useRetro) {
      this.addRetroLabel(container, config);
    } else {
      this.addGlassLabel(container, config);
    }

    return { container, staticBg, glowBorder, outerGlow, config, agentCount: 0, currentGlow: 0 };
  }

  /** Gather.town-style room label: dark pill at top-left inside wall */
  private addRetroLabel(container: Container, config: ZoneConfig): void {
    const labelStyle = new TextStyle({
      fontSize: 11,
      fontFamily: "'Inter', 'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
      fill: 0xffffff,
      fontWeight: '700',
      letterSpacing: 0.5,
    });
    const label = new Text({ text: `${config.icon} ${config.label}`, style: labelStyle });
    label.position.set(WALL_W + 8, 2);

    const pillW = label.width + 16;
    const pillH = label.height + 6;
    const labelBg = new Graphics();
    labelBg.roundRect(WALL_W + 2, 0, pillW, pillH, 4)
      .fill({ color: 0x000000, alpha: 0.55 });
    container.addChild(labelBg);
    container.addChild(label);
  }

  /** Glass theme label */
  private addGlassLabel(container: Container, config: ZoneConfig): void {
    const labelStyle = new TextStyle({
      fontSize: 13,
      fontFamily: "'Inter', 'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
      fill: 0xffffff,
      fontWeight: '600',
      letterSpacing: 0.5,
      dropShadow: {
        alpha: 0.6,
        blur: 4,
        color: 0x000000,
        distance: 0,
      },
    });
    const label = new Text({ text: `${config.icon} ${config.label}`, style: labelStyle });
    label.position.set(14, 10);
    container.addChild(label);

    const labelBg = new Graphics();
    const pillW = label.width + 20;
    const pillH = label.height + 8;
    labelBg.roundRect(6, 5, pillW, pillH, 8)
      .fill({ color: 0x000000, alpha: 0.3 });
    container.addChildAt(labelBg, container.children.length - 1);
  }

  /** Draw the zone panel */
  private drawRoom(g: Graphics, config: ZoneConfig): void {
    if (this.useRetro) {
      this.drawPixelRoom(g, config);
      return;
    }
    // Glassmorphism fallback
    g.roundRect(0, 0, config.width, config.height, BORDER_RADIUS)
      .fill({ color: GLASS_BG, alpha: GLASS_ALPHA });
    g.roundRect(1, 1, config.width - 2, config.height / 3, BORDER_RADIUS)
      .fill({ color: GLASS_HIGHLIGHT, alpha: GLASS_HIGHLIGHT_ALPHA });
    g.roundRect(0, 0, config.width, config.height, BORDER_RADIUS)
      .stroke({ color: config.color, width: BORDER_WIDTH_IDLE, alpha: GLOW_ALPHA_IDLE });
  }

  /**
   * Pixel-art room rendering — Gather.town style.
   *
   * Wall anatomy (top-down RPG perspective):
   *   - Top wall:    WALL_W tall, dark shadow color (back wall, farthest from viewer)
   *   - Left wall:   WALL_W wide, mid color
   *   - Bottom wall: WALL_W tall, lit color (front/south face)
   *   - Right wall:  WALL_W wide, lit color (east face)
   *   - Corners:     Dark 1px pixels where walls meet
   *
   * Interior is offset by WALL_W on all sides and filled with the room decorator.
   * A small "doorway" gap is cut in the south wall to suggest an opening.
   */
  private drawPixelRoom(g: Graphics, config: ZoneConfig): void {
    const W = config.width;
    const H = config.height;
    const WW = WALL_W;

    // ── Outer fill (wall base colour) ───────────────────────
    g.rect(0, 0, W, H).fill(WALL_TOP_COLOR);

    // ── Interior floor fill ──────────────────────────────────
    g.rect(WW, WW, W - WW * 2, H - WW * 2).fill(0xf0e4d0);

    // ── Top wall (darkest — back wall) ───────────────────────
    g.rect(0, 0, W, WW).fill(WALL_TOP_COLOR);
    // Inner lit strip (top of wall where light hits)
    g.rect(WW, WW - 2, W - WW * 2, 2).fill(WALL_TOP_LIT);

    // ── Left wall ────────────────────────────────────────────
    g.rect(0, 0, WW, H).fill(WALL_SIDE_COLOR);
    // Inner strip
    g.rect(WW - 2, WW, 2, H - WW * 2).fill(WALL_TOP_LIT);

    // ── Bottom wall (south face — lit) ───────────────────────
    g.rect(0, H - WW, W, WW).fill(WALL_BOTTOM_COLOR);
    // Doorway gap in bottom wall center (25% width)
    const doorW = Math.floor(W * 0.25);
    const doorX = Math.floor((W - doorW) / 2);
    g.rect(doorX, H - WW, doorW, WW).fill(DOORWAY_COLOR);
    // Door frame lines
    g.rect(doorX, H - WW, 2, WW).fill(WALL_TOP_COLOR);
    g.rect(doorX + doorW - 2, H - WW, 2, WW).fill(WALL_TOP_COLOR);

    // ── Right wall (east face — lit) ─────────────────────────
    g.rect(W - WW, 0, WW, H).fill(WALL_BOTTOM_COLOR);

    // ── Corner darks ─────────────────────────────────────────
    g.rect(0, 0, WW, WW).fill(WALL_CORNER_DARK);              // top-left
    g.rect(W - WW, 0, WW, WW).fill(WALL_CORNER_DARK);         // top-right
    // Bottom corners slightly lighter
    g.rect(0, H - WW, WW, WW).fill(WALL_TOP_COLOR);
    g.rect(W - WW, H - WW, WW, WW).fill(WALL_BOTTOM_COLOR);

    // ── Run the room's interior decorator ────────────────────
    const decorator = this.themeDecorators?.[config.id] ?? ZONE_DECORATORS[config.id];
    if (decorator) {
      const iW = W - WW * 2;
      const iH = H - WW * 2;
      decorator(g, WW, WW, iW, iH);
    }
  }

  /** Update zone glow based on agent count */
  setAgentCount(zoneId: ZoneId, count: number): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.agentCount = count;
  }

  /** Smoothly transition zone glow each frame */
  update(dt: number): void {
    for (const zone of this.zones.values()) {
      const targetGlow = zone.agentCount > 0 ? 1 : 0;
      zone.currentGlow += (targetGlow - zone.currentGlow) * Math.min(1, 3 * dt / 1000);

      const t = zone.currentGlow;

      // Animated color glow border — pixel-art rooms use rect not roundRect
      zone.glowBorder.clear();
      if (t > 0.01) {
        const alpha = GLOW_ALPHA_IDLE + (GLOW_ALPHA_ACTIVE - GLOW_ALPHA_IDLE) * t;
        const bw = BORDER_WIDTH_IDLE + (BORDER_WIDTH_ACTIVE - BORDER_WIDTH_IDLE) * t;
        zone.glowBorder
          .rect(-bw, -bw, zone.config.width + bw * 2, zone.config.height + bw * 2)
          .stroke({ color: zone.config.color, width: bw, alpha });
      }

      // Outer glow halo
      zone.outerGlow.clear();
      if (t > 0.01) {
        const spread = 8 * t;
        const outerAlpha = OUTER_GLOW_ALPHA_ACTIVE * t;
        zone.outerGlow
          .rect(-spread, -spread, zone.config.width + spread * 2, zone.config.height + spread * 2)
          .stroke({ color: zone.config.color, width: spread, alpha: outerAlpha });
      }
    }
  }

  /** Destroy and re-create all zone visuals */
  rebuild(): void {
    const counts = new Map<ZoneId, number>();
    for (const [id, z] of this.zones) {
      counts.set(id, z.agentCount);
    }
    this.container.removeChildren();
    this.zones.clear();
    for (const zone of ZONES) {
      const zoneDisplay = this.createZone(zone);
      this.zones.set(zone.id, zoneDisplay);
      this.container.addChild(zoneDisplay.container);
      zoneDisplay.agentCount = counts.get(zone.id) ?? 0;
    }
  }

  /** Get zone config for positioning */
  getZoneConfig(zoneId: ZoneId): ZoneConfig | undefined {
    return this.zones.get(zoneId)?.config;
  }
}
