import { Graphics } from 'pixi.js';
import { C, BOOK_ROWS } from './furniture-colors.js';

/**
 * Gather.town-style pixel-art office furniture.
 * IMPORTANT: Decorators draw ONLY furniture — floor is drawn by ZoneRenderer.
 * All coordinates (x, y, w, h) are the interior area (already inset from walls).
 * PX = base pixel unit for chunky pixel art look.
 */
const PX = 4;
const P = (n: number) => n * PX;

function px(g: Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.rect(x, y, w, h).fill(color);
}

/** Semi-transparent fill */
function pxa(g: Graphics, x: number, y: number, w: number, h: number, color: number, alpha: number): void {
  g.rect(x, y, w, h).fill({ color, alpha });
}

/** Drop shadow under furniture */
function shadow(g: Graphics, x: number, y: number, w: number, h: number): void {
  pxa(g, x + 3, y + h, w, 4, 0x000000, 0.12);
}

// ── Furniture Pieces ────────────────────────────────────────

/** White desk with monitor, keyboard, mouse — Gather.town style */
function drawDeskWithMonitor(g: Graphics, x: number, y: number): void {
  const dw = P(16), dh = P(8);
  shadow(g, x, y, dw, dh);
  // Desk surface (WHITE — not wood!)
  px(g, x, y + P(2), dw, dh - P(2), C.deskTop);
  px(g, x + PX, y + P(2), dw - PX * 2, PX, C.deskHighlight);
  // South edge (depth)
  px(g, x, y + dh - PX, dw, PX, C.deskEdge);
  // Monitor
  px(g, x + P(3), y, P(8), P(6), C.screenFrame);
  px(g, x + P(4), y + PX, P(6), P(4), C.screenBlue);
  px(g, x + P(4), y + PX, P(3), P(2), C.screenGlow);
  // Monitor stand
  px(g, x + P(6), y + P(5), P(2), PX, C.metalDark);
  px(g, x + P(5), y + P(6), P(4), PX, C.metalDark);
  // Keyboard
  px(g, x + P(3), y + P(6), P(7), P(2), C.offWhite);
  px(g, x + P(3) + 1, y + P(6) + 1, P(7) - 2, PX - 2, C.white);
  // Mouse
  px(g, x + P(11), y + P(6), P(2), P(2), C.metalMid);
  px(g, x + P(11), y + P(6), P(2), PX, C.metalLight);
}

/** L-shaped desk variant (laptop) */
function drawLaptopDesk(g: Graphics, x: number, y: number): void {
  const dw = P(14), dh = P(7);
  shadow(g, x, y, dw, dh);
  px(g, x, y, dw, dh, C.deskTop);
  px(g, x + PX, y, dw - PX * 2, PX, C.deskHighlight);
  px(g, x, y + dh - PX, dw, PX, C.deskEdge);
  // Laptop screen
  px(g, x + P(3), y + PX, P(7), P(4), C.metalDark);
  px(g, x + P(4), y + P(1) + 2, P(5), P(3) - 2, C.screenBlue);
  px(g, x + P(4), y + P(1) + 2, P(3), P(1), C.screenGlow);
  // Laptop keyboard
  px(g, x + P(3), y + P(5), P(7), P(2), C.metalFrame);
  px(g, x + P(4), y + P(5) + 2, P(5), PX, C.metalMid);
  // Mouse
  px(g, x + P(11), y + P(4), P(2), P(2), C.metalMid);
}

/** Server monitor — CRT green terminal on dark desk */
function drawServerMonitor(g: Graphics, x: number, y: number): void {
  const dw = P(16), dh = P(8);
  shadow(g, x, y, dw, dh);
  px(g, x, y + P(2), dw, dh - P(2), C.metalFrame);
  px(g, x + PX, y + P(3), dw - PX * 2, dh - P(4), C.metalDark);
  px(g, x, y + dh - PX, dw, PX, C.metalMid);
  // CRT monitor
  px(g, x + P(2), y, P(10), P(7), C.screenFrame);
  px(g, x + P(3), y + PX, P(8), P(5), C.screenGreen);
  for (let i = 0; i < P(5); i += PX) {
    px(g, x + P(3), y + PX + i, P(8), 1, C.screenGreenGlow);
  }
  px(g, x + P(3), y + P(1), P(4), 1, C.screenGreenGlow);
  px(g, x + P(3), y + P(2), P(6), 1, C.screenGreenGlow);
  px(g, x + P(3), y + P(3), P(3), 1, C.screenGreenGlow);
  px(g, x + P(6), y + P(6), P(2), PX, C.metalDark);
}

