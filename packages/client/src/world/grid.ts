import { Graphics } from 'pixi.js';
import { ZONES } from '@agent-move/shared';

// ── Outdoor / Building palette ───────────────────────────────
const OUTDOOR_GROUND   = 0xc8d8a0;  // Soft grass green
const OUTDOOR_SHADOW   = 0xb0c488;  // Darker grass shadow
const PATH_COLOR       = 0xd4c4a0;  // Sandy path/walkway
const BUILDING_FLOOR   = 0xe8ddd0;  // Interior hallway/corridor floor
const WALL_OUTER       = 0xc0b8a8;  // Outer building wall (shadow side)
const WALL_INNER_TOP   = 0xf4f0e8;  // Inner wall top face (bright)
const WALL_INNER_SIDE  = 0xe0d8cc;  // Inner wall side face
const WINDOW_FRAME     = 0x6699aa;  // Window frame
const WINDOW_GLASS     = 0xaad4e8;  // Window glass (tinted)
const WINDOW_REFLECT   = 0xddf0fc;  // Window reflection streak
const ROOF_OVERHANG    = 0xb8aa98;  // Roof shadow on outer wall
const PX = 4;
const P = (n: number) => n * PX;

function rect(g: Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.rect(x, y, w, h).fill(color);
}

/** Draw a pixel-art tree (top-down view) */
function drawTree(g: Graphics, cx: number, cy: number, size: number): void {
  const r = size / 2;
  // Shadow
  rect(g, cx - r + 4, cy - r + 4, size, size, 0x00000018);
  // Outer ring (darkest)
  rect(g, cx - r + P(1), cy - r, size - P(2), P(1), 0x2a6a2a);
  rect(g, cx - r + P(1), cy + r - P(1), size - P(2), P(1), 0x2a6a2a);
  rect(g, cx - r, cy - r + P(1), P(1), size - P(2), 0x2a6a2a);
  rect(g, cx + r - P(1), cy - r + P(1), P(1), size - P(2), 0x2a6a2a);
  // Mid ring
  rect(g, cx - r + P(1), cy - r + P(1), size - P(2), size - P(2), 0x3a8a3a);
  // Inner fill (light)
  rect(g, cx - r + P(2), cy - r + P(2), size - P(4), size - P(4), 0x4aaa4a);
  // Highlight
  rect(g, cx - P(2), cy - r + P(1), P(3), P(2), 0x66cc66);
  rect(g, cx - P(1), cy - r, P(2), P(1), 0x88ee88);
  // Trunk (tiny dot at bottom)
  rect(g, cx - PX / 2, cy + r - P(1), PX, P(1), 0x7a5030);
}

/** Draw a bush / shrub */
function drawBush(g: Graphics, cx: number, cy: number): void {
  rect(g, cx - P(2), cy - P(1), P(4), P(2), 0x2a7a2a);
  rect(g, cx - P(1), cy - P(2), P(2), P(4), 0x2a7a2a);
  rect(g, cx - P(1), cy - P(1), P(2), P(2), 0x4aaa4a);
  rect(g, cx - P(1), cy - P(2), PX, PX, 0x66cc44);
}

/** Draw a pixel-art window on the building wall */
function drawWindow(g: Graphics, x: number, y: number, w: number, h: number): void {
  rect(g, x, y, w, h, WINDOW_FRAME);
  rect(g, x + 1, y + 1, w - 2, h - 2, WINDOW_GLASS);
  // Divider cross
  rect(g, x + w / 2 - 1, y + 1, 2, h - 2, WINDOW_FRAME);
  rect(g, x + 1, y + h / 2 - 1, w - 2, 2, WINDOW_FRAME);
  // Reflection streak
  rect(g, x + 2, y + 2, 2, h - 4, WINDOW_REFLECT);
}

/** Draw a small flower patch */
function drawFlowers(g: Graphics, x: number, y: number): void {
  const colors = [0xff8888, 0xffcc44, 0xff66aa, 0xcc88ff];
  for (let i = 0; i < 4; i++) {
    rect(g, x + (i % 2) * P(3), y + Math.floor(i / 2) * P(3), PX, PX, colors[i]);
    rect(g, x + (i % 2) * P(3), y + Math.floor(i / 2) * P(3), PX, PX, 0x4aaa4a);
    rect(g, x + (i % 2) * P(3), y + Math.floor(i / 2) * P(3), PX, PX, colors[i]);
  }
}

/**
 * Full-world background: outdoor ground with grass, trees, paths,
 * and a building shell that frames all the zone rooms.
 */
