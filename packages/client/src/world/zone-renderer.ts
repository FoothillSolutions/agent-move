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

// ── Per-room wall & floor style (Gather.town-inspired) ──────────────────

interface RoomStyle {
  wallMain: number;      // Primary wall color
  wallDark: number;      // Dark shade (top wall / corners)
  wallLight: number;     // Light shade (south / right face)
  wallBaseboard: number; // Thin baseboard line where wall meets floor
  floorType: 'wood' | 'tile' | 'carpet' | 'dark';
  floorA: number;        // Floor primary
  floorB: number;        // Floor secondary (alternate tile / plank)
  floorGrid: number;     // Floor grid/seam line color
}

const ROOM_STYLES: Partial<Record<ZoneId, RoomStyle>> = {
  // Library: warm cream walls, wood plank floor
  search: {
    wallMain: 0xf0e4d4, wallDark: 0xdcd0c0, wallLight: 0xf8f0e4, wallBaseboard: 0xc8bca8,
    floorType: 'wood', floorA: 0xd4c0a0, floorB: 0xccb898, floorGrid: 0xb8a880,
  },
  // Server room: dark navy walls, dark tile floor
  terminal: {
    wallMain: 0x484860, wallDark: 0x383848, wallLight: 0x585870, wallBaseboard: 0x303040,
    floorType: 'dark', floorA: 0x2a2a3c, floorB: 0x32324a, floorGrid: 0x222234,
  },
  // Tech lab: purple/lavender walls, blue-purple carpet
  web: {
    wallMain: 0x8878a8, wallDark: 0x706098, wallLight: 0x9888b8, wallBaseboard: 0x605080,
    floorType: 'carpet', floorA: 0x8484c0, floorB: 0x7878b4, floorGrid: 0x6868a4,
  },
  // Archive: warm beige walls, wood floor
  files: {
    wallMain: 0xe0d4c4, wallDark: 0xc8bcac, wallLight: 0xecdcc8, wallBaseboard: 0xb8a898,
    floorType: 'wood', floorA: 0xd0bc98, floorB: 0xc4b088, floorGrid: 0xb0a078,
  },
  // Meeting room: purple walls, purple carpet (like Gather.town conference)
  thinking: {
    wallMain: 0x8878a8, wallDark: 0x706098, wallLight: 0x9888b8, wallBaseboard: 0x605080,
    floorType: 'carpet', floorA: 0x9494c8, floorB: 0x8888bc, floorGrid: 0x7878ac,
  },
  // Lounge: cream/white walls, white diamond tile floor
  messaging: {
    wallMain: 0xf0e8dc, wallDark: 0xd8d0c4, wallLight: 0xf8f0e8, wallBaseboard: 0xc8c0b0,
    floorType: 'tile', floorA: 0xf0ece4, floorB: 0xe4e0d8, floorGrid: 0xd0ccc4,
  },
  // Lobby: dark walls, dark ornate floor
  spawn: {
    wallMain: 0x484860, wallDark: 0x383848, wallLight: 0x585870, wallBaseboard: 0x303040,
    floorType: 'dark', floorA: 0x30304a, floorB: 0x3a3a54, floorGrid: 0x28283c,
  },
  // Break room: warm beige walls, cream checkered tile
  idle: {
    wallMain: 0xe8dcc8, wallDark: 0xd0c4b0, wallLight: 0xf0e4d4, wallBaseboard: 0xc0b4a0,
    floorType: 'tile', floorA: 0xf0e8d8, floorB: 0xe4dcc8, floorGrid: 0xd4c8b4,
  },
  // Project room: light grey walls, grey carpet
  tasks: {
    wallMain: 0xc0bcc0, wallDark: 0xa8a4a8, wallLight: 0xd0ccd0, wallBaseboard: 0x989498,
    floorType: 'carpet', floorA: 0xc0bcc0, floorB: 0xb4b0b4, floorGrid: 0xa4a0a4,
  },
};

