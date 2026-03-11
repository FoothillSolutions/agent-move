import { Graphics } from 'pixi.js';
import { ZONES } from '@agent-move/shared';
import { ZONE_DECORATORS } from '../furniture.js';
import type { Theme, ZoneDecoratorFn } from './theme-types.js';
import type { ZoneId } from '@agent-move/shared';

const fallback: ZoneDecoratorFn = (g, x, y, w, h) => {
  g.roundRect(x, y, w, h, 4).fill({ color: 0x333344, alpha: 0.15 });
};

// ── Outdoor palette ─────────────────────────────────────────────────────
const OUTDOOR   = 0xe4d0b8;
const OUTDOOR_B = 0xdcc8b0;
const PATH      = 0xd8c8b0;
const PATH_EDGE = 0xc8b8a0;
const GRASS     = 0xb8d898;
const GRASS_B   = 0xa8c888;
const PX = 4;
const P = (n: number) => n * PX;

function rect(g: Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.rect(x, y, w, h).fill(color);
}

/** Large square-canopy tree (original style) */
function drawTreeLarge(g: Graphics, cx: number, cy: number): void {
  const size = P(7);  // 28px
  const r = size / 2;
  // Trunk
  rect(g, cx - 2, cy + r - P(2), PX + 1, P(2), 0x8a5a30);
  rect(g, cx - 2, cy + r - P(2), 2, P(2), 0x7a4a20);
  // Outer canopy (darkest)
  rect(g, cx - r + P(2), cy - r, size - P(4), P(1), 0x2a6a2a);
  rect(g, cx - r + P(2), cy + r - P(1), size - P(4), P(1), 0x2a6a2a);
  rect(g, cx - r, cy - r + P(2), P(1), size - P(4), 0x2a6a2a);
  rect(g, cx + r - P(1), cy - r + P(2), P(1), size - P(4), 0x2a6a2a);
  // Mid canopy
  rect(g, cx - r + P(1), cy - r + P(1), size - P(2), size - P(2), 0x3a8a3a);
  // Inner canopy (bright)
  rect(g, cx - r + P(2), cy - r + P(2), size - P(4), size - P(4), 0x4aaa4a);
  // Highlight
  rect(g, cx - P(2), cy - r + P(1), P(3), P(2), 0x66cc66);
  rect(g, cx - P(1), cy - r, P(2), P(1), 0x88ee88);
}

/** Small round-ish tree */
function drawTreeSmall(g: Graphics, cx: number, cy: number): void {
  // Trunk
  rect(g, cx - 1, cy + P(1), 3, P(2), 0x8a5a30);
  // Canopy — rounder shape (diamond-ish cross)
  rect(g, cx - P(2), cy - P(1), P(4), P(2), 0x2a7a2a);
  rect(g, cx - P(1), cy - P(2), P(2), P(4), 0x2a7a2a);
  // Fill corners to make it rounder
  rect(g, cx - P(2) + PX, cy - P(2) + PX, P(2), P(2), 0x3a8a3a);
  // Bright center
  rect(g, cx - P(1), cy - P(1), P(2), P(2), 0x4aaa4a);
  // Highlight
  rect(g, cx - PX, cy - P(2), PX, PX, 0x66cc66);
}

/** Tall narrow pine/cypress tree */
function drawTreeTall(g: Graphics, cx: number, cy: number): void {
  // Trunk
  rect(g, cx - 1, cy + P(2), 3, P(2), 0x6a4a20);
  // Canopy layers (narrow triangle shape, top-down looks like pointed oval)
  rect(g, cx - P(1), cy - P(3), P(2), P(5), 0x1a6a1a);
  rect(g, cx - P(2), cy - P(2), P(4), P(3), 0x2a7a2a);
  // Bright center
  rect(g, cx - P(1), cy - P(2), P(2), P(3), 0x3a8a3a);
  rect(g, cx - PX, cy - P(2), PX, P(2), 0x4a9a4a);
  // Highlight tip
  rect(g, cx - 1, cy - P(3), 3, PX, 0x5aaa5a);
}

type TreeDrawFn = (g: Graphics, cx: number, cy: number) => void;
const TREE_VARIANTS: TreeDrawFn[] = [drawTreeLarge, drawTreeSmall, drawTreeTall];

/** Pick a tree variant based on position (deterministic) */
function drawTreeVariant(g: Graphics, cx: number, cy: number, index: number): void {
  TREE_VARIANTS[index % TREE_VARIANTS.length](g, cx, cy);
}

/** Bush */
function drawBush(g: Graphics, cx: number, cy: number): void {
  rect(g, cx - P(2), cy - P(1), P(4), P(2), 0x3a8a3a);
  rect(g, cx - P(1), cy - P(2), P(2), P(4), 0x3a8a3a);
  rect(g, cx - P(1), cy - P(1), P(2), P(2), 0x5aaa5a);
  rect(g, cx, cy - P(2), PX, PX, 0x66cc44);
}

/**
 * Office theme grid renderer — warm peach outdoor ground, grass border,
 * trees around the edges, sandy path around the building.
 */