export function createGrid(worldW: number, worldH: number): Graphics {
  const g = new Graphics();

  // ── 1. Outdoor ground ──────────────────────────────────────
  rect(g, 0, 0, worldW, worldH, OUTDOOR_GROUND);

  // Subtle grass variation (slightly darker patches)
  const patchSz = P(10);
  for (let gy = 0; gy < worldH; gy += patchSz) {
    for (let gx = 0; gx < worldW; gx += patchSz) {
      if (((gx / patchSz) + (gy / patchSz)) % 3 === 0) {
        rect(g, gx, gy, patchSz, patchSz, OUTDOOR_SHADOW);
      }
    }
  }

  // ── 2. Sandy path around building ─────────────────────────
  // Compute building bounds from ZONES
  if (ZONES.length > 0) {
    const minX = Math.min(...ZONES.map(z => z.x));
    const minY = Math.min(...ZONES.map(z => z.y));
    const maxX = Math.max(...ZONES.map(z => z.x + z.width));
    const maxY = Math.max(...ZONES.map(z => z.y + z.height));

    const pad = 20;  // path width around building
    // Path / driveway border
    rect(g, minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2, PATH_COLOR);

    // ── 3. Building outer walls ──────────────────────────────
    const wallThick = 10;
    // Outer shadow face (south + east — depth)
    rect(g, minX - wallThick + 4, maxY, maxX - minX + wallThick, 8, ROOF_OVERHANG);
    rect(g, maxX, minY - wallThick + 4, 8, maxY - minY + wallThick, ROOF_OVERHANG);
    // Main wall body
    rect(g, minX - wallThick, minY - wallThick,
      maxX - minX + wallThick * 2, maxY - minY + wallThick * 2, WALL_OUTER);
    // Inner wall top face (lit)
    rect(g, minX - wallThick, minY - wallThick,
      maxX - minX + wallThick * 2, wallThick, WALL_INNER_TOP);
    rect(g, minX - wallThick, minY - wallThick,
      wallThick, maxY - minY + wallThick * 2, WALL_INNER_TOP);
    // Inner wall side face
    rect(g, minX, maxY, maxX - minX, wallThick, WALL_INNER_SIDE);
    rect(g, maxX, minY, wallThick, maxY - minY, WALL_INNER_SIDE);

    // ── 4. Building interior floor (hallway/corridor) ────────
    rect(g, minX, minY, maxX - minX, maxY - minY, BUILDING_FLOOR);

    // ── 5. Hallway tile pattern ──────────────────────────────
    const ts = P(5);
    for (let ty = minY; ty < maxY; ty += ts) {
      for (let tx = minX; tx < maxX; tx += ts) {
        if (((tx - minX) / ts + (ty - minY) / ts) % 7 === 0) {
          rect(g, tx, ty, ts, ts, 0xddd0c4);
        }
      }
    }
    // Subtle grid lines for the interior floor
    for (let ty = minY; ty < maxY; ty += ts) {
      rect(g, minX, ty, maxX - minX, 1, 0xd4c8bc);
    }
    for (let tx = minX; tx < maxX; tx += ts) {
      rect(g, tx, minY, 1, maxY - minY, 0xd4c8bc);
    }

    // ── 6. Windows along building exterior ──────────────────
    const winW = P(5), winH = P(4), winGap = P(10);
    // Top wall windows
    for (let wx = minX + P(4); wx < maxX - P(8); wx += winGap) {
      drawWindow(g, wx, minY - wallThick + 2, winW, winH);
    }
    // Left wall windows (vertical, rotated look)
    for (let wy = minY + P(4); wy < maxY - P(8); wy += winGap) {
      drawWindow(g, minX - wallThick + 2, wy, winH, winW);
    }
  }

  // ── 7. Trees around the building ──────────────────────────
  const treePositions: Array<[number, number, number]> = [];

  // Corner trees (large)
  treePositions.push([P(5), P(5), P(9)]);
  treePositions.push([worldW - P(11), P(5), P(9)]);
  treePositions.push([P(5), worldH - P(11), P(9)]);
  treePositions.push([worldW - P(11), worldH - P(11), P(9)]);

  // Top edge trees
  for (let tx = P(15); tx < worldW - P(12); tx += P(18)) {
    treePositions.push([tx, P(4), P(7)]);
  }
  // Bottom edge trees
  for (let tx = P(15); tx < worldW - P(12); tx += P(18)) {
    treePositions.push([tx, worldH - P(8), P(7)]);
  }
  // Left edge trees
  for (let ty = P(18); ty < worldH - P(14); ty += P(20)) {
    treePositions.push([P(4), ty, P(7)]);
  }
  // Right edge trees
  for (let ty = P(18); ty < worldH - P(14); ty += P(20)) {
    treePositions.push([worldW - P(8), ty, P(7)]);
  }

  for (const [tx, ty, ts] of treePositions) {
    drawTree(g, tx + ts / 2, ty + ts / 2, ts);
  }

  // ── 8. Bushes and flowers along building entrance ─────────
  if (ZONES.length > 0) {
    const minX = Math.min(...ZONES.map(z => z.x));
    const maxX = Math.max(...ZONES.map(z => z.x + z.width));
    const minY = Math.min(...ZONES.map(z => z.y));
    const maxY = Math.max(...ZONES.map(z => z.y + z.height));

    // Bushes along the bottom of building
    for (let bx = minX + P(6); bx < maxX - P(8); bx += P(14)) {
      drawBush(g, bx, maxY + 14);
    }
    // Flowers along top-left corner
    drawFlowers(g, minX - P(6), minY + P(2));
    drawFlowers(g, minX - P(8), minY + P(8));
    // Flowers bottom-right
    drawFlowers(g, maxX + P(2), maxY - P(6));
    drawFlowers(g, maxX + P(4), maxY - P(12));
  }

  return g;
}
