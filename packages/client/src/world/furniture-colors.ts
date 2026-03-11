/**
 * Gather.town-inspired color palette for pixel-art office furniture.
 * Colors extracted from Gather.town screenshots for authentic look.
 */

export const C = {
  // ── Desk / Work Surface (WHITE, not wood — Gather.town signature) ─────
  deskTop: 0xe8e4e0,
  deskEdge: 0xd0ccc8,
  deskShadow: 0xb8b4b0,
  deskHighlight: 0xf4f2f0,

  // ── Wood tones (for tables, bookshelves, counters) ────────────────────
  darkWood: 0x7a5030,
  medWood: 0x9a6838,
  wood: 0xb88848,
  lightWood: 0xd0a858,
  paleWood: 0xe8c878,

  // ── Screen / tech ─────────────────────────────────────────────────────
  screenFrame: 0x222234,
  screenBody: 0x2e3040,
  screenBlue: 0x4488ee,
  screenBlueDark: 0x336699,
  screenGlow: 0x88ccff,
  screenDark: 0x334455,
  screenGreen: 0x22cc66,
  screenGreenGlow: 0x44ee88,
  led: 0x44ff66,
  ledOff: 0x1a3322,
  ledRed: 0xff4444,
  ledBlue: 0x44aaff,
  ledYellow: 0xffcc22,

  // ── Books ─────────────────────────────────────────────────────────────
  bookRed: 0xdd3333,
  bookDarkRed: 0xaa2222,
  bookGreen: 0x44aa44,
  bookDarkGreen: 0x338833,
  bookBlue: 0x3355cc,
  bookNavy: 0x223388,
  bookYellow: 0xddbb22,
  bookPurple: 0x9944cc,
  bookOrange: 0xee7722,
  bookCyan: 0x22aabb,
  bookBrown: 0x886644,
  bookPink: 0xdd5588,
  bookWhite: 0xe8e8e8,
  bookTan: 0xc8aa77,

  // ── Office Chairs (very dark charcoal — Gather.town style) ────────────
  chairSeat: 0x3a3a48,
  chairBack: 0x2a2a38,
  chairArm: 0x4a4a58,
  chairBase: 0x555566,
  chairWheel: 0x222230,
  chairHighlight: 0x5a5a68,

  // ── Sofa (warm orange/tan — Gather.town lounge) ───────────────────────
  sofaBody: 0xd88848,
  sofaDark: 0xb87038,
  sofaLight: 0xf0a868,
  sofaHighlight: 0xf8c888,
  sofaArm: 0xc07840,

  // ── Metal / Tech furniture ────────────────────────────────────────────
  metalBright: 0xd0d0e0,
  metalLight: 0xb0b0c4,
  metalMid: 0x888898,
  metalDark: 0x555568,
  metalFrame: 0x44445a,
  metalShine: 0xe8e8f0,

  // ── Bookshelf (grey-blue frame — Gather.town style) ───────────────────
  shelfFrame: 0x7888a0,
  shelfBack: 0x8898b0,
  shelfEdge: 0x6878a0,
  shelfHighlight: 0x98a8c0,

  // ── Nature / Plants ───────────────────────────────────────────────────
  leafDark: 0x2a7a2a,
  leaf: 0x3eb03e,
  leafLight: 0x5acc5a,
  leafBright: 0x76ee76,
  potBase: 0xb06840,
  potDark: 0x8a4e2a,
  potRim: 0xcc8850,
  potHighlight: 0xe0a060,
  soil: 0x5a4230,

  // ── Common ────────────────────────────────────────────────────────────
  white: 0xf4f4f4,
  offWhite: 0xe0ddd8,
  paper: 0xf0e8d4,
  cream: 0xfcf4e4,
  black: 0x141420,
  red: 0xee3333,
  green: 0x33cc44,
  blue: 0x3388ee,
  yellow: 0xeecc33,

  // ── Special furniture ─────────────────────────────────────────────────
  vendingBody: 0x3a5a7a,
  vendingGlass: 0x88bbcc,
  vendingLight: 0xaaddee,
  fridgeBody: 0xc8d4da,
  fridgeLight: 0xe0eaf0,
  fridgeDark: 0x8898a4,
  fridgeHandle: 0xa0aab8,
  couchFrame: 0x7a5038,

  // ── Portal ────────────────────────────────────────────────────────────
  portalDeep: 0x5511aa,
  portalMid: 0x7733cc,
  portalLight: 0xaa55ff,
  portalGlow: 0xdd99ff,

  // ── Whiteboard ────────────────────────────────────────────────────────
  whiteboardFrame: 0xccccdd,
  whiteboardSurface: 0xf8f8fc,

  // ── Sticky notes ──────────────────────────────────────────────────────
  stickyYellow: 0xffee44,
  stickyPink: 0xff88aa,
  stickyGreen: 0x88ee88,
  stickyBlue: 0x88bbff,
  stickyOrange: 0xffaa44,
  stickyPurple: 0xcc88ff,
} as const;

export const BOOK_ROWS: readonly number[][] = [
  [C.bookRed, C.bookGreen, C.bookBlue, C.bookYellow, C.bookPurple, C.bookOrange, C.bookBrown, C.bookCyan, C.bookPink, C.bookWhite, C.bookTan, C.bookNavy],
  [C.bookBlue, C.bookOrange, C.bookDarkGreen, C.bookPink, C.bookBrown, C.bookYellow, C.bookRed, C.bookWhite, C.bookNavy, C.bookCyan, C.bookTan, C.bookPurple],
  [C.bookPurple, C.bookTan, C.bookCyan, C.bookDarkRed, C.bookGreen, C.bookNavy, C.bookOrange, C.bookBrown, C.bookBlue, C.bookPink, C.bookYellow, C.bookWhite],
];
