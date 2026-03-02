import { Graphics } from 'pixi.js';

/**
 * Pixel-art office furniture and room decoration module.
 * Draws RPG-style office rooms matching the pixel-art aesthetic.
 *
 * PX = base pixel unit (all coords are multiples of this for chunky look).
 * Zone size = 280x280. With PX=4, that's 70x70 art pixels.
 */
const PX = 4;

// ── Color Palette ──────────────────────────────────────────

const C = {
  // Wood tones
  darkWood: 0x4a2e14,
  medWood: 0x6b4226,
  wood: 0x7a5030,
  lightWood: 0x9a7048,
  paleWood: 0xb8884b,
  warmWood: 0xa07040,

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

  darkFloor: 0x282640,
  darkFloorAlt: 0x302e50,
  darkFloorLine: 0x222038,

  // Walls
  wallDark: 0x1a1e38,
  wallMid: 0x222648,
  wallLight: 0x2a2e50,
  wallTrim: 0x3a3e60,
  wallTop: 0x141830,

  // Screen / tech
  screenFrame: 0x2a2a38,
  screenBody: 0x333344,
  screenBlue: 0x6699cc,
  screenGlow: 0x88bbdd,
  screenDark: 0x445566,
  led: 0x44dd44,
  ledOff: 0x224422,

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
};

// Book color sequences for variety
const BOOK_ROWS = [
  [C.bookRed, C.bookGreen, C.bookBlue, C.bookYellow, C.bookPurple, C.bookOrange, C.bookBrown, C.bookCyan, C.bookPink, C.bookWhite, C.bookTan, C.bookNavy, C.bookDarkRed, C.bookDarkGreen],
  [C.bookBlue, C.bookOrange, C.bookDarkGreen, C.bookPink, C.bookBrown, C.bookYellow, C.bookRed, C.bookWhite, C.bookNavy, C.bookCyan, C.bookTan, C.bookPurple, C.bookGreen, C.bookDarkRed],
  [C.bookPurple, C.bookTan, C.bookCyan, C.bookDarkRed, C.bookGreen, C.bookNavy, C.bookOrange, C.bookBrown, C.bookBlue, C.bookPink, C.bookYellow, C.bookWhite, C.bookRed, C.bookDarkGreen],
];

// ── Drawing Helpers ─────────────────────────────────────────

function px(g: Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.rect(x, y, w, h).fill(color);
}

function P(n: number): number { return n * PX; }

// ── Floor Patterns ──────────────────────────────────────────

export function drawWoodFloor(g: Graphics, x: number, y: number, w: number, h: number): void {
  // Base
  px(g, x, y, w, h, C.woodFloor);

  // Wide planks with alternating shade
  const plankH = P(4);
  let row = 0;
  for (let py = 0; py < h; py += plankH) {
    const ph = Math.min(plankH, h - py);
    // Alternating plank color
    if (row % 2 === 1) {
      px(g, x, y + py, w, ph, C.woodFloorAlt);
    }
    // Plank seam line at top
    px(g, x, y + py, w, 1, C.plankLine);

    // Vertical joints (offset per row)
    const offset = (row % 2) * P(7);
    for (let px2 = offset; px2 < w; px2 += P(14)) {
      px(g, x + px2, y + py, 1, ph, C.woodFloorDark);
    }
    row++;
  }
}

export function drawTileFloor(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.tileBase);
  const tileSize = P(6);
  for (let ty = 0; ty < h; ty += tileSize) {
    for (let tx = 0; tx < w; tx += tileSize) {
      const odd = ((tx / tileSize + ty / tileSize) % 2) === 0;
      if (odd) px(g, x + tx, y + ty, tileSize, tileSize, C.tileAlt);
      // Grid lines
      px(g, x + tx, y + ty, tileSize, 1, C.tileGrid);
      px(g, x + tx, y + ty, 1, tileSize, C.tileGrid);
      // Diamond accent on alternate tiles
      if (!odd) {
        const cx = x + tx + tileSize / 2 - 1;
        const cy = y + ty + tileSize / 2 - 1;
        px(g, cx, cy, 2, 2, C.tileDiamond);
      }
    }
  }
}

export function drawCarpetFloor(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.carpet);
  // Subtle woven texture
  for (let py = 0; py < h; py += P(2)) {
    for (let pxx = ((py / P(2)) % 2) * P(2); pxx < w; pxx += P(4)) {
      px(g, x + pxx, y + py, P(1), P(1), C.carpetDot);
    }
  }
  // Edge border
  px(g, x, y, w, P(1), C.carpetEdge);
  px(g, x, y + h - P(1), w, P(1), C.carpetEdge);
  px(g, x, y, P(1), h, C.carpetEdge);
  px(g, x + w - P(1), y, P(1), h, C.carpetEdge);
}