/** Dark office chair — top-down view */
function drawChair(g: Graphics, x: number, y: number): void {
  // Wheel base peeking below seat
  px(g, x + PX, y + P(5), P(3), PX, C.chairWheel);
  // Seat
  px(g, x, y + P(1), P(5), P(4), C.chairSeat);
  px(g, x + PX, y + P(1), P(3), P(4), C.chairHighlight);
  // Backrest
  px(g, x + PX, y, P(3), P(2), C.chairBack);
  px(g, x + P(2), y, PX, PX, C.chairHighlight);
  // Armrests
  px(g, x, y + P(2), PX, P(2), C.chairArm);
  px(g, x + P(4), y + P(2), PX, P(2), C.chairArm);
}

/** Bookshelf — grey-blue frame with colored book spines */
function drawBookshelf(g: Graphics, x: number, y: number, wide: boolean): void {
  const sw = wide ? P(18) : P(11);
  const sh = P(16);
  shadow(g, x, y, sw, sh);
  // Frame (grey-blue, Gather.town style)
  px(g, x, y, sw, sh, C.shelfFrame);
  px(g, x, y, PX, sh, C.shelfEdge);
  px(g, x + sw - PX, y, PX, sh, C.shelfEdge);
  px(g, x + PX, y + PX, sw - PX * 2, sh - PX * 2, C.shelfBack);
  px(g, x, y, sw, PX, C.shelfHighlight);
  // Shelf dividers
  for (let i = 1; i <= 4; i++) {
    const sy = y + i * P(3);
    px(g, x, sy, sw, PX + 1, C.shelfFrame);
    px(g, x + PX, sy, sw - PX * 2, 1, C.shelfHighlight);
  }
  // Books
  for (let shelf = 0; shelf < 4; shelf++) {
    const shelfBottom = y + (shelf + 1) * P(3);
    const colors = BOOK_ROWS[shelf % BOOK_ROWS.length];
    let bx = x + PX + 1;
    let ci = shelf * 3;
    while (bx < x + sw - PX - 1) {
      const bw = PX - 1;
      const bh = P(2) + ((ci * 7 + shelf * 3) % 4);
      px(g, bx, shelfBottom - bh, bw, bh, colors[ci % colors.length]);
      bx += bw + 1;
      ci++;
    }
  }
  px(g, x, y + sh - PX, sw, PX, C.shelfFrame);
}

/** Server rack — dark enclosure with LEDs */
function drawServerRack(g: Graphics, x: number, y: number): void {
  const rw = P(8), rh = P(16);
  shadow(g, x, y, rw, rh);
  px(g, x, y, rw, rh, C.metalFrame);
  px(g, x, y, PX, rh, C.metalDark);
  px(g, x + rw - PX, y, PX, rh, C.metalDark);
  px(g, x, y, rw, PX, C.metalMid);
  for (let i = 0; i < 5; i++) {
    const by = y + P(1) + i * P(3);
    px(g, x + PX, by, rw - PX * 2, P(2), C.metalDark);
    px(g, x + PX, by, rw - PX * 2, PX, C.metalMid);
    px(g, x + P(1), by + PX, PX, PX, i === 2 ? C.ledRed : (i === 4 ? C.ledBlue : C.led));
    px(g, x + P(2), by + PX, rw - P(4), 1, C.metalDark);
  }
  px(g, x, y + rh - PX, rw, PX, C.metalMid);
}

/** Filing cabinet — metal with drawers */
function drawFileCabinet(g: Graphics, x: number, y: number): void {
  const fw = P(6), fh = P(12);
  shadow(g, x, y, fw, fh);
  px(g, x, y, fw, fh, C.metalDark);
  px(g, x, y, PX, fh, C.metalMid);
  px(g, x, y, fw, PX, C.metalLight);
  for (let d = 0; d < 2; d++) {
    const dy = y + PX + d * P(5);
    px(g, x + PX, dy, fw - PX * 2, P(4), C.metalMid);
    px(g, x + PX, dy, fw - PX * 2, PX, C.metalLight);
    px(g, x + P(1), dy, fw - P(3), PX, C.paper);
    px(g, x + P(2), dy + P(2), P(2), PX, C.metalFrame);
    px(g, x + P(2), dy + P(2), P(2), 1, C.metalBright);
  }
  px(g, x, y + fh - PX, fw, PX, C.metalMid);
}

/** Conference table — wood oval */
function drawConferenceTable(g: Graphics, x: number, y: number, w: number, h: number): void {
  shadow(g, x, y, w, h);
  px(g, x + PX, y + h - PX, w, PX, C.medWood);
  px(g, x, y, w, h - PX, C.lightWood);
  px(g, x + PX, y, w - PX * 2, PX, C.paleWood);
  for (let i = 0; i < 4; i++) px(g, x + P(3) + i * P(6), y + PX, 1, h - P(2), C.paleWood);
  px(g, x, y, PX, h - PX, C.medWood);
  px(g, x + w - PX, y, PX, h - PX, C.medWood);
}

