/**
 * Pixel art arrays for agent characters.
 * Each pixel is a palette key: 'body', 'outline', 'highlight', 'eye', 'transparent'.
 * Main agents are 16x16, subagents are 12x12.
 */

export type PaletteKey = 'body' | 'outline' | 'highlight' | 'eye' | 'transparent';

export type SpriteFrame = PaletteKey[][];

const _ = 'transparent' as const;
const B = 'body' as const;
const O = 'outline' as const;
const H = 'highlight' as const;
const E = 'eye' as const;

// ── Main agent (16x16) ──────────────────────────────────

export const MAIN_IDLE_1: SpriteFrame = [
  [_, _, _, _, _, O, O, O, O, O, O, _, _, _, _, _],
  [_, _, _, _, O, H, H, H, H, H, H, O, _, _, _, _],
  [_, _, _, O, H, H, H, H, H, H, H, H, O, _, _, _],
  [_, _, O, H, H, H, H, H, H, H, H, H, H, O, _, _],
  [_, _, O, B, B, E, E, B, B, E, E, B, B, O, _, _],
  [_, _, O, B, B, E, E, B, B, E, E, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, O, O, O, O, B, B, B, O, _, _],
  [_, _, _, O, B, B, B, B, B, B, B, B, O, _, _, _],
  [_, _, _, _, O, O, O, O, O, O, O, O, _, _, _, _],
  [_, _, _, O, O, B, B, B, B, B, B, O, O, _, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, _, O, O, O, _, _, _, _, O, O, O, _, _, _],
  [_, _, O, O, O, O, _, _, _, _, O, O, O, O, _, _],
];

export const MAIN_IDLE_2: SpriteFrame = [
  [_, _, _, _, _, O, O, O, O, O, O, _, _, _, _, _],
  [_, _, _, _, O, H, H, H, H, H, H, O, _, _, _, _],
  [_, _, _, O, H, H, H, H, H, H, H, H, O, _, _, _],
  [_, _, O, H, H, H, H, H, H, H, H, H, H, O, _, _],
  [_, _, O, B, B, E, E, B, B, E, E, B, B, O, _, _],
  [_, _, O, B, B, E, E, B, B, E, E, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, B, O, O, B, B, B, B, O, _, _],
  [_, _, _, O, B, B, B, B, B, B, B, B, O, _, _, _],
  [_, _, _, _, O, O, O, O, O, O, O, O, _, _, _, _],
  [_, _, _, O, O, B, B, B, B, B, B, O, O, _, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, _, O, O, O, _, _, _, _, O, O, O, _, _, _],
  [_, _, O, O, O, O, _, _, _, _, O, O, O, O, _, _],
];

export const MAIN_WALK_1: SpriteFrame = [
  [_, _, _, _, _, O, O, O, O, O, O, _, _, _, _, _],
  [_, _, _, _, O, H, H, H, H, H, H, O, _, _, _, _],
  [_, _, _, O, H, H, H, H, H, H, H, H, O, _, _, _],
  [_, _, O, H, H, H, H, H, H, H, H, H, H, O, _, _],
  [_, _, O, B, B, E, E, B, B, E, E, B, B, O, _, _],
  [_, _, O, B, B, E, E, B, B, E, E, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, O, O, O, O, B, B, B, O, _, _],
  [_, _, _, O, B, B, B, B, B, B, B, B, O, _, _, _],
  [_, _, _, _, O, O, O, O, O, O, O, O, _, _, _, _],
  [_, _, _, O, O, B, B, B, B, B, B, O, O, _, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, _, O, O, B, B, _, _, B, B, O, O, _, _, _],
  [_, _, _, _, O, O, O, _, _, _, O, O, _, _, _, _],
  [_, _, _, O, O, O, _, _, _, _, _, O, O, O, _, _],
];

export const MAIN_WALK_2: SpriteFrame = [
  [_, _, _, _, _, O, O, O, O, O, O, _, _, _, _, _],
  [_, _, _, _, O, H, H, H, H, H, H, O, _, _, _, _],
  [_, _, _, O, H, H, H, H, H, H, H, H, O, _, _, _],
  [_, _, O, H, H, H, H, H, H, H, H, H, H, O, _, _],
  [_, _, O, B, B, E, E, B, B, E, E, B, B, O, _, _],
  [_, _, O, B, B, E, E, B, B, E, E, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, O, O, O, O, B, B, B, O, _, _],
  [_, _, _, O, B, B, B, B, B, B, B, B, O, _, _, _],
  [_, _, _, _, O, O, O, O, O, O, O, O, _, _, _, _],
  [_, _, _, O, O, B, B, B, B, B, B, O, O, _, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, _, O, O, B, B, _, _, B, B, O, O, _, _, _],
  [_, _, _, O, O, _, _, _, _, _, _, O, O, _, _, _],
  [_, _, O, O, O, _, _, _, _, O, O, O, _, _, _, _],
];