function renderOfficeGrid(g: Graphics, worldW: number, worldH: number): void {
  // ── 1. Outdoor fill (warm peach) ──────────────────────────
  rect(g, 0, 0, worldW, worldH, OUTDOOR);
  const pSz = P(12);
  for (let gy = 0; gy < worldH; gy += pSz) {
    for (let gx = 0; gx < worldW; gx += pSz) {
      if (((gx / pSz) + (gy / pSz)) % 5 === 0) {
        rect(g, gx, gy, pSz, pSz, OUTDOOR_B);
      }
    }
  }

  // ── 2. Grass border at outer edges ────────────────────────
  const grassW = P(8);
  rect(g, 0, 0, worldW, grassW, GRASS);
  rect(g, 0, worldH - grassW, worldW, grassW, GRASS);
  rect(g, 0, 0, grassW, worldH, GRASS);
  rect(g, worldW - grassW, 0, grassW, worldH, GRASS);
  // Subtle grass variation — small 8px dots scattered sparsely
  const dotSize = P(2);  // 8px dots
  for (let gy = 0; gy < worldH; gy += P(4)) {
    for (let gx = 0; gx < worldW; gx += P(4)) {
      const inGrass = gx < grassW || gx > worldW - grassW - dotSize ||
                      gy < grassW || gy > worldH - grassW - dotSize;
      if (inGrass && ((gx * 7 + gy * 13) % 97) < 20) {
        rect(g, gx, gy, dotSize, dotSize, GRASS_B);
      }
    }
  }

  // ── 3. Building bounds (computed once, reused for path + bushes) ──
  let bMinX = 0, bMinY = 0, bMaxX = 0, bMaxY = 0;
  if (ZONES.length > 0) {
    bMinX = Math.min(...ZONES.map(z => z.x));
    bMinY = Math.min(...ZONES.map(z => z.y));
    bMaxX = Math.max(...ZONES.map(z => z.x + z.width));
    bMaxY = Math.max(...ZONES.map(z => z.y + z.height));

    const pw = 12;
    rect(g, bMinX - pw, bMinY - pw, bMaxX - bMinX + pw * 2, bMaxY - bMinY + pw * 2, PATH);
    // Edge lines
    rect(g, bMinX - pw, bMinY - pw, bMaxX - bMinX + pw * 2, 2, PATH_EDGE);
    rect(g, bMinX - pw, bMaxY + pw - 2, bMaxX - bMinX + pw * 2, 2, PATH_EDGE);
    rect(g, bMinX - pw, bMinY - pw, 2, bMaxY - bMinY + pw * 2, PATH_EDGE);
    rect(g, bMaxX + pw - 2, bMinY - pw, 2, bMaxY - bMinY + pw * 2, PATH_EDGE);

    // Interior hallway fill between rooms
    rect(g, bMinX, bMinY, bMaxX - bMinX, bMaxY - bMinY, 0xe8dcc8);
  }

  // ── 4. Trees — fewer, varied sizes along grass border ─────
  const margin = P(4);           // Keep trees inside grass strip
  const treeGap = P(24);         // Wider spacing = fewer trees
  let idx = 0;
  // Top edge
  for (let tx = margin; tx < worldW - margin; tx += treeGap) {
    drawTreeVariant(g, tx, margin, idx++);
  }
  // Bottom edge
  for (let tx = margin + P(12); tx < worldW - margin; tx += treeGap) {
    drawTreeVariant(g, tx, worldH - margin, idx++);
  }
  // Left edge
  for (let ty = margin + treeGap; ty < worldH - margin; ty += treeGap) {
    drawTreeVariant(g, margin, ty, idx++);
  }
  // Right edge
  for (let ty = margin + P(12); ty < worldH - margin; ty += treeGap) {
    drawTreeVariant(g, worldW - margin, ty, idx++);
  }

  // ── 5. Bushes along building south side ───────────────────
  if (ZONES.length > 0) {
    for (let bx = bMinX + P(10); bx < bMaxX - P(8); bx += P(18)) {
      drawBush(g, bx, bMaxY + 16);
    }
  }
}

export const officeTheme: Theme = {
  id: 'office',
  name: 'Office',
  icon: '🏢',
  colors: {
    background: 0xe4d0b8,
    gridLine: 0xd8c4ac,
    gridLineSub: 0xccb8a0,
  },
  decorators: {
    search: ZONE_DECORATORS.search ?? fallback,
    terminal: ZONE_DECORATORS.terminal ?? fallback,
    web: ZONE_DECORATORS.web ?? fallback,
    files: ZONE_DECORATORS.files ?? fallback,
    thinking: ZONE_DECORATORS.thinking ?? fallback,
    messaging: ZONE_DECORATORS.messaging ?? fallback,
    spawn: ZONE_DECORATORS.spawn ?? fallback,
    idle: ZONE_DECORATORS.idle ?? fallback,
    tasks: ZONE_DECORATORS.tasks ?? fallback,
  } as Record<ZoneId, ZoneDecoratorFn>,
  gridRenderer: renderOfficeGrid,
  pixelRooms: true,
};