export function drawDarkFloor(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.darkFloor);
  for (let py = 0; py < h; py += P(3)) {
    px(g, x, y + py, w, 1, C.darkFloorLine);
  }
  // Subtle alternating
  for (let py = P(1); py < h; py += P(6)) {
    px(g, x, y + py, w, P(3), C.darkFloorAlt);
  }
}

// ── Wall Rendering ──────────────────────────────────────────

/** Top wall with depth effect — tall dark section with trim */
function drawTopWall(g: Graphics, x: number, y: number, w: number, h: number): void {
  const wallH = P(5);
  px(g, x, y, w, wallH, C.wallDark);
  px(g, x, y, w, P(1), C.wallTop);
  px(g, x, y + P(1), w, P(1), C.wallMid);
  // Trim line at bottom of wall
  px(g, x, y + wallH - P(1), w, P(1), C.wallTrim);
  px(g, x, y + wallH, w, 1, C.wallLight);
}

// ── Furniture Pieces ────────────────────────────────────────

/** Wide bookshelf against wall — the signature piece */
function drawWideShelf(g: Graphics, x: number, y: number): void {
  const sw = P(16), sh = P(14);
  // Back panel
  px(g, x, y, sw, sh, C.darkWood);
  // Shelf frame sides
  px(g, x, y, P(1), sh, C.medWood);
  px(g, x + sw - P(1), y, P(1), sh, C.medWood);
  // Interior
  px(g, x + P(1), y + P(1), sw - P(2), sh - P(2), C.wood);
  // Top
  px(g, x, y, sw, P(1), C.lightWood);
  // Three shelf dividers
  for (let i = 1; i <= 3; i++) {
    const sy = y + i * P(3) + P(1);
    px(g, x, sy, sw, P(1), C.medWood);
    px(g, x + P(1), sy, sw - P(2), 1, C.lightWood);
  }
  // Books on each shelf (3 shelves)
  for (let shelf = 0; shelf < 3; shelf++) {
    const shelfBottom = y + (shelf + 1) * P(3) + P(1);
    const colors = BOOK_ROWS[shelf % BOOK_ROWS.length];
    let bx = x + P(1) + 1;
    let ci = shelf * 3; // offset color start
    while (bx < x + sw - P(2)) {
      const bw = PX - 1;
      const bh = P(2) + ((ci * 3 + shelf) % 3);
      px(g, bx, shelfBottom - bh, bw, bh, colors[ci % colors.length]);
      bx += bw + 1;
      ci++;
    }
  }
  // Bottom shelf/base
  px(g, x, y + sh - P(1), sw, P(1), C.medWood);
}

/** Narrow bookshelf */
function drawNarrowShelf(g: Graphics, x: number, y: number): void {
  const sw = P(10), sh = P(14);
  px(g, x, y, sw, sh, C.darkWood);
  px(g, x, y, P(1), sh, C.medWood);
  px(g, x + sw - P(1), y, P(1), sh, C.medWood);
  px(g, x + P(1), y + P(1), sw - P(2), sh - P(2), C.wood);
  px(g, x, y, sw, P(1), C.lightWood);

  for (let i = 1; i <= 3; i++) {
    const sy = y + i * P(3) + P(1);
    px(g, x, sy, sw, P(1), C.medWood);
    px(g, x + P(1), sy, sw - P(2), 1, C.lightWood);
  }

  for (let shelf = 0; shelf < 3; shelf++) {
    const shelfBottom = y + (shelf + 1) * P(3) + P(1);
    const colors = BOOK_ROWS[(shelf + 1) % BOOK_ROWS.length];
    let bx = x + P(1) + 1;
    let ci = shelf * 5;
    while (bx < x + sw - P(2)) {
      const bw = PX - 1;
      const bh = P(2) + ((ci * 2 + shelf) % 3);
      px(g, bx, shelfBottom - bh, bw, bh, colors[ci % colors.length]);
      bx += bw + 1;
      ci++;
    }
  }
  px(g, x, y + sh - P(1), sw, P(1), C.medWood);
}

