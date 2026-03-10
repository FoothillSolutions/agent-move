import { Graphics } from 'pixi.js';

const BG_COLOR = 0x0a0c14;

/**
 * Default grid background.
 * If a theme provides a gridRenderer, that is used instead of the dark fill.
 */
export function createGrid(
  worldW: number, worldH: number,
  themeRenderer?: (g: Graphics, w: number, h: number) => void,
): Graphics {
  const g = new Graphics();

  if (themeRenderer) {
    themeRenderer(g, worldW, worldH);
    return g;
  }

  // Default: minimal dark background
  g.rect(0, 0, worldW, worldH).fill(BG_COLOR);
  return g;
}