/** Round table */
function drawRoundTable(g: Graphics, cx: number, cy: number, r: number): void {
  pxa(g, cx - r / 2 + 4, cy - r / 2 + 4, r, r, 0x000000, 0.12);
  const h = r / 2;
  // Rim
  px(g, cx - h + P(2), cy - h, r - P(4), PX, C.medWood);
  px(g, cx - h + P(2), cy + h - PX, r - P(4), PX, C.medWood);
  px(g, cx - h, cy - h + P(2), PX, r - P(4), C.medWood);
  px(g, cx + h - PX, cy - h + P(2), PX, r - P(4), C.medWood);
  // Inner rim
  px(g, cx - h + PX, cy - h + PX, r - PX * 2, PX, C.medWood);
  px(g, cx - h + PX, cy + h - PX * 2, r - PX * 2, PX, C.medWood);
  px(g, cx - h + PX, cy - h + PX, PX, r - PX * 2, C.medWood);
  px(g, cx + h - PX * 2, cy - h + PX, PX, r - PX * 2, C.medWood);
  // Fill
  px(g, cx - h + P(2), cy - h + PX, r - P(4), r - PX * 2, C.lightWood);
  px(g, cx - h + PX, cy - h + P(2), r - PX * 2, r - P(4), C.lightWood);
  // Shine
  px(g, cx - P(3), cy - P(2), P(6), PX, C.paleWood);
}

/** Whiteboard with marker content */
function drawWhiteboard(g: Graphics, x: number, y: number, w: number, h: number): void {
  shadow(g, x, y, w, h);
  px(g, x, y, w, h, C.whiteboardFrame);
  px(g, x + PX, y + PX, w - PX * 2, h - PX * 2, C.whiteboardSurface);
  // Marker content
  px(g, x + P(2), y + P(2), w * 0.45, PX, C.blue);
  px(g, x + P(2), y + P(4), w * 0.65, PX, C.red);
  px(g, x + P(2), y + P(6), w * 0.35, PX, C.black);
  if (w > P(14)) {
    px(g, x + w / 2, y + P(2), w * 0.3, PX, C.green);
  }
  // Tray
  px(g, x + P(2), y + h, w - P(4), PX, C.metalDark);
  px(g, x + P(3), y + h, PX, PX, C.red);
  px(g, x + P(5), y + h, PX, PX, C.blue);
  px(g, x + P(7), y + h, PX, PX, C.green);
}

/** Sticky note */
function drawStickyNote(g: Graphics, x: number, y: number, color: number): void {
  pxa(g, x + 2, y + 2, P(4), P(4), 0x000000, 0.09);
  px(g, x, y, P(4), P(4), color);
  pxa(g, x, y, P(4), PX, 0xffffff, 0.2);
  px(g, x + PX, y + P(1) + 2, P(2), 1, C.metalDark);
  px(g, x + PX, y + P(2) + 1, P(2) + 2, 1, C.metalDark);
}

/** Sofa — warm orange, Gather.town lounge style */
function drawSofa(g: Graphics, x: number, y: number, w: number): void {
  shadow(g, x, y, w, P(9));
  // Back
  px(g, x, y, w, P(3), C.sofaDark);
  px(g, x + PX, y, w - PX * 2, PX, C.sofaLight);
  // Arms
  px(g, x, y, PX * 2, P(9), C.sofaArm);
  px(g, x + w - PX * 2, y, PX * 2, P(9), C.sofaArm);
  // Seat
  const cushW = Math.floor((w - P(3) - PX * 4) / 2);
  px(g, x + PX * 2, y + P(3), w - PX * 4, P(6), C.sofaBody);
  px(g, x + PX * 2 + cushW, y + P(3), PX, P(6), C.sofaDark);
  px(g, x + PX * 2, y + P(3), cushW, PX, C.sofaHighlight);
  px(g, x + PX * 2 + cushW + PX, y + P(3), cushW - 1, PX, C.sofaHighlight);
  px(g, x, y + P(8), w, PX, C.sofaDark);
}

/** Small/coffee table */
function drawSmallTable(g: Graphics, x: number, y: number, w: number, h: number): void {
  shadow(g, x, y, w, h);
  px(g, x + PX, y + h - PX, w, PX, C.medWood);
  px(g, x, y, w, h - PX, C.lightWood);
  px(g, x + PX, y, w - PX * 2, PX, C.paleWood);
  px(g, x, y, PX, h - PX, C.paleWood);
}