/** Desk with monitor — agent faces down toward it */
function drawDeskWithMonitor(g: Graphics, x: number, y: number): void {
  const dw = P(14), dh = P(7);
  // Desktop surface
  px(g, x, y, dw, dh, C.medWood);
  px(g, x + P(1), y + P(1), dw - P(2), dh - P(2), C.wood);
  // Wood grain highlight
  px(g, x + P(1), y + P(1), dw - P(2), 1, C.lightWood);
  // Front panel
  px(g, x, y + dh, dw, P(2), C.medWood);
  px(g, x + P(1), y + dh, dw - P(2), P(1), C.darkWood);
  // Legs visible at sides
  px(g, x, y + dh + P(1), P(1), P(2), C.darkWood);
  px(g, x + dw - P(1), y + dh + P(1), P(1), P(2), C.darkWood);

  // Monitor
  const mx = x + P(4), my = y;
  px(g, mx, my, P(6), P(5), C.screenFrame);
  px(g, mx + P(1), my + P(1), P(4), P(3), C.screenBlue);
  // Screen glare
  px(g, mx + P(1), my + P(1), P(2), P(1), C.screenGlow);
  // Stand
  px(g, mx + P(2), my + P(5), P(2), P(1), C.screenBody);
  // Keyboard
  px(g, x + P(3), y + P(5), P(5), P(1), C.metalDark);
}

/** Laptop desk — smaller, no big monitor */
function drawLaptopDesk(g: Graphics, x: number, y: number): void {
  const dw = P(12), dh = P(6);
  px(g, x, y, dw, dh, C.medWood);
  px(g, x + P(1), y + P(1), dw - P(2), dh - P(2), C.wood);
  px(g, x + P(1), y + P(1), dw - P(2), 1, C.lightWood);
  px(g, x, y + dh, dw, P(2), C.medWood);
  px(g, x + P(1), y + dh, dw - P(2), P(1), C.darkWood);

  // Laptop
  const lx = x + P(3), ly = y + P(1);
  px(g, lx, ly, P(6), P(4), C.metalDark);
  px(g, lx + P(1), ly + P(1), P(4), P(2), C.screenBlue);
  px(g, lx + P(1), ly + P(1), P(2), P(1), C.screenGlow);
}

/** Office chair — top-down view */
function drawChair(g: Graphics, x: number, y: number): void {
  // Back
  px(g, x + P(1), y, P(3), P(1), C.chairBack);
  // Seat
  px(g, x, y + P(1), P(5), P(4), C.chairSeat);
  px(g, x + P(1), y + P(1), P(3), P(3), C.chairBack);
  // Armrests
  px(g, x, y + P(1), P(1), P(3), C.chairArm);
  px(g, x + P(4), y + P(1), P(1), P(3), C.chairArm);
}

/** Large plant in pot */
function drawPlantLarge(g: Graphics, x: number, y: number): void {
  // Pot
  px(g, x + P(1), y + P(5), P(4), P(3), C.potBase);
  px(g, x + P(2), y + P(5), P(2), P(1), C.potRim);
  px(g, x + P(2), y + P(7), P(2), P(1), C.potDark);
  // Soil
  px(g, x + P(1), y + P(4), P(4), P(1), C.soil);
  // Leaves — bushy
  px(g, x + P(2), y, P(2), P(5), C.leaf);
  px(g, x + P(1), y + P(1), P(1), P(3), C.leafDark);
  px(g, x + P(4), y + P(1), P(1), P(3), C.leafLight);
  px(g, x, y + P(2), P(1), P(2), C.leafDark);
  px(g, x + P(5), y + P(2), P(1), P(2), C.leafBright);
  px(g, x + P(2), y - P(1), P(2), P(1), C.leafLight);
  px(g, x + P(1), y, P(1), P(1), C.leaf);
  px(g, x + P(4), y, P(1), P(1), C.leafBright);
}

/** Small desk plant */
function drawPlantSmall(g: Graphics, x: number, y: number): void {
  // Pot
  px(g, x, y + P(3), P(3), P(2), C.potBase);
  px(g, x, y + P(4), P(3), P(1), C.potDark);
  // Leaves
  px(g, x + P(1), y, P(1), P(3), C.leaf);
  px(g, x, y + P(1), P(1), P(1), C.leafDark);
  px(g, x + P(2), y + P(1), P(1), P(1), C.leafLight);
}

/** Vending machine — tall with product display */
function drawVendingMachine(g: Graphics, x: number, y: number): void {
  const vw = P(8), vh = P(16);
  px(g, x, y, vw, vh, C.vendingBody);
  // Top
  px(g, x, y, vw, P(1), C.metalDark);
  // Glass front
  px(g, x + P(1), y + P(2), vw - P(2), P(9), C.vendingGlass);
  // Products (rows of colored items)
  const pColors = [C.bookRed, C.bookOrange, C.bookGreen, C.bookBlue, C.bookYellow];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      px(g, x + P(2) + col * P(2), y + P(3) + row * P(2), P(1), P(1), pColors[(row + col) % pColors.length]);
    }
    // Shelf line
    px(g, x + P(1), y + P(4) + row * P(2), vw - P(2), 1, C.metalDark);
  }
  // Dispensing slot
  px(g, x + P(1), y + P(12), vw - P(2), P(3), C.black);
  px(g, x + P(2), y + P(12), vw - P(4), P(1), C.metalDark);
  // Button panel
  px(g, x + vw - P(2), y + P(3), P(1), P(6), C.metalDark);
  px(g, x + vw - P(2), y + P(4), P(1), P(1), C.red);
  px(g, x + vw - P(2), y + P(6), P(1), P(1), C.green);
}

