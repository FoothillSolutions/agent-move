import { Graphics } from 'pixi.js';
import { WORLD_WIDTH, WORLD_HEIGHT, COLORS } from '@agentflow/shared';

const GRID_SPACING = 32;

/** Create a subtle background grid covering the full world area */
export function createGrid(): Graphics {
  const g = new Graphics();

  // Vertical lines
  for (let x = 0; x <= WORLD_WIDTH; x += GRID_SPACING) {
    g.moveTo(x, 0).lineTo(x, WORLD_HEIGHT).stroke({ color: COLORS.gridLine, width: 1, alpha: 0.5 });
  }

  // Horizontal lines
  for (let y = 0; y <= WORLD_HEIGHT; y += GRID_SPACING) {
    g.moveTo(0, y).lineTo(WORLD_WIDTH, y).stroke({ color: COLORS.gridLine, width: 1, alpha: 0.5 });
  }

  return g;
}
