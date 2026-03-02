/** Pixel-art character color palettes (12 palettes) */
export interface AgentPalette {
  name: string;
  body: number;
  outline: number;
  highlight: number;
  eye: number;
}

export const AGENT_PALETTES: AgentPalette[] = [
  { name: 'blue',    body: 0x4a90d9, outline: 0x2c5a8a, highlight: 0x7ab8f5, eye: 0xffffff },
  { name: 'green',   body: 0x4caf50, outline: 0x2e7d32, highlight: 0x81c784, eye: 0xffffff },
  { name: 'red',     body: 0xe57373, outline: 0xc62828, highlight: 0xffcdd2, eye: 0xffffff },
  { name: 'purple',  body: 0xab47bc, outline: 0x6a1b9a, highlight: 0xce93d8, eye: 0xffffff },
  { name: 'orange',  body: 0xff9800, outline: 0xe65100, highlight: 0xffcc80, eye: 0xffffff },
  { name: 'cyan',    body: 0x26c6da, outline: 0x00838f, highlight: 0x80deea, eye: 0xffffff },
  { name: 'pink',    body: 0xf06292, outline: 0xc2185b, highlight: 0xf8bbd0, eye: 0xffffff },
  { name: 'teal',    body: 0x26a69a, outline: 0x00695c, highlight: 0x80cbc4, eye: 0xffffff },
  { name: 'amber',   body: 0xffc107, outline: 0xff8f00, highlight: 0xffe082, eye: 0x333333 },
  { name: 'indigo',  body: 0x5c6bc0, outline: 0x283593, highlight: 0x9fa8da, eye: 0xffffff },
  { name: 'lime',    body: 0x9ccc65, outline: 0x558b2f, highlight: 0xc5e1a5, eye: 0x333333 },
  { name: 'brown',   body: 0x8d6e63, outline: 0x4e342e, highlight: 0xbcaaa4, eye: 0xffffff },
];

/** Background and UI colors */
export const COLORS = {
  background: 0x1a1e38,
  gridLine: 0x16213e,
  zoneBackground: 0x0f3460,
  zoneBorder: 0xe94560,
  text: 0xffffff,
  textDim: 0x888888,
  speechBubble: 0xffffff,
  speechText: 0x1a1a2e,
  relationshipLine: 0x555555,
  teamLine: 0x44ff44,
} as const;