/** Fridge */
function drawFridge(g: Graphics, x: number, y: number): void {
  const fw = P(6), fh = P(14);
  px(g, x, y, fw, fh, C.fridgeBody);
  px(g, x + P(1), y + P(1), fw - P(2), fh - P(2), C.fridgeLight);
  // Door divider
  px(g, x + P(1), y + P(6), fw - P(2), P(1), C.fridgeDark);
  // Handles
  px(g, x + fw - P(2), y + P(3), P(1), P(2), C.metalMid);
  px(g, x + fw - P(2), y + P(8), P(1), P(2), C.metalMid);
  // Top surface
  px(g, x, y, fw, P(1), C.metalLight);
  // Shadow at base
  px(g, x, y + fh - P(1), fw, P(1), C.fridgeDark);
}

/** Wall clock */
function drawClock(g: Graphics, x: number, y: number): void {
  // Round-ish frame
  px(g, x + P(1), y, P(4), P(1), C.offWhite);
  px(g, x, y + P(1), P(6), P(4), C.white);
  px(g, x + P(1), y + P(5), P(4), P(1), C.offWhite);
  // Inner face
  px(g, x + P(1), y + P(1), P(4), P(4), C.cream);
  // Hour marks
  px(g, x + P(3), y + P(1), P(1), P(1), C.black); // 12
  px(g, x + P(4), y + P(3), P(1), P(1), C.black); // 3
  px(g, x + P(3), y + P(4), P(1), P(1), C.black); // 6
  px(g, x + P(1), y + P(3), P(1), P(1), C.black); // 9
  // Hands
  px(g, x + P(3), y + P(2), P(1), P(2), C.black);
  px(g, x + P(3), y + P(3), P(1), P(1), C.red);
}

/** Painting with landscape */
function drawPainting(g: Graphics, x: number, y: number): void {
  const pw = P(10), ph = P(7);
  // Frame
  px(g, x, y, pw, ph, C.paleWood);
  px(g, x, y, pw, P(1), C.lightWood);
  // Canvas
  px(g, x + P(1), y + P(1), pw - P(2), ph - P(2), 0x6699cc);
  // Mountains
  px(g, x + P(1), y + P(3), P(3), P(2), C.leafDark);
  px(g, x + P(2), y + P(2), P(2), P(1), C.leaf);
  // Ground
  px(g, x + P(1), y + ph - P(2), pw - P(2), P(1), C.leafDark);
  // Sun
  px(g, x + pw - P(3), y + P(1), P(2), P(2), C.yellow);
  // Clouds
  px(g, x + P(4), y + P(2), P(3), P(1), C.white);
}

/** Filing cabinet */
function drawFileCabinet(g: Graphics, x: number, y: number): void {
  const fw = P(5), fh = P(10);
  px(g, x, y, fw, fh, C.metalDark);
  px(g, x + P(1), y + P(1), fw - P(2), P(3), C.metalMid);
  px(g, x + P(1), y + P(5), fw - P(2), P(3), C.metalMid);
  // Handles
  px(g, x + P(2), y + P(2), P(1), P(1), C.metalFrame);
  px(g, x + P(2), y + P(6), P(1), P(1), C.metalFrame);
  // Labels
  px(g, x + P(1), y + P(1), P(2), P(1), C.paper);
  px(g, x + P(1), y + P(5), P(2), P(1), C.paper);
  // Base
  px(g, x, y + fh - P(1), fw, P(1), C.metalFrame);
}

/** Sofa / couch */
function drawSofa(g: Graphics, x: number, y: number): void {
  const sw = P(16), sh = P(8);
  // Back
  px(g, x, y, sw, P(3), C.couchFrame);
  px(g, x + P(1), y + P(1), sw - P(2), P(1), C.couchHighlight);
  // Seat
  px(g, x, y + P(3), sw, sh - P(3), C.couchSeat);
  // Cushions
  px(g, x + P(1), y + P(3), P(6), P(4), C.couchCushion);
  px(g, x + P(1), y + P(3), P(6), P(1), C.couchHighlight);
  px(g, x + P(9), y + P(3), P(6), P(4), C.couchCushion);
  px(g, x + P(9), y + P(3), P(6), P(1), C.couchHighlight);
  // Armrests
  px(g, x, y, P(1), sh, C.couchFrame);
  px(g, x + sw - P(1), y, P(1), sh, C.couchFrame);
}