// ── Wall dimensions (pixels) ────────────────────────────────────────────
const WT = 14;   // Top wall (back — tallest, shadow side)
const WL = 10;   // Left wall
const WB = 6;    // Bottom wall (front — thinnest, lit)
const WR = 6;    // Right wall

// ── Glass fallback constants ────────────────────────────────────────────
const GLASS_BG = 0x1a1a2e;
const GLASS_ALPHA = 0.55;

// ── Floor pattern renderers ─────────────────────────────────────────────

function px(g: Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.rect(x, y, w, h).fill(color);
}

function drawFloorWood(g: Graphics, x: number, y: number, w: number, h: number, a: number, b: number, grid: number): void {
  px(g, x, y, w, h, a);
  const plankH = 20;
  let row = 0;
  for (let fy = 0; fy < h; fy += plankH) {
    const ph = Math.min(plankH, h - fy);
    if (row % 2 === 1) px(g, x, y + fy, w, ph, b);
    px(g, x, y + fy, w, 1, grid);
    const offset = (row % 2) * 32;
    for (let fx = offset; fx < w; fx += 64) {
      px(g, x + fx, y + fy + 1, 1, ph - 2, grid);
    }
    row++;
  }
}

function drawFloorTile(g: Graphics, x: number, y: number, w: number, h: number, a: number, b: number, grid: number): void {
  px(g, x, y, w, h, a);
  const ts = 24;
  for (let ty = 0; ty < h; ty += ts) {
    for (let tx = 0; tx < w; tx += ts) {
      const odd = (((tx / ts) + (ty / ts)) % 2) === 0;
      if (odd) px(g, x + tx, y + ty, Math.min(ts, w - tx), Math.min(ts, h - ty), b);
      px(g, x + tx, y + ty, Math.min(ts, w - tx), 1, grid);
      px(g, x + tx, y + ty, 1, Math.min(ts, h - ty), grid);
    }
  }
}

function drawFloorCarpet(g: Graphics, x: number, y: number, w: number, h: number, a: number, b: number, grid: number): void {
  px(g, x, y, w, h, a);
  // Subtle cross-stitch dot pattern
  for (let fy = 0; fy < h; fy += 12) {
    for (let fx = ((fy / 12) % 2) * 12; fx < w; fx += 24) {
      px(g, x + fx, y + fy, 4, 4, b);
    }
  }
  // Border
  px(g, x, y, w, 4, grid);
  px(g, x, y + h - 4, w, 4, grid);
  px(g, x, y, 4, h, grid);
  px(g, x + w - 4, y, 4, h, grid);
}

function drawFloorDark(g: Graphics, x: number, y: number, w: number, h: number, a: number, b: number, grid: number): void {
  px(g, x, y, w, h, a);
  const ts = 16;
  for (let ty = 0; ty < h; ty += ts) {
    for (let tx = 0; tx < w; tx += ts) {
      if (((tx / ts) + (ty / ts)) % 2 === 0) {
        px(g, x + tx, y + ty, Math.min(ts, w - tx), Math.min(ts, h - ty), b);
      }
      px(g, x + tx, y + ty, Math.min(ts, w - tx), 1, grid);
      px(g, x + tx, y + ty, 1, Math.min(ts, h - ty), grid);
    }
  }
}

const FLOOR_FNS = {
  wood: drawFloorWood,
  tile: drawFloorTile,
  carpet: drawFloorCarpet,
  dark: drawFloorDark,
} as const;

/**
 * Renders zone panels as Gather.town-style pixel-art office rooms.
 * Each room has per-zone colored walls and floor pattern.
 */
export class ZoneRenderer {
  private zones = new Map<ZoneId, ZoneDisplay>();
  public readonly container = new Container();
  private themeDecorators: Record<string, ZoneDecoratorFn> | null = null;
  private usePixelRooms = false;

  setThemeDecorators(decorators: Record<string, ZoneDecoratorFn>, pixelRooms = false): void {
    this.themeDecorators = decorators;
    this.usePixelRooms = pixelRooms;
    this.rebuild();
  }