/** Large plant in pot */
function drawPlantLarge(g: Graphics, x: number, y: number): void {
  shadow(g, x + PX, y + P(6), P(5), P(3));
  // Pot
  px(g, x + PX, y + P(6), P(5), P(3), C.potBase);
  px(g, x + PX, y + P(6), P(5), PX, C.potRim);
  px(g, x + P(2), y + P(6), P(3), PX, C.potHighlight);
  px(g, x + PX, y + P(8), P(5), PX, C.potDark);
  // Soil
  px(g, x + P(2), y + P(5), P(3), PX, C.soil);
  // Stems
  px(g, x + P(3), y + P(2), PX, P(4), C.leaf);
  px(g, x + P(1), y + P(3), PX, P(2), C.leaf);
  px(g, x + P(5), y + P(3), PX, P(2), C.leaf);
  // Leaves
  px(g, x + P(2), y, P(3), P(3), C.leaf);
  px(g, x + P(3), y + PX, P(2), P(3), C.leafLight);
  px(g, x, y + P(2), P(2), P(2), C.leafDark);
  px(g, x + P(5), y + P(2), P(2), P(2), C.leafLight);
  px(g, x + P(1), y + P(1), PX, P(2), C.leafDark);
  px(g, x + P(5), y + P(1), PX, P(2), C.leafBright);
  px(g, x + P(3), y, PX, PX, C.leafBright);
}

/** Small desk plant */
function drawPlantSmall(g: Graphics, x: number, y: number): void {
  px(g, x, y + P(3), P(3), P(2), C.potBase);
  px(g, x, y + P(3), P(3), PX, C.potRim);
  px(g, x + PX, y + P(3), PX, PX, C.potHighlight);
  px(g, x, y + P(4), P(3), PX, C.potDark);
  px(g, x + PX, y, PX, P(3), C.leaf);
  px(g, x, y + PX, PX, P(2), C.leafDark);
  px(g, x + P(2), y + PX, PX, P(2), C.leafLight);
  px(g, x + PX, y, PX, PX, C.leafBright);
}

/** Painting / wall art */
function drawPainting(g: Graphics, x: number, y: number, w: number, h: number): void {
  shadow(g, x, y, w, h);
  px(g, x, y, w, h, C.darkWood);
  px(g, x + PX, y + PX, w - PX * 2, h - PX * 2, 0x88aacc);
  px(g, x + w - P(4), y + P(1), P(3), P(3), C.yellow);
  px(g, x + PX, y + h - P(5), P(4), P(3), 0x446688);
  px(g, x + P(3), y + h - P(6), P(3), P(1), 0x557799);
  px(g, x + P(3), y + h - P(6), PX, PX, C.white);
  px(g, x + PX, y + h - P(2), w - PX * 2, PX, C.leaf);
}

/** Wall clock */
function drawClock(g: Graphics, x: number, y: number): void {
  px(g, x + PX, y, P(4), PX, C.offWhite);
  px(g, x, y + PX, P(6), P(4), C.white);
  px(g, x + PX, y + P(5), P(4), PX, C.offWhite);
  px(g, x + PX, y + PX, P(4), P(4), C.cream);
  px(g, x + P(3), y + PX, PX, PX, C.black);
  px(g, x + P(5) - PX, y + P(3), PX, PX, C.black);
  px(g, x + P(3), y + P(5) - PX, PX, PX, C.black);
  px(g, x + PX + 1, y + P(3), PX, PX, C.black);
  px(g, x + P(3), y + P(2), PX, P(2), C.black);
  px(g, x + P(3), y + P(3), PX, PX, C.red);
}

function drawCoffeeCup(g: Graphics, x: number, y: number): void {
  px(g, x, y, P(2), P(3), C.white);
  px(g, x, y + P(2), P(2), PX, C.offWhite);
  px(g, x + P(2), y + PX, PX, PX, C.offWhite);
  px(g, x, y, P(2), PX, 0xaa7744);
}

function drawPapers(g: Graphics, x: number, y: number): void {
  px(g, x + 3, y + 3, P(4), P(5), C.offWhite);
  px(g, x, y, P(4), P(5), C.paper);
  px(g, x + PX, y + P(1), P(2), 1, C.metalDark);
  px(g, x + PX, y + P(2), P(3) - 1, 1, C.metalDark);
  px(g, x + PX, y + P(3), P(2) + 1, 1, C.metalDark);
}

function drawBox(g: Graphics, x: number, y: number, color: number): void {
  shadow(g, x, y, P(4), P(4));
  px(g, x, y, P(4), P(4), color);
  px(g, x, y, P(4), PX, C.paleWood);
  px(g, x, y + P(3), P(4), PX, C.darkWood);
  px(g, x + PX, y + PX, P(2), P(2), C.offWhite);
}