/** Small table / coffee table */
function drawSmallTable(g: Graphics, x: number, y: number): void {
  const tw = P(10), th = P(5);
  px(g, x, y, tw, th, C.medWood);
  px(g, x + P(1), y + P(1), tw - P(2), th - P(2), C.wood);
  px(g, x + P(1), y + P(1), tw - P(2), 1, C.lightWood);
  // Legs
  px(g, x + P(1), y + th, P(1), P(2), C.darkWood);
  px(g, x + tw - P(2), y + th, P(1), P(2), C.darkWood);
}

/** Conference table (large, oval-ish) */
function drawConferenceTable(g: Graphics, x: number, y: number): void {
  const tw = P(18), th = P(10);
  // Shadow
  px(g, x + P(1), y + P(1), tw, th, C.darkWood);
  // Surface
  px(g, x, y, tw, th, C.medWood);
  px(g, x + P(1), y + P(1), tw - P(2), th - P(2), C.wood);
  // Woodgrain shine
  px(g, x + P(2), y + P(2), tw - P(4), P(1), C.lightWood);
  px(g, x + P(2), y + P(4), tw - P(4), 1, C.lightWood);
  // Papers on table
  px(g, x + P(3), y + P(3), P(3), P(4), C.paper);
  px(g, x + P(3), y + P(3), P(2), P(1), C.metalDark);
  px(g, x + P(12), y + P(5), P(2), P(3), C.paper);
}

/** Whiteboard on wall */
function drawWhiteboard(g: Graphics, x: number, y: number, wide?: boolean): void {
  const ww = wide ? P(20) : P(14);
  const wh = P(10);
  // Frame
  px(g, x, y, ww, wh, C.metalLight);
  // Board
  px(g, x + P(1), y + P(1), ww - P(2), wh - P(2), C.white);
  // Writing
  px(g, x + P(2), y + P(2), P(5), P(1), C.blue);
  px(g, x + P(2), y + P(4), P(7), P(1), C.red);
  px(g, x + P(2), y + P(6), P(4), P(1), C.black);
  if (wide) {
    px(g, x + P(12), y + P(2), P(4), P(1), C.green);
    px(g, x + P(12), y + P(4), P(6), P(1), C.blue);
    px(g, x + P(12), y + P(6), P(3), P(1), C.red);
    // Checkbox items
    for (let i = 0; i < 3; i++) {
      px(g, x + P(12), y + P(2) + i * P(2), P(1), P(1), C.metalDark);
    }
  }
  // Marker tray
  px(g, x + P(2), y + wh, ww - P(4), P(1), C.metalDark);
  // Markers on tray
  px(g, x + P(3), y + wh, P(1), P(1), C.red);
  px(g, x + P(5), y + wh, P(1), P(1), C.blue);
  px(g, x + P(7), y + wh, P(1), P(1), C.black);
}

/** Server rack */
function drawServerRack(g: Graphics, x: number, y: number): void {
  const rw = P(7), rh = P(14);
  px(g, x, y, rw, rh, C.metalFrame);
  px(g, x, y, rw, P(1), C.metalDark);
  // Server units (4 servers)
  for (let i = 0; i < 4; i++) {
    const sy = y + P(1) + i * P(3);
    px(g, x + P(1), sy, rw - P(2), P(2), C.metalDark);
    // Front panel
    px(g, x + P(1), sy, rw - P(2), P(1), C.metalMid);
    // LEDs
    px(g, x + P(2), sy + P(1), P(1), P(1), i < 3 ? C.led : C.ledOff);
    px(g, x + rw - P(3), sy + P(1), P(1), P(1), C.led);
    // Vent holes
    px(g, x + P(3), sy + P(1), P(1), P(1), C.black);
  }
  // Base
  px(g, x, y + rh - P(1), rw, P(1), C.metalFrame);
}

/** Coffee machine on counter */
function drawCoffeeMachine(g: Graphics, x: number, y: number): void {
  px(g, x, y, P(4), P(6), C.metalDark);
  px(g, x + P(1), y, P(2), P(1), C.metalBright);
  px(g, x + P(1), y + P(3), P(2), P(1), C.red);
  px(g, x, y + P(5), P(4), P(1), C.metalFrame);
  // Cup
  px(g, x + P(1), y + P(4), P(2), P(2), C.white);
}

