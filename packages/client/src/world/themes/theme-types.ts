import type { Graphics } from 'pixi.js';
import type { ZoneId } from '@agent-move/shared';

export type ZoneDecoratorFn = (g: Graphics, x: number, y: number, w: number, h: number) => void;

export interface ThemeColors {
  background: number;
  gridLine: number;
  gridLineSub: number;
}

export type GridRendererFn = (g: Graphics, worldW: number, worldH: number) => void;

export interface Theme {
  id: string;
  name: string;
  icon: string;
  colors: ThemeColors;
  decorators: Record<ZoneId, ZoneDecoratorFn>;
  /** Optional custom grid/background renderer. If absent, default dark bg is used. */
  gridRenderer?: GridRendererFn;
  /** If true, rooms are drawn with pixel-art walls and floors (office theme). */
  pixelRooms?: boolean;
}
