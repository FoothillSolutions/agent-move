import { Graphics } from 'pixi.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '@agentflow/shared';

const WALL_COLOR = 0x1a1e38;
const WALL_EDGE = 0x141830;

/** Create a dark wall background covering the full world area */
export function createGrid(): Graphics {
  const g = new Graphics();

  // Solid dark wall background
  g.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill(WALL_COLOR);

  // Subtle vertical paneling on walls
  for (let x = 0; x <= WORLD_WIDTH; x += 28) {
    g.rect(x, 0, 1, WORLD_HEIGHT).fill({ color: WALL_EDGE, alpha: 0.4 });
  }

  return g;
}