/** Water cooler */
function drawWaterCooler(g: Graphics, x: number, y: number): void {
  // Bottle
  px(g, x + P(1), y, P(2), P(3), C.screenBlue);
  px(g, x + P(1), y, P(2), P(1), C.screenGlow);
  // Body
  px(g, x, y + P(3), P(4), P(5), C.metalLight);
  px(g, x + P(1), y + P(3), P(2), P(1), C.metalBright);
  // Taps
  px(g, x + P(1), y + P(5), P(1), P(1), C.blue);
  px(g, x + P(2), y + P(5), P(1), P(1), C.red);
  // Base
  px(g, x, y + P(7), P(4), P(1), C.metalDark);
}

/** Kitchen counter */
function drawCounter(g: Graphics, x: number, y: number, w: number): void {
  px(g, x, y, w, P(5), C.medWood);
  px(g, x + P(1), y + P(1), w - P(2), P(3), C.lightWood);
  px(g, x, y, w, P(1), C.paleWood);
  // Cabinet doors below
  px(g, x, y + P(5), w, P(4), C.medWood);
  const doorW = P(4);
  for (let dx = 0; dx < w - P(1); dx += doorW + 2) {
    px(g, x + dx + 1, y + P(6), doorW, P(2), C.wood);
    px(g, x + dx + P(2), y + P(7), P(1), P(1), C.darkWood); // handle
  }
}

/** Sticky note */
function drawStickyNote(g: Graphics, x: number, y: number, color: number): void {
  px(g, x, y, P(3), P(3), color);
  px(g, x, y, P(3), 1, 0x000000); // top shadow
  // Text line
  px(g, x + P(1), y + P(1), P(1), 1, C.metalDark);
}

/** Portal effect */
function drawPortalEffect(g: Graphics, cx: number, cy: number): void {
  const r = P(8);
  // Outer glow
  px(g, cx - P(6), cy - P(1), P(12), P(2), C.portalDeep);
  px(g, cx - P(1), cy - P(6), P(2), P(12), C.portalDeep);

  // Ring segments (approximate circle)
  px(g, cx - P(4), cy - P(5), P(8), P(1), C.portalMid);
  px(g, cx - P(5), cy - P(4), P(10), P(1), C.portalLight);
  px(g, cx - P(6), cy - P(3), P(1), P(6), C.portalMid);
  px(g, cx + P(5), cy - P(3), P(1), P(6), C.portalMid);
  px(g, cx - P(5), cy - P(3), P(1), P(6), C.portalLight);
  px(g, cx + P(4), cy - P(3), P(1), P(6), C.portalLight);
  px(g, cx - P(5), cy + P(3), P(10), P(1), C.portalLight);
  px(g, cx - P(4), cy + P(4), P(8), P(1), C.portalMid);

  // Inner area
  px(g, cx - P(3), cy - P(3), P(6), P(6), C.portalDeep);
  px(g, cx - P(2), cy - P(2), P(4), P(4), C.portalMid);
  // Center glow
  px(g, cx - P(1), cy - P(1), P(2), P(2), C.portalGlow);
  // Sparkle effect
  px(g, cx - P(3), cy, P(1), P(1), C.portalGlow);
  px(g, cx + P(2), cy - P(1), P(1), P(1), C.portalGlow);
  px(g, cx, cy + P(2), P(1), P(1), C.portalGlow);
  px(g, cx - P(1), cy - P(3), P(1), P(1), C.portalGlow);
}

/** Coffee cup */
function drawCoffeeCup(g: Graphics, x: number, y: number): void {
  px(g, x, y, P(2), P(2), C.white);
  px(g, x + P(2), y + P(1), P(1), P(1), C.offWhite); // handle
  px(g, x, y, P(2), 1, C.cream);
}

/** Papers on desk */
function drawPapers(g: Graphics, x: number, y: number): void {
  px(g, x + 2, y + 2, P(3), P(4), C.offWhite);
  px(g, x, y, P(3), P(4), C.paper);
  px(g, x + PX, y + PX, P(1), 1, C.metalDark);
  px(g, x + PX, y + P(2), P(2), 1, C.metalDark);
}

/** Boxes (for storage rooms) */
function drawBox(g: Graphics, x: number, y: number, color: number): void {
  px(g, x, y, P(4), P(3), color);
  px(g, x, y, P(4), P(1), C.paleWood);
  px(g, x + P(1), y + P(1), P(2), P(1), C.darkWood); // tape
}

// ── Room Decorator Functions ────────────────────────────────

