import { Application, Graphics, Texture } from 'pixi.js';
import type { SpriteFrame } from './sprite-data.js';
import type { AgentPalette } from './palette.js';
import { resolveColor } from './palette.js';

const PIXEL_SCALE = 3;

/** Cache textures by composite key */
const textureCache = new Map<string, Texture>();

/**
 * Generate a Pixi texture from a pixel art frame + palette.
 * Each logical pixel is drawn at PIXEL_SCALE (3x), so a 16px sprite becomes 48px on screen.
 */
export function createSpriteTexture(
  renderer: any,
  frame: SpriteFrame,
  palette: AgentPalette,
  cacheKey: string,
): Texture {
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const g = new Graphics();
  const rows = frame.length;
  const cols = frame[0].length;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const color = resolveColor(palette, frame[y][x]);
      if (color === null) continue;
      g.rect(x * PIXEL_SCALE, y * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE).fill(color);
    }
  }

  // Pixi v8: generateTexture accepts options object with target
  const texture = renderer.generateTexture({ target: g });
  g.destroy();
  textureCache.set(cacheKey, texture);
  return texture;
}

/** Build a cache key for a sprite texture */
export function spriteKey(name: string, paletteIndex: number): string {
  return `${name}_p${paletteIndex}`;
}

/** Clear all cached textures */
export function clearTextureCache(): void {
  for (const tex of textureCache.values()) {
    tex.destroy(true);
  }
  textureCache.clear();
}