export const MAIN_WORKING: SpriteFrame = [
  [_, _, _, _, _, O, O, O, O, O, O, _, _, _, _, _],
  [_, _, _, _, O, H, H, H, H, H, H, O, _, _, _, _],
  [_, _, _, O, H, H, H, H, H, H, H, H, O, _, _, _],
  [_, _, O, H, H, H, H, H, H, H, H, H, H, O, _, _],
  [_, _, O, B, B, E, E, B, B, E, E, B, B, O, _, _],
  [_, _, O, B, B, E, E, B, B, E, E, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, O, O, O, O, O, O, B, B, O, _, _],
  [_, _, _, O, B, B, B, B, B, B, B, B, O, _, _, _],
  [_, _, _, _, O, O, O, O, O, O, O, O, _, _, _, _],
  [_, _, O, O, B, B, B, B, B, B, B, B, O, O, _, _],
  [_, O, H, B, B, B, B, B, B, B, B, B, B, H, O, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, B, B, B, B, O, _, _],
  [_, _, _, O, O, O, _, _, _, _, O, O, O, _, _, _],
  [_, _, O, O, O, O, _, _, _, _, O, O, O, O, _, _],
];

// ── Subagent (12x12) ────────────────────────────────────

export const SUB_IDLE_1: SpriteFrame = [
  [_, _, _, O, O, O, O, O, O, _, _, _],
  [_, _, O, H, H, H, H, H, H, O, _, _],
  [_, O, H, H, H, H, H, H, H, H, O, _],
  [_, O, B, E, E, B, B, E, E, B, O, _],
  [_, O, B, E, E, B, B, E, E, B, O, _],
  [_, O, B, B, O, O, O, O, B, B, O, _],
  [_, _, O, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, O, _, _],
  [_, O, B, B, B, B, B, B, B, B, O, _],
  [_, O, B, B, B, B, B, B, B, B, O, _],
  [_, _, O, O, _, _, _, _, O, O, _, _],
  [_, O, O, O, _, _, _, _, O, O, O, _],
];

export const SUB_IDLE_2: SpriteFrame = [
  [_, _, _, O, O, O, O, O, O, _, _, _],
  [_, _, O, H, H, H, H, H, H, O, _, _],
  [_, O, H, H, H, H, H, H, H, H, O, _],
  [_, O, B, E, E, B, B, E, E, B, O, _],
  [_, O, B, E, E, B, B, E, E, B, O, _],
  [_, O, B, B, B, O, O, B, B, B, O, _],
  [_, _, O, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, O, _, _],
  [_, O, B, B, B, B, B, B, B, B, O, _],
  [_, O, B, B, B, B, B, B, B, B, O, _],
  [_, _, O, O, _, _, _, _, O, O, _, _],
  [_, O, O, O, _, _, _, _, O, O, O, _],
];

export const SUB_WALK_1: SpriteFrame = [
  [_, _, _, O, O, O, O, O, O, _, _, _],
  [_, _, O, H, H, H, H, H, H, O, _, _],
  [_, O, H, H, H, H, H, H, H, H, O, _],
  [_, O, B, E, E, B, B, E, E, B, O, _],
  [_, O, B, E, E, B, B, E, E, B, O, _],
  [_, O, B, B, O, O, O, O, B, B, O, _],
  [_, _, O, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, O, _, _],
  [_, O, B, B, B, B, B, B, B, B, O, _],
  [_, _, O, B, B, _, _, B, B, O, _, _],
  [_, _, O, O, _, _, _, _, O, O, _, _],
  [_, O, O, _, _, _, _, _, _, O, O, _],
];

export const SUB_WALK_2: SpriteFrame = [
  [_, _, _, O, O, O, O, O, O, _, _, _],
  [_, _, O, H, H, H, H, H, H, O, _, _],
  [_, O, H, H, H, H, H, H, H, H, O, _],
  [_, O, B, E, E, B, B, E, E, B, O, _],
  [_, O, B, E, E, B, B, E, E, B, O, _],
  [_, O, B, B, O, O, O, O, B, B, O, _],
  [_, _, O, B, B, B, B, B, B, O, _, _],
  [_, _, O, B, B, B, B, B, B, O, _, _],
  [_, O, B, B, B, B, B, B, B, B, O, _],
  [_, _, O, B, B, _, _, B, B, O, _, _],
  [_, _, _, O, O, _, _, O, O, _, _, _],
  [_, _, O, O, _, _, _, _, O, O, _, _],
];

export const SUB_WORKING: SpriteFrame = [
  [_, _, _, O, O, O, O, O, O, _, _, _],
  [_, _, O, H, H, H, H, H, H, O, _, _],
  [_, O, H, H, H, H, H, H, H, H, O, _],
  [_, O, B, E, E, B, B, E, E, B, O, _],
  [_, O, B, E, E, B, B, E, E, B, O, _],
  [_, O, B, O, O, O, O, O, O, B, O, _],
  [_, _, O, B, B, B, B, B, B, O, _, _],
  [_, O, B, B, B, B, B, B, B, B, O, _],
  [O, H, B, B, B, B, B, B, B, B, H, O],
  [_, O, B, B, B, B, B, B, B, B, O, _],
  [_, _, O, O, _, _, _, _, O, O, _, _],
  [_, O, O, O, _, _, _, _, O, O, O, _],
];

// ── Exports grouped by role ─────────────────────────────

export interface SpriteSet {
  idle: [SpriteFrame, SpriteFrame];
  walk: [SpriteFrame, SpriteFrame];
  working: SpriteFrame;
  size: number;
}

export const MAIN_SPRITES: SpriteSet = {
  idle: [MAIN_IDLE_1, MAIN_IDLE_2],
  walk: [MAIN_WALK_1, MAIN_WALK_2],
  working: MAIN_WORKING,
  size: 16,
};

export const SUB_SPRITES: SpriteSet = {
  idle: [SUB_IDLE_1, SUB_IDLE_2],
  walk: [SUB_WALK_1, SUB_WALK_2],
  working: SUB_WORKING,
  size: 12,
};