  constructor() {
    for (const zone of ZONES) {
      const zd = this.createZone(zone);
      this.zones.set(zone.id, zd);
      this.container.addChild(zd.container);
    }
  }

  private createZone(config: ZoneConfig): ZoneDisplay {
    const container = new Container();
    container.position.set(config.x, config.y);

    const outerGlow = new Graphics();
    container.addChild(outerGlow);

    const staticBg = new Graphics();
    this.drawRoom(staticBg, config);
    container.addChild(staticBg);

    const glowBorder = new Graphics();
    container.addChild(glowBorder);

    // Room label
    if (this.usePixelRooms) {
      this.addRetroLabel(container, config);
    } else {
      this.addGlassLabel(container, config);
    }

    return { container, staticBg, glowBorder, outerGlow, config, agentCount: 0, currentGlow: 0 };
  }

  private addRetroLabel(container: Container, config: ZoneConfig): void {
    const style = ROOM_STYLES[config.id];
    const isDark = style && (style.floorType === 'dark' || style.floorType === 'carpet');
    const labelStyle = new TextStyle({
      fontSize: 11,
      fontFamily: "'Inter', 'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
      fill: 0xffffff,
      fontWeight: '700',
      letterSpacing: 0.5,
    });
    const label = new Text({ text: `${config.icon} ${config.label}`, style: labelStyle });
    label.position.set(WL + 8, 1);

    const pillW = label.width + 16;
    const pillH = label.height + 6;
    const labelBg = new Graphics();
    labelBg.roundRect(WL + 2, -1, pillW, pillH, 4)
      .fill({ color: 0x000000, alpha: isDark ? 0.5 : 0.55 });
    container.addChild(labelBg);
    container.addChild(label);
  }

  private addGlassLabel(container: Container, config: ZoneConfig): void {
    const labelStyle = new TextStyle({
      fontSize: 13,
      fontFamily: "'Inter', 'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
      fill: 0xffffff,
      fontWeight: '600',
      letterSpacing: 0.5,
      dropShadow: { alpha: 0.6, blur: 4, color: 0x000000, distance: 0 },
    });
    const label = new Text({ text: `${config.icon} ${config.label}`, style: labelStyle });
    label.position.set(14, 10);

    const pillW = label.width + 20;
    const pillH = label.height + 8;
    const labelBg = new Graphics();
    labelBg.roundRect(6, 5, pillW, pillH, 8)
      .fill({ color: 0x000000, alpha: 0.3 });
    container.addChild(labelBg);
    container.addChild(label);
  }

  private drawRoom(g: Graphics, config: ZoneConfig): void {
    if (this.usePixelRooms) {
      this.drawPixelRoom(g, config);
      return;
    }

    // Glass panel (default for non-office themes)
    g.roundRect(0, 0, config.width, config.height, 8)
      .fill({ color: GLASS_BG, alpha: GLASS_ALPHA });
    g.roundRect(0, 0, config.width, config.height, 8)
      .stroke({ color: config.color, width: 1, alpha: 0.15 });

    // Still draw furniture inside the glass panel
    const pad = 14;
    const decorator = this.themeDecorators?.[config.id] ?? ZONE_DECORATORS[config.id];
    if (decorator) {
      decorator(g, pad, pad + 16, config.width - pad * 2, config.height - pad * 2 - 16);
    }
  }

