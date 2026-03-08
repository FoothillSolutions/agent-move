/**
 * Color palette and book-row constants for the pixel-art office furniture module.
 */

export const C = {
  // Wood tones
  darkWood: 0x4a2e14,
  medWood: 0x6b4226,
  wood: 0x7a5030,
  lightWood: 0x9a7048,
  paleWood: 0xb8884b,

  // Floor
  woodFloor: 0x9a7040,
  woodFloorAlt: 0xa07848,
  woodFloorDark: 0x806030,
  plankLine: 0x6a5028,

  tileBase: 0xd0c4b4,
  tileAlt: 0xc4b8a8,
  tileGrid: 0xb0a494,
  tileDiamond: 0xbcb0a0,

  carpet: 0x4878a0,
  carpetAlt: 0x407090,
  carpetDot: 0x5888b0,
  carpetEdge: 0x385878,

  carpetWarm: 0xa06848,
  carpetWarmAlt: 0x8a5838,
  carpetWarmDot: 0xb07858,

  darkFloor: 0x282640,
  darkFloorAlt: 0x302e50,
  darkFloorLine: 0x222038,

  greenFloor: 0x3a6a3a,
  greenFloorAlt: 0x4a7a4a,
  greenFloorDot: 0x5a8a5a,

  // Screen / tech
  screenFrame: 0x2a2a38,
  screenBody: 0x333344,
  screenBlue: 0x6699cc,
  screenGlow: 0x88bbdd,
  screenDark: 0x445566,
  screenGreen: 0x33aa55,
  screenGreenGlow: 0x55cc77,
  led: 0x44dd44,
  ledOff: 0x224422,
  ledRed: 0xdd4444,
  ledBlue: 0x4488dd,

  // Books
  bookRed: 0xc04040,
  bookDarkRed: 0x903030,
  bookGreen: 0x40a050,
  bookDarkGreen: 0x307040,
  bookBlue: 0x4060c0,
  bookNavy: 0x304080,
  bookYellow: 0xc0a030,
  bookPurple: 0x8050b0,
  bookOrange: 0xd08030,
  bookCyan: 0x30a0b0,
  bookBrown: 0x806040,
  bookPink: 0xc06080,
  bookWhite: 0xc8c8c8,
  bookTan: 0xb0a080,

  // Furniture
  chairSeat: 0x9a8060,
  chairBack: 0x887050,
  chairArm: 0x786040,

  metalBright: 0xbbbbcc,
  metalLight: 0x999aaa,
  metalMid: 0x777788,
  metalDark: 0x555566,
  metalFrame: 0x444455,

  // Nature
  leafDark: 0x2a7a2a,
  leaf: 0x3a9a3a,
  leafLight: 0x50b050,
  leafBright: 0x66cc66,
  potBase: 0x8b5a3a,
  potDark: 0x6b4a2a,
  potRim: 0x9a6a4a,
  soil: 0x4a3a2a,

  // Common
  white: 0xeeeeee,
  offWhite: 0xd4d4d4,
  paper: 0xe8e0d0,
  cream: 0xf0e8d8,
  black: 0x111118,
  red: 0xdd4444,
  green: 0x44bb44,
  blue: 0x4488dd,
  yellow: 0xddcc44,

  // Special
  vendingBody: 0x445566,
  vendingGlass: 0x88aabb,
  fridgeBody: 0xaab4c0,
  fridgeLight: 0xc4ccd4,
  fridgeDark: 0x889098,
  couchFrame: 0x6b4a38,
  couchSeat: 0x8b6050,
  couchCushion: 0xa07060,
  couchHighlight: 0xb88070,
  portalDeep: 0x442288,
  portalMid: 0x6633aa,
  portalLight: 0x9955dd,
  portalGlow: 0xbb77ff,

  // Whiteboard
  whiteboardFrame: 0xbbbbcc,
  whiteboardSurface: 0xf4f4f4,

  // Sticky notes
  stickyYellow: 0xf0e060,
  stickyPink: 0xf090a0,
  stickyGreen: 0x80d080,
  stickyBlue: 0x80b0e0,
  stickyOrange: 0xf0a050,
} as const;

export const BOOK_ROWS: readonly number[][] = [
  [C.bookRed, C.bookGreen, C.bookBlue, C.bookYellow, C.bookPurple, C.bookOrange, C.bookBrown, C.bookCyan, C.bookPink, C.bookWhite, C.bookTan, C.bookNavy],
  [C.bookBlue, C.bookOrange, C.bookDarkGreen, C.bookPink, C.bookBrown, C.bookYellow, C.bookRed, C.bookWhite, C.bookNavy, C.bookCyan, C.bookTan, C.bookPurple],
  [C.bookPurple, C.bookTan, C.bookCyan, C.bookDarkRed, C.bookGreen, C.bookNavy, C.bookOrange, C.bookBrown, C.bookBlue, C.bookPink, C.bookYellow, C.bookWhite],
];