/** Vending machine */
function drawVendingMachine(g: Graphics, x: number, y: number): void {
  const vw = P(9), vh = P(18);
  shadow(g, x, y, vw, vh);
  px(g, x, y, vw, vh, C.vendingBody);
  px(g, x, y, PX, vh, C.metalMid);
  px(g, x, y, vw, PX, C.metalDark);
  px(g, x + PX, y + P(2), vw - PX * 2, P(10), C.vendingGlass);
  px(g, x + PX, y + P(2), vw - PX * 2, PX, C.vendingLight);
  const pColors = [C.bookRed, C.bookOrange, C.bookGreen, C.bookBlue, C.bookYellow, C.bookPink];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      px(g, x + P(2) + col * P(2), y + P(3) + row * P(2), P(1) + 1, P(1) + 1, pColors[(row * 2 + col) % pColors.length]);
    }
    px(g, x + PX, y + P(4) + row * P(2), vw - PX * 2, 1, C.metalDark);
  }
  px(g, x + PX, y + P(13), vw - PX * 2, P(3), C.metalFrame);
  px(g, x + vw - P(2), y + P(14), PX, PX, C.ledRed);
  px(g, x + vw - P(2), y + P(15), PX, PX, C.green);
  px(g, x, y + vh - PX, vw, PX, C.metalDark);
}

/** Fridge */
function drawFridge(g: Graphics, x: number, y: number): void {
  const fw = P(7), fh = P(16);
  shadow(g, x, y, fw, fh);
  px(g, x, y, fw, fh, C.fridgeBody);
  px(g, x, y, fw, PX, C.metalShine);
  px(g, x, y, PX, fh, C.fridgeLight);
  px(g, x + PX, y + PX, fw - PX * 2, fh - PX * 2, C.fridgeLight);
  px(g, x + PX, y + P(5), fw - PX * 2, PX, C.fridgeDark);
  px(g, x + fw - PX * 2, y + P(2), PX, P(2), C.fridgeHandle);
  px(g, x + fw - PX * 2, y + P(7), PX, P(2), C.fridgeHandle);
  px(g, x, y + fh - PX, fw, PX, C.fridgeDark);
}

/** Coffee machine */
function drawCoffeeMachine(g: Graphics, x: number, y: number): void {
  px(g, x, y, P(5), P(7), C.metalDark);
  px(g, x, y, PX, P(7), C.metalMid);
  px(g, x, y, P(5), PX, C.metalBright);
  px(g, x + P(1), y + PX, P(3), P(3), C.screenBlue);
  px(g, x + P(1), y + PX, P(3), PX, C.screenGlow);
  px(g, x + PX, y + P(4), P(3), P(2), C.metalMid);
  px(g, x + P(1), y + P(4), PX, PX, C.red);
  px(g, x + P(2), y + P(4), PX, PX, C.led);
  px(g, x, y + P(6), P(5), PX, C.metalFrame);
  px(g, x + P(1), y + P(5) + 2, P(2), P(2), C.white);
}

/** Water cooler */
function drawWaterCooler(g: Graphics, x: number, y: number): void {
  px(g, x, y + P(3), P(4), P(6), C.fridgeLight);
  px(g, x, y + P(3), PX, P(6), C.fridgeBody);
  px(g, x, y + P(3), P(4), PX, C.metalShine);
  px(g, x + PX, y, P(2), P(4), C.screenBlue);
  px(g, x + PX, y, P(2), PX, C.screenGlow);
  px(g, x + PX, y + P(5), PX, PX, C.blue);
  px(g, x + P(2), y + P(5), PX, PX, C.red);
  px(g, x, y + P(8), P(4), PX, C.fridgeDark);
}

/** Kitchen counter */
function drawCounter(g: Graphics, x: number, y: number, w: number): void {
  shadow(g, x, y, w, P(9));
  px(g, x, y + P(5), w, P(5), C.deskTop);
  px(g, x, y + P(5), PX, P(5), C.deskHighlight);
  const doorW = P(5);
  for (let dx = 0; dx < w - PX; dx += doorW + 2) {
    px(g, x + dx + 2, y + P(6), doorW - 1, P(3), C.deskEdge);
    px(g, x + dx + P(2), y + P(7), PX, PX, C.metalMid);
  }
  px(g, x, y, w, P(5), C.deskTop);
  px(g, x + PX, y + PX, w - PX * 2, P(3), C.deskHighlight);
  px(g, x, y, w, PX, C.white);
  px(g, x, y + P(5) - PX, w, PX, C.deskEdge);
}

