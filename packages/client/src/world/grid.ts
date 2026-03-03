import { Graphics } from 'pixi.js';
import { WORLD_WIDTH, WORLD_HEIGHT, ZONES } from '@agent-move/shared';
import type { ZoneConfig } from '@agent-move/shared';

const PX = 4;
const P = (n: number) => n * PX;

// Building colors
const WALL_BASE = 0x1e2240;
const WALL_DARK = 0x141830;
const WALL_TRIM = 0x3a3e60;
const WALL_HIGHLIGHT = 0x2e3258;
const DOOR_FLOOR = 0x7a5030;
const DOOR_FRAME = 0x4a2e14;
const DOOR_MAT = 0x6b4226;

/**
 * Unified office building: outer shell + internal partition walls with doorways.
 * The zone renderer draws room interiors on top of this.
 */
export function createGrid(): Graphics {
  const g = new Graphics();

  // Solid wall fill for the entire building
  g.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill(WALL_BASE);

  // Subtle brick texture on walls
  for (let y = 0; y < WORLD_HEIGHT; y += P(3)) {
    const offset = (Math.floor(y / P(3)) % 2) * P(4);
    for (let x = offset; x < WORLD_WIDTH; x += P(8)) {
      g.rect(x, y, P(8), P(3)).fill({ color: WALL_HIGHLIGHT, alpha: 0.2 });
      g.rect(x, y, P(8), 1).fill({ color: WALL_TRIM, alpha: 0.1 });
    }
  }

  // Outer building border
  const bw = 4;
  g.rect(0, 0, WORLD_WIDTH, bw).fill(WALL_DARK);
  g.rect(0, WORLD_HEIGHT - bw, WORLD_WIDTH, bw).fill(WALL_DARK);
  g.rect(0, 0, bw, WORLD_HEIGHT).fill(WALL_DARK);
  g.rect(WORLD_WIDTH - bw, 0, bw, WORLD_HEIGHT).fill(WALL_DARK);
  // Inner trim
  g.rect(bw, bw, WORLD_WIDTH - bw * 2, 1).fill(WALL_TRIM);
  g.rect(bw, WORLD_HEIGHT - bw - 1, WORLD_WIDTH - bw * 2, 1).fill(WALL_TRIM);
  g.rect(bw, bw, 1, WORLD_HEIGHT - bw * 2).fill(WALL_TRIM);
  g.rect(WORLD_WIDTH - bw - 1, bw, 1, WORLD_HEIGHT - bw * 2).fill(WALL_TRIM);

  // Draw doorways between adjacent rooms
  drawDoorways(g);

  return g;
}

/** Check if two zones share a horizontal edge (one above the other) */
function shareHorizontalWall(a: ZoneConfig, b: ZoneConfig): { wallY: number; overlapX1: number; overlapX2: number } | null {
  const aBottom = a.y + a.height;
  const bBottom = b.y + b.height;
  // a is above b
  const gap1 = b.y - aBottom;
  // b is above a
  const gap2 = a.y - bBottom;

  let wallY: number;
  let gapH: number;
  if (gap1 > 0 && gap1 <= 16) { wallY = aBottom; gapH = gap1; }
  else if (gap2 > 0 && gap2 <= 16) { wallY = bBottom; gapH = gap2; }
  else return null;

  // Check horizontal overlap
  const overlapX1 = Math.max(a.x, b.x);
  const overlapX2 = Math.min(a.x + a.width, b.x + b.width);
  if (overlapX2 - overlapX1 < 30) return null; // need enough overlap for a door

  return { wallY, overlapX1, overlapX2 };
}

/** Check if two zones share a vertical edge (side by side) */
function shareVerticalWall(a: ZoneConfig, b: ZoneConfig): { wallX: number; overlapY1: number; overlapY2: number } | null {
  const aRight = a.x + a.width;
  const bRight = b.x + b.width;

  let wallX: number;
  if (b.x - aRight > 0 && b.x - aRight <= 16) { wallX = aRight; }
  else if (a.x - bRight > 0 && a.x - bRight <= 16) { wallX = bRight; }
  else return null;

  // Check vertical overlap
  const overlapY1 = Math.max(a.y, b.y);
  const overlapY2 = Math.min(a.y + a.height, b.y + b.height);
  if (overlapY2 - overlapY1 < 30) return null;

  return { wallX, overlapY1, overlapY2 };
}

function drawDoorways(g: Graphics): void {
  const doorWidth = P(10); // door opening size

  for (let i = 0; i < ZONES.length; i++) {
    for (let j = i + 1; j < ZONES.length; j++) {
      const a = ZONES[i];
      const b = ZONES[j];

      // Horizontal wall (one above the other)
      const hWall = shareHorizontalWall(a, b);
      if (hWall) {
        const { wallY, overlapX1, overlapX2 } = hWall;
        const gapH = Math.abs((a.y + a.height === wallY ? b.y : a.y) - wallY);
        const midX = (overlapX1 + overlapX2) / 2;
        const dw = Math.min(doorWidth, overlapX2 - overlapX1 - 16);
        const doorX = midX - dw / 2;

        // Floor in doorway
        g.rect(doorX, wallY, dw, gapH).fill(DOOR_FLOOR);
        // Door frame posts
        g.rect(doorX - 2, wallY, 2, gapH).fill(DOOR_FRAME);
        g.rect(doorX + dw, wallY, 2, gapH).fill(DOOR_FRAME);
        // Welcome mat
        g.rect(doorX + 4, wallY + 1, dw - 8, gapH - 2).fill({ color: DOOR_MAT, alpha: 0.5 });
        // Trim on frame
        g.rect(doorX, wallY, dw, 1).fill(WALL_TRIM);
        g.rect(doorX, wallY + gapH - 1, dw, 1).fill(WALL_TRIM);
      }

      // Vertical wall (side by side)
      const vWall = shareVerticalWall(a, b);
      if (vWall) {
        const { wallX, overlapY1, overlapY2 } = vWall;
        const rightZone = a.x < b.x ? b : a;
        const gapW = rightZone.x - wallX;
        const midY = (overlapY1 + overlapY2) / 2;
        const dh = Math.min(doorWidth, overlapY2 - overlapY1 - 16);
        const doorY = midY - dh / 2;

        // Floor in doorway
        g.rect(wallX, doorY, gapW, dh).fill(DOOR_FLOOR);
        // Door frame posts
        g.rect(wallX, doorY - 2, gapW, 2).fill(DOOR_FRAME);
        g.rect(wallX, doorY + dh, gapW, 2).fill(DOOR_FRAME);
        // Welcome mat
        g.rect(wallX + 1, doorY + 4, gapW - 2, dh - 8).fill({ color: DOOR_MAT, alpha: 0.5 });
        // Trim on frame
        g.rect(wallX, doorY, 1, dh).fill(WALL_TRIM);
        g.rect(wallX + gapW - 1, doorY, 1, dh).fill(WALL_TRIM);
      }
    }
  }
}