  /**
   * Pixel-art room rendering — Gather.town style.
   *
   * 1. Fill with wall color
   * 2. Draw floor pattern inside wall area
   * 3. Draw thick colored walls with perspective shading
   * 4. Call furniture decorator for the interior
   */
  private drawPixelRoom(g: Graphics, config: ZoneConfig): void {
    const W = config.width;
    const H = config.height;
    const style = ROOM_STYLES[config.id];
    if (!style) return;

    // ── 1. Full background fill (wall color) ─────────────────
    px(g, 0, 0, W, H, style.wallMain);

    // ── 2. Interior floor ────────────────────────────────────
    const fx = WL;
    const fy = WT;
    const fw = W - WL - WR;
    const fh = H - WT - WB;
    const floorFn = FLOOR_FNS[style.floorType];
    floorFn(g, fx, fy, fw, fh, style.floorA, style.floorB, style.floorGrid);

    // ── 3. Walls with perspective shading ────────────────────

    // Top wall (back — darkest, shadow side)
    px(g, 0, 0, W, WT, style.wallDark);
    // Top wall inner highlight strip (where light catches the bottom edge of back wall)
    px(g, WL, WT - 2, W - WL - WR, 2, style.wallLight);

    // Left wall (mid shade)
    px(g, 0, 0, WL, H, style.wallMain);
    // Left wall inner highlight
    px(g, WL - 2, WT, 2, H - WT - WB, style.wallLight);

    // Bottom wall (front face — lightest, receives most light)
    px(g, 0, H - WB, W, WB, style.wallLight);
    // Bottom wall dark top edge
    px(g, WL, H - WB, W - WL - WR, 1, style.wallBaseboard);

    // Right wall (light, same as south face)
    px(g, W - WR, 0, WR, H, style.wallLight);
    // Right wall dark left edge
    px(g, W - WR, WT, 1, H - WT - WB, style.wallBaseboard);

    // Corners
    px(g, 0, 0, WL, WT, style.wallDark);           // top-left (darkest)
    px(g, W - WR, 0, WR, WT, style.wallMain);       // top-right
    px(g, 0, H - WB, WL, WB, style.wallMain);       // bottom-left
    px(g, W - WR, H - WB, WR, WB, style.wallLight); // bottom-right (lightest)

    // ── 4. Doorway in south wall (center gap) ────────────────
    const doorW = Math.min(Math.floor(W * 0.2), 60);
    const doorX = Math.floor((W - doorW) / 2);
    px(g, doorX, H - WB, doorW, WB, style.floorA);
    px(g, doorX, H - WB, 2, WB, style.wallBaseboard);
    px(g, doorX + doorW - 2, H - WB, 2, WB, style.wallBaseboard);

    // ── 5. Furniture decorator ───────────────────────────────
    const decorator = this.themeDecorators?.[config.id] ?? ZONE_DECORATORS[config.id];
    if (decorator) {
      decorator(g, fx, fy, fw, fh);
    }
  }

  setAgentCount(zoneId: ZoneId, count: number): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.agentCount = count;
  }

  update(dt: number): void {
    for (const zone of this.zones.values()) {
      const target = zone.agentCount > 0 ? 1 : 0;
      zone.currentGlow += (target - zone.currentGlow) * Math.min(1, 3 * dt / 1000);
      const t = zone.currentGlow;

      zone.glowBorder.clear();
      if (t > 0.01) {
        const bw = 1 + 2 * t;
        zone.glowBorder
          .rect(-bw, -bw, zone.config.width + bw * 2, zone.config.height + bw * 2)
          .stroke({ color: zone.config.color, width: bw, alpha: 0.7 * t });
      }

      zone.outerGlow.clear();
      if (t > 0.01) {
        const spread = 8 * t;
        zone.outerGlow
          .rect(-spread, -spread, zone.config.width + spread * 2, zone.config.height + spread * 2)
          .stroke({ color: zone.config.color, width: spread, alpha: 0.15 * t });
      }
    }
  }

  rebuild(): void {
    const counts = new Map<ZoneId, number>();
    for (const [id, z] of this.zones) counts.set(id, z.agentCount);
    this.container.removeChildren();
    this.zones.clear();
    for (const zone of ZONES) {
      const zd = this.createZone(zone);
      this.zones.set(zone.id, zd);
      this.container.addChild(zd.container);
      zd.agentCount = counts.get(zone.id) ?? 0;
    }
  }

  getZoneConfig(zoneId: ZoneId): ZoneConfig | undefined {
    return this.zones.get(zoneId)?.config;
  }
}