/** Kanban board */
function drawKanbanBoard(g: Graphics, x: number, y: number, w: number, h: number): void {
  shadow(g, x, y, w, h);
  px(g, x, y, w, h, C.whiteboardFrame);
  px(g, x + PX, y + PX, w - PX * 2, h - PX * 2, C.whiteboardSurface);
  const colW = Math.floor((w - P(5)) / 3);
  const headers = [C.bookRed, C.bookYellow, C.bookGreen];
  for (let i = 0; i < 3; i++) {
    const colX = x + P(2) + i * (colW + PX);
    px(g, colX, y + P(2), colW, P(2), headers[i]);
    px(g, colX, y + P(2), colW, PX, 0xeeeeee);
    const cardColors = [C.stickyYellow, C.stickyBlue, C.stickyPink, C.stickyGreen, C.stickyOrange, C.stickyPurple];
    const numCards = i === 0 ? 3 : i === 1 ? 2 : 1;
    for (let j = 0; j < numCards; j++) {
      px(g, colX + 2, y + P(5) + j * (P(3) + 2), colW - 4, P(2), cardColors[(i + j * 2) % cardColors.length]);
      px(g, colX + 2, y + P(5) + j * (P(3) + 2), colW - 4, 1, 0xeeeeee);
      px(g, colX + PX, y + P(5) + j * (P(3) + 2) + PX + 1, colW - PX * 2, 1, C.metalDark);
    }
  }
}

/** Globe/network display screen */
function drawGlobeScreen(g: Graphics, x: number, y: number): void {
  const sw = P(22), sh = P(15);
  shadow(g, x, y, sw, sh);
  px(g, x, y, sw, sh, C.screenFrame);
  px(g, x, y, sw, PX, C.metalMid);
  px(g, x + PX, y + PX, sw - PX * 2, sh - PX * 2, C.screenDark);
  px(g, x + P(2), y + P(2), sw - P(4), sh - P(4), C.screenBlue);
  // Globe
  const gcx = x + sw / 2, gcy = y + sh / 2;
  px(g, gcx - P(3), gcy - P(3), P(6), P(6), 0x1166bb);
  px(g, gcx - P(2), gcy - P(1), P(3), P(2), C.leafDark);
  px(g, gcx + P(1), gcy, P(2), P(1), C.leaf);
  // Orbit lines
  px(g, x + P(2), y + P(2), sw - P(4), 1, 0x4488cc);
  px(g, x + P(2), y + sh - P(3), sw - P(4), 1, 0x4488cc);
  // Dots
  px(g, x + P(4), y + P(4), PX, PX, C.led);
  px(g, x + sw - P(6), y + P(4), PX, PX, C.ledRed);
  // Stand
  px(g, x + sw / 2 - P(1), y + sh, P(2), PX, C.metalDark);
  px(g, x + sw / 2 - P(2), y + sh + PX, P(4), PX, C.metalDark);
}

/** Portal swirl */
function drawPortalEffect(g: Graphics, cx: number, cy: number): void {
  // Outer
  px(g, cx - P(7), cy - P(1), P(14), P(2), C.portalDeep);
  px(g, cx - P(1), cy - P(7), P(2), P(14), C.portalDeep);
  px(g, cx - P(5), cy - P(6), P(10), PX, C.portalMid);
  px(g, cx - P(6), cy - P(5), PX, P(10), C.portalMid);
  px(g, cx - P(5), cy + P(5), P(10), PX, C.portalMid);
  px(g, cx + P(5), cy - P(5), PX, P(10), C.portalMid);
  // Middle
  px(g, cx - P(4), cy - P(5), P(8), PX, C.portalLight);
  px(g, cx - P(5), cy - P(4), PX, P(8), C.portalLight);
  px(g, cx - P(4), cy + P(4), P(8), PX, C.portalLight);
  px(g, cx + P(4), cy - P(4), PX, P(8), C.portalLight);
  // Inner
  px(g, cx - P(3), cy - P(3), P(6), P(6), C.portalDeep);
  px(g, cx - P(2), cy - P(2), P(4), P(4), C.portalMid);
  // Core
  px(g, cx - P(1), cy - P(1), P(2), P(2), C.portalGlow);
  // Sparkles
  px(g, cx - P(4), cy, PX, PX, C.portalGlow);
  px(g, cx + P(3), cy - P(1), PX, PX, C.portalGlow);
  px(g, cx, cy + P(3), PX, PX, C.portalGlow);
}

// ── Room Decorator Functions (furniture only — no floor) ────

function decorateSearch(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawBookshelf(g, x + P(2), y + P(4), true);
  drawBookshelf(g, x + P(22), y + P(4), true);
  drawBookshelf(g, x + P(42), y + P(4), true);
  drawBookshelf(g, x + P(62), y + P(4), false);

  drawBookshelf(g, x + P(2), y + P(23), false);
  drawBookshelf(g, x + P(2), y + P(42), false);

  drawSmallTable(g, x + P(20), y + P(33), P(14), P(7));
  drawChair(g, x + P(24), y + P(42));
  drawChair(g, x + P(24), y + P(27));
  drawPapers(g, x + P(22), y + P(34));
  drawCoffeeCup(g, x + P(30), y + P(34));

  drawSmallTable(g, x + P(44), y + P(33), P(14), P(7));
  drawChair(g, x + P(48), y + P(42));
  drawChair(g, x + P(48), y + P(27));
  drawPapers(g, x + P(46), y + P(35));

  drawPlantLarge(g, x + P(2), y + h - P(12));
  drawPlantLarge(g, x + w - P(9), y + P(22));
  drawPlantSmall(g, x + w - P(6), y + h - P(8));

  drawFileCabinet(g, x + w - P(8), y + h - P(15));
  drawFileCabinet(g, x + w - P(15), y + h - P(15));
}

