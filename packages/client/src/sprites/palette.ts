import { AGENT_PALETTES } from '@agent-move/shared';
import type { AgentPalette } from '@agent-move/shared';
import type { PaletteKey } from './sprite-data.js';

export { AGENT_PALETTES };
export type { AgentPalette };

/** Resolve a palette key to a hex color number for a given palette */
export function resolveColor(palette: AgentPalette, key: PaletteKey): number | null {
  switch (key) {
    case 'body':        return palette.body;
    case 'outline':     return palette.outline;
    case 'highlight':   return palette.highlight;
    case 'eye':         return palette.eye;
    case 'skin':        return palette.skin;
    case 'transparent': return null;
  }
}

/** Get palette by index, wrapping around if out of bounds */
export function getPalette(colorIndex: number): AgentPalette {
  return AGENT_PALETTES[colorIndex % AGENT_PALETTES.length];
}
