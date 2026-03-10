/**
 * Color palette and book-row constants for the pixel-art office furniture module.
 * Inspired by Gather.town's bright, warm, Pokémon-like office aesthetic.
 */

export const C = {
  // Wood tones — warmer, lighter, more saturated
  darkWood: 0x7a4a20,
  medWood: 0x9a6030,
  wood: 0xb87840,
  lightWood: 0xd09a58,
  paleWood: 0xe8b870,

  // Floor — light warm beige (Gather.town style)
  woodFloor: 0xd4b880,
  woodFloorAlt: 0xc8a870,
  woodFloorDark: 0xb89860,
  plankLine: 0xa08850,

  // Office tile floor — light peach/cream (main floor type)
  tileBase: 0xf0e0c8,
  tileAlt: 0xe8d4bc,
  tileGrid: 0xd0b898,
  tileDiamond: 0xdcc8a8,
  tileHighlight: 0xfff4e8,

  // Blue carpet — muted, saturated
  carpet: 0x5a7ab8,
  carpetAlt: 0x4a6aa8,
  carpetDot: 0x7090c8,
  carpetEdge: 0x384f80,

  // Warm carpet — terracotta
  carpetWarm: 0xc07858,
  carpetWarmAlt: 0xa86848,
  carpetWarmDot: 0xd08868,

  // Dark floor — deep navy/slate for server rooms
  darkFloor: 0x1e2238,
  darkFloorAlt: 0x262840,
  darkFloorLine: 0x181a2e,

  // Green carpet — for lounge areas
  greenFloor: 0x4a8850,
  greenFloorAlt: 0x5a9860,
  greenFloorDot: 0x6aa870,

  // Grey carpet for workstations
  greyCarpet: 0x8a8c9a,
  greyCarpetAlt: 0x7a7c8a,
  greyCarpetDot: 0x9a9caa,
  greyCarpetEdge: 0x6a6c7a,

  // Screen / tech
  screenFrame: 0x222234,
  screenBody: 0x2e3040,
  screenBlue: 0x4488ee,
  screenBlueDark: 0x336699,
  screenGlow: 0x88ccff,
  screenDark: 0x334455,
  screenGreen: 0x22cc66,
  screenGreenGlow: 0x44ee88,
  screenOrange: 0xff8844,
  led: 0x44ff66,
  ledOff: 0x1a3322,
  ledRed: 0xff4444,
  ledBlue: 0x44aaff,
  ledYellow: 0xffcc22,

  // Books — vivid
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

  // Furniture — office chairs (dark charcoal, like Gather.town)
  chairSeat: 0x3a3a4a,
  chairBack: 0x2a2a38,
  chairArm: 0x4a4a5a,
  chairBase: 0x555566,
  chairWheel: 0x222230,
  chairHighlight: 0x5a5a6a,

  // Furniture — sofas (warm, like Gather.town)
  sofaBody: 0xd4824a,
  sofaDark: 0xb46838,
  sofaLight: 0xeea066,
  sofaHighlight: 0xf0c090,
  sofaArm: 0xb46838,

  // Furniture — metal
  metalBright: 0xd0d0e0,
  metalLight: 0xb0b0c4,
  metalMid: 0x888898,
  metalDark: 0x555568,
  metalFrame: 0x44445a,
  metalShine: 0xe8e8f0,

  // Nature — bright, lush
  leafDark: 0x2a7a2a,
  leaf: 0x3eb03e,
  leafLight: 0x5acc5a,
  leafBright: 0x76ee76,
  leafYellow: 0xa8cc44,
  potBase: 0xb06840,
  potDark: 0x8a4e2a,
  potRim: 0xcc8850,
  potHighlight: 0xe0a060,
  soil: 0x5a4230,

  // Common
  white: 0xf4f4f4,
  offWhite: 0xe0ddd8,
  paper: 0xf0e8d4,
  cream: 0xfcf4e4,
  black: 0x141420,
  red: 0xee3333,
  green: 0x33cc44,
  blue: 0x3388ee,
  yellow: 0xeecc33,
  pink: 0xee6688,
  purple: 0x9944dd,
  orange: 0xee8833,

  // Special
  vendingBody: 0x3a5a7a,
  vendingGlass: 0x88bbcc,
  vendingLight: 0xaaddee,
  fridgeBody: 0xc8d4da,
  fridgeLight: 0xe0eaf0,
  fridgeDark: 0x8898a4,
  fridgeHandle: 0xa0aab8,
  couchFrame: 0x7a5038,
  couchSeat: 0xd4824a,
  couchCushion: 0xeea060,
  couchHighlight: 0xffc080,
  portalDeep: 0x5511aa,
  portalMid: 0x7733cc,
  portalLight: 0xaa55ff,
  portalGlow: 0xdd99ff,

  // Whiteboard
  whiteboardFrame: 0xccccdd,
  whiteboardSurface: 0xf8f8fc,
  whiteboardLine: 0xe4e4ee,

  // Sticky notes
  stickyYellow: 0xffee44,
  stickyPink: 0xff88aa,
  stickyGreen: 0x88ee88,
  stickyBlue: 0x88bbff,
  stickyOrange: 0xffaa44,
  stickyPurple: 0xcc88ff,

  // Wall colors for room borders
  wallLight: 0xf0e8d8,
  wallMid: 0xddd0c0,
  wallDark: 0xb8a888,
  wallShadow: 0xa09878,
} as const;

export const BOOK_ROWS: readonly number[][] = [
  [C.bookRed, C.bookGreen, C.bookBlue, C.bookYellow, C.bookPurple, C.bookOrange, C.bookBrown, C.bookCyan, C.bookPink, C.bookWhite, C.bookTan, C.bookNavy],
  [C.bookBlue, C.bookOrange, C.bookDarkGreen, C.bookPink, C.bookBrown, C.bookYellow, C.bookRed, C.bookWhite, C.bookNavy, C.bookCyan, C.bookTan, C.bookPurple],
  [C.bookPurple, C.bookTan, C.bookCyan, C.bookDarkRed, C.bookGreen, C.bookNavy, C.bookOrange, C.bookBrown, C.bookBlue, C.bookPink, C.bookYellow, C.bookWhite],
];