function decorateTerminal(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawServerRack(g, x + P(2), y + P(4));
  drawServerRack(g, x + P(13), y + P(4));
  drawServerRack(g, x + P(24), y + P(4));

  drawServerRack(g, x + w - P(10), y + P(25));
  drawServerRack(g, x + w - P(10), y + P(45));

  drawServerMonitor(g, x + P(2), y + P(25));
  drawChair(g, x + P(6), y + P(37));

  drawServerMonitor(g, x + P(2), y + P(47));
  drawChair(g, x + P(6), y + P(59));

  // Cable trays
  px(g, x + P(11), y + P(22), PX, h - P(24), C.metalFrame);
  px(g, x + P(22), y + P(22), PX, h - P(24), C.metalFrame);

  // Status panel
  px(g, x + P(36), y + P(6), P(7), P(12), C.metalFrame);
  px(g, x + P(37), y + P(7), PX, PX, C.led);
  px(g, x + P(39), y + P(7), PX, PX, C.led);
  px(g, x + P(37), y + P(9), PX, PX, C.ledRed);
  px(g, x + P(39), y + P(9), PX, PX, C.led);
  px(g, x + P(37), y + P(11), PX, PX, C.ledBlue);
  px(g, x + P(39), y + P(11), PX, PX, C.ledYellow);
}

function decorateWeb(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawGlobeScreen(g, x + P(2), y + P(4));
  drawServerRack(g, x + w - P(10), y + P(4));

  drawDeskWithMonitor(g, x + P(2), y + P(25));
  drawChair(g, x + P(6), y + P(37));

  drawDeskWithMonitor(g, x + P(26), y + P(25));
  drawChair(g, x + P(30), y + P(37));

  drawSmallTable(g, x + P(12), y + P(49), P(16), P(6));
  px(g, x + P(14), y + P(50), P(10), P(3), C.metalDark);
  px(g, x + P(14), y + P(50), P(10), PX, C.metalMid);
  for (let i = 0; i < 6; i++) {
    px(g, x + P(15) + i * P(1) + 2, y + P(51) + 2, PX - 1, PX - 1, i < 5 ? C.led : C.ledRed);
  }

  drawPlantLarge(g, x + P(2), y + h - P(13));
  drawPlantSmall(g, x + w - P(5), y + h - P(9));
}

function decorateFiles(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawFileCabinet(g, x + P(2), y + P(4));
  drawFileCabinet(g, x + P(10), y + P(4));
  drawFileCabinet(g, x + P(18), y + P(4));
  drawFileCabinet(g, x + P(26), y + P(4));

  drawBookshelf(g, x + P(2), y + P(19), true);

  drawDeskWithMonitor(g, x + P(26), y + P(23));
  drawChair(g, x + P(30), y + P(35));

  drawBox(g, x + P(2), y + P(39), C.paleWood);
  drawBox(g, x + P(8), y + P(41), C.medWood);
  drawBox(g, x + P(2), y + P(45), C.wood);

  drawPapers(g, x + P(38), y + P(6));
  drawPapers(g, x + P(28), y + P(25));

  drawPlantSmall(g, x + w - P(5), y + h - P(9));
  drawPlantLarge(g, x + w - P(9), y + P(19));
}

function decorateThinking(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawRoundTable(g, x + w / 2, y + h / 2 - P(2), P(20));

  drawChair(g, x + w / 2 - P(14), y + h / 2 - P(13));
  drawChair(g, x + w / 2 + P(9), y + h / 2 - P(13));
  drawChair(g, x + w / 2 - P(18), y + h / 2 - P(3));
  drawChair(g, x + w / 2 + P(14), y + h / 2 - P(3));
  drawChair(g, x + w / 2 - P(14), y + h / 2 + P(8));
  drawChair(g, x + w / 2 + P(9), y + h / 2 + P(8));

  drawWhiteboard(g, x + P(4), y + P(4), P(26), P(14));
  drawWhiteboard(g, x + P(34), y + P(4), P(22), P(14));
  drawPainting(g, x + w - P(16), y + P(4), P(12), P(8));

  drawPapers(g, x + w / 2 - P(5), y + h / 2 - P(4));
  drawCoffeeCup(g, x + w / 2 + P(3), y + h / 2 - P(2));

  drawPlantLarge(g, x + P(2), y + h - P(14));
  drawPlantLarge(g, x + w - P(9), y + h - P(14));
}