export function decorateFiles(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawWoodFloor(g, x, y, w, h);
  drawTopWall(g, x, y, w, h);

  // Two wide bookshelves on wall
  drawWideShelf(g, x + P(2), y + P(5));
  drawWideShelf(g, x + P(20), y + P(5));

  // Boxes on shelf area
  drawBox(g, x + P(38), y + P(8), C.paleWood);
  drawBox(g, x + P(43), y + P(10), C.medWood);

  // Plant top left
  drawPlantLarge(g, x + P(2), y + P(20));

  // Filing cabinets on left
  drawFileCabinet(g, x + P(2), y + P(30));

  // Desks with monitors
  drawDeskWithMonitor(g, x + P(14), y + P(34));
  drawDeskWithMonitor(g, x + P(32), y + P(34));

  // Chairs in front of desks
  drawChair(g, x + P(17), y + P(46));
  drawChair(g, x + P(35), y + P(46));

  // Papers and coffee on desks
  drawCoffeeCup(g, x + P(28), y + P(36));
  drawPapers(g, x + P(14), y + P(38));

  // Small plant bottom-right
  drawPlantSmall(g, x + w - P(6), y + h - P(10));
}

export function decorateTerminal(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawWoodFloor(g, x, y, w, h);
  drawTopWall(g, x, y, w, h);

  // Bookshelves on wall
  drawWideShelf(g, x + P(2), y + P(5));
  drawWideShelf(g, x + P(20), y + P(5));

  // 4 desks in a 2x2 arrangement
  drawDeskWithMonitor(g, x + P(6), y + P(22));
  drawDeskWithMonitor(g, x + P(28), y + P(22));
  drawDeskWithMonitor(g, x + P(6), y + P(40));
  drawDeskWithMonitor(g, x + P(28), y + P(40));

  // Chairs
  drawChair(g, x + P(10), y + P(32));
  drawChair(g, x + P(32), y + P(32));
  drawChair(g, x + P(10), y + P(50));
  drawChair(g, x + P(32), y + P(50));

  // Coffee cups on desks
  drawCoffeeCup(g, x + P(20), y + P(24));
  drawCoffeeCup(g, x + P(42), y + P(42));

  // Water cooler
  drawWaterCooler(g, x + P(48), y + P(52));

  // Plants
  drawPlantSmall(g, x + P(2), y + h - P(8));
  drawPlantSmall(g, x + P(48), y + P(22));
}

export function decorateSearch(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawWoodFloor(g, x, y, w, h);
  drawTopWall(g, x, y, w, h);

  // Three bookshelves along top wall
  drawWideShelf(g, x + P(2), y + P(5));
  drawNarrowShelf(g, x + P(20), y + P(5));
  drawWideShelf(g, x + P(32), y + P(5));

  // Side bookshelves
  drawNarrowShelf(g, x + P(2), y + P(22));
  drawNarrowShelf(g, x + w - P(12), y + P(22));

  // Reading table in center
  drawSmallTable(g, x + P(16), y + P(38));

  // Chair at table
  drawChair(g, x + P(19), y + P(45));

  // Papers on table
  drawPapers(g, x + P(18), y + P(39));

  // Plants in corners
  drawPlantLarge(g, x + P(2), y + h - P(12));
  drawPlantLarge(g, x + w - P(8), y + h - P(12));
}

export function decorateWeb(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawCarpetFloor(g, x, y, w, h);
  drawTopWall(g, x, y, w, h);

  // Large screen / TV on wall
  const sx = x + P(10), sy = y + P(5);
  px(g, sx, sy, P(20), P(12), C.screenFrame);
  px(g, sx + P(1), sy + P(1), P(18), P(10), C.screenDark);
  px(g, sx + P(2), sy + P(2), P(16), P(8), C.screenBlue);
  // Browser UI on screen
  px(g, sx + P(2), sy + P(2), P(16), P(1), C.metalMid); // address bar
  px(g, sx + P(3), sy + P(2), P(8), P(1), C.white); // URL
  px(g, sx + P(3), sy + P(4), P(10), P(1), C.white); // content
  px(g, sx + P(3), sy + P(6), P(12), P(1), C.offWhite);
  px(g, sx + P(3), sy + P(8), P(8), P(1), C.offWhite);

  // Server rack on right
  drawServerRack(g, x + w - P(9), y + P(5));

  // Desks
  drawDeskWithMonitor(g, x + P(4), y + P(22));
  drawDeskWithMonitor(g, x + P(28), y + P(22));

  // Chairs
  drawChair(g, x + P(8), y + P(32));
  drawChair(g, x + P(32), y + P(32));

  // Plants
  drawPlantLarge(g, x + P(2), y + h - P(12));
  drawPlantLarge(g, x + w - P(8), y + h - P(12));
}