function decorateMessaging(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawPainting(g, x + P(10), y + P(4), P(16), P(9));
  drawBookshelf(g, x + P(2), y + P(4), false);

  drawSofa(g, x + P(3), y + P(19), P(18));

  drawSmallTable(g, x + P(5), y + P(31), P(14), P(6));
  drawCoffeeCup(g, x + P(9), y + P(32));
  drawCoffeeCup(g, x + P(14), y + P(32));
  drawPapers(g, x + P(7), y + P(33));

  drawSofa(g, x + P(26), y + P(23), P(12));

  drawSmallTable(g, x + P(28), y + P(37), P(8), P(5));
  drawCoffeeCup(g, x + P(30), y + P(38));

  drawPlantLarge(g, x + P(2), y + h - P(13));
  drawPlantSmall(g, x + w - P(5), y + P(4));
  drawClock(g, x + w - P(9), y + P(5));
}

function decorateSpawn(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawPortalEffect(g, x + w / 2, y + h / 2 - P(4));

  // Welcome mat
  const matX = x + (w - P(16)) / 2;
  const matY = y + h - P(14);
  px(g, matX, matY, P(16), P(5), C.sofaBody);
  px(g, matX + PX, matY + PX, P(14), P(3), C.sofaHighlight);
  px(g, matX, matY, P(16), PX, C.sofaDark);
  px(g, matX, matY + P(4), P(16), PX, C.sofaDark);

  drawPlantSmall(g, x + P(2), y + P(7));
  drawPlantSmall(g, x + w - P(5), y + P(7));
  drawPlantLarge(g, x + P(2), y + h - P(14));
  drawPlantLarge(g, x + w - P(9), y + h - P(14));

  for (let i = 0; i < 4; i++) {
    px(g, x + P(4) + i * P(7), y + P(5), PX, PX, C.portalGlow);
  }
}

function decorateIdle(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawCounter(g, x + P(2), y + P(4), P(30));
  drawCoffeeMachine(g, x + P(4), y + P(-1));
  drawCoffeeCup(g, x + P(10), y + P(1));

  drawFridge(g, x + P(34), y + P(4));
  drawVendingMachine(g, x + w - P(11), y + P(4));
  drawWaterCooler(g, x + P(45), y + P(4));

  drawRoundTable(g, x + P(18), y + P(33), P(11));
  drawChair(g, x + P(10), y + P(29));
  drawChair(g, x + P(22), y + P(29));
  drawChair(g, x + P(10), y + P(38));
  drawChair(g, x + P(22), y + P(38));
  drawCoffeeCup(g, x + P(17), y + P(32));

  drawRoundTable(g, x + P(48), y + P(33), P(11));
  drawChair(g, x + P(40), y + P(29));
  drawChair(g, x + P(52), y + P(29));
  drawChair(g, x + P(40), y + P(38));
  drawChair(g, x + P(52), y + P(38));
  drawCoffeeCup(g, x + P(47), y + P(32));

  drawClock(g, x + P(58), y + P(5));
  drawPlantSmall(g, x + P(2), y + h - P(9));
  drawPlantSmall(g, x + w - P(5), y + h - P(9));
}

function decorateTasks(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawKanbanBoard(g, x + P(2), y + P(4), P(32), P(20));

  const noteColors = [C.stickyYellow, C.stickyPink, C.stickyGreen, C.stickyBlue, C.stickyOrange, C.stickyPurple];
  for (let i = 0; i < 6; i++) {
    drawStickyNote(g, x + P(38) + (i % 3) * P(5), y + P(4) + Math.floor(i / 3) * P(5), noteColors[i]);
  }

  drawLaptopDesk(g, x + P(4), y + P(31));
  drawChair(g, x + P(7), y + P(42));

  drawDeskWithMonitor(g, x + P(30), y + P(31));
  drawChair(g, x + P(34), y + P(42));

  drawPapers(g, x + P(46), y + P(33));

  drawWhiteboard(g, x + P(52), y + P(4), P(14), P(12));

  drawPlantLarge(g, x + w - P(9), y + h - P(14));
  drawPlantSmall(g, x + P(2), y + h - P(9));
}

/** Map zone ID to decorator */
export const ZONE_DECORATORS: Record<string, (g: Graphics, x: number, y: number, w: number, h: number) => void> = {
  search: decorateSearch,
  terminal: decorateTerminal,
  web: decorateWeb,
  files: decorateFiles,
  thinking: decorateThinking,
  messaging: decorateMessaging,
  spawn: decorateSpawn,
  idle: decorateIdle,
  tasks: decorateTasks,
};