export function decorateThinking(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawCarpetFloor(g, x, y, w, h);
  drawTopWall(g, x, y, w, h);

  // Painting on wall
  drawPainting(g, x + P(12), y + P(5));

  // Bookshelf on wall left
  drawNarrowShelf(g, x + P(2), y + P(5));

  // Conference table in center
  drawConferenceTable(g, x + P(6), y + P(22));

  // Chairs around table (4 chairs)
  drawChair(g, x + P(9), y + P(18));   // top-left
  drawChair(g, x + P(19), y + P(18));  // top-right
  drawChair(g, x + P(9), y + P(34));   // bottom-left
  drawChair(g, x + P(19), y + P(34));  // bottom-right

  // Whiteboard on bottom wall area
  drawWhiteboard(g, x + P(4), y + P(44));

  // Plant corner
  drawPlantLarge(g, x + w - P(8), y + h - P(12));
}

export function decorateMessaging(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawCarpetFloor(g, x, y, w, h);
  drawTopWall(g, x, y, w, h);

  // Painting center
  drawPainting(g, x + P(14), y + P(5));

  // Bookshelves flanking painting
  drawNarrowShelf(g, x + P(2), y + P(5));
  drawNarrowShelf(g, x + w - P(12), y + P(5));

  // Sofa
  drawSofa(g, x + P(8), y + P(24));

  // Coffee table in front
  drawSmallTable(g, x + P(10), y + P(36));

  // Coffee cups on table
  drawCoffeeCup(g, x + P(12), y + P(37));

  // Plants
  drawPlantLarge(g, x + P(2), y + h - P(12));
  drawPlantLarge(g, x + w - P(8), y + h - P(12));
}

export function decorateTasksRoom(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawWoodFloor(g, x, y, w, h);
  drawTopWall(g, x, y, w, h);

  // Big whiteboard on wall
  drawWhiteboard(g, x + P(4), y + P(5), true);

  // Sticky notes next to whiteboard
  const noteColors = [C.bookYellow, C.bookPink, C.bookGreen, 0x88bbff, C.bookOrange];
  for (let i = 0; i < 5; i++) {
    const nx = x + P(28) + (i % 3) * P(4);
    const ny = y + P(6) + Math.floor(i / 3) * P(4);
    drawStickyNote(g, nx, ny, noteColors[i]);
  }

  // Two desks
  drawLaptopDesk(g, x + P(6), y + P(26));
  drawDeskWithMonitor(g, x + P(28), y + P(26));

  // Chairs
  drawChair(g, x + P(9), y + P(36));
  drawChair(g, x + P(32), y + P(36));

  // Papers on desk
  drawPapers(g, x + P(42), y + P(28));

  // Plants
  drawPlantSmall(g, x + P(2), y + h - P(8));
  drawPlantLarge(g, x + w - P(8), y + h - P(12));
}

export function decorateIdle(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawTileFloor(g, x, y, w, h);
  drawTopWall(g, x, y, w, h);

  // Vending machine on left
  drawVendingMachine(g, x + P(3), y + P(5));

  // Clock on wall center
  drawClock(g, x + P(18), y + P(5));

  // Fridge on right
  drawFridge(g, x + w - P(9), y + P(5));

  // Counter with coffee machine
  drawCounter(g, x + P(14), y + P(12), P(18));
  drawCoffeeMachine(g, x + P(26), y + P(7));

  // Small table with chairs
  drawSmallTable(g, x + P(12), y + P(32));
  drawChair(g, x + P(8), y + P(38));
  drawChair(g, x + P(20), y + P(38));

  // Coffee cup on table
  drawCoffeeCup(g, x + P(15), y + P(33));

  // Plant
  drawPlantSmall(g, x + P(2), y + h - P(8));
}

export function decorateSpawn(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawDarkFloor(g, x, y, w, h);
  drawTopWall(g, x, y, w, h);

  // Portal effect in center
  drawPortalEffect(g, x + w / 2, y + h / 2 - P(4));

  // Plants flanking portal
  drawPlantLarge(g, x + P(4), y + P(22));
  drawPlantLarge(g, x + w - P(10), y + P(22));

  // Welcome mat at bottom
  const matX = x + P(12), matY = y + h - P(14);
  px(g, matX, matY, P(16), P(5), C.couchSeat);
  px(g, matX + P(1), matY + P(1), P(14), P(3), C.couchCushion);
  px(g, matX + P(1), matY + P(1), P(14), P(1), C.couchHighlight);

  // Small plants at bottom corners
  drawPlantSmall(g, x + P(2), y + h - P(8));
  drawPlantSmall(g, x + w - P(5), y + h - P(8));
}

/** Map zone ID to decorator */
export const ZONE_DECORATORS: Record<string, (g: Graphics, x: number, y: number, w: number, h: number) => void> = {
  files: decorateFiles,
  terminal: decorateTerminal,
  search: decorateSearch,
  web: decorateWeb,
  thinking: decorateThinking,
  messaging: decorateMessaging,
  tasks: decorateTasksRoom,
  idle: decorateIdle,
  spawn: decorateSpawn,
};
