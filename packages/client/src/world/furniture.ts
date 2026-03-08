import { Graphics } from 'pixi.js';
import { C, BOOK_ROWS } from './furniture-colors.js';

/**
 * Pixel-art office furniture and room decoration module.
 * Each room's furniture reflects its function.
 * PX = base pixel unit for chunky pixel art look.
 */
const PX = 4;
const P = (n: number) => n * PX;

// ── Drawing Helpers ─────────────────────────────────────────

function px(g: Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.rect(x, y, w, h).fill(color);
}

/**
 * Draws a wood table-top surface: outer frame, filled interior, and a highlight
 * line along the top edge. Used by desks and small tables.
 */
function drawWoodTableTop(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.medWood);
  px(g, x + P(1), y + P(1), w - P(2), h - P(2), C.wood);
  px(g, x + P(1), y + P(1), w - P(2), 1, C.lightWood);
}

// ── Floor Patterns ──────────────────────────────────────────

function drawWoodFloor(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.woodFloor);
  const plankH = P(4);
  let row = 0;
  for (let py = 0; py < h; py += plankH) {
    const ph = Math.min(plankH, h - py);
    if (row % 2 === 1) px(g, x, y + py, w, ph, C.woodFloorAlt);
    px(g, x, y + py, w, 1, C.plankLine);
    const offset = (row % 2) * P(7);
    for (let px2 = offset; px2 < w; px2 += P(14)) {
      px(g, x + px2, y + py, 1, ph, C.woodFloorDark);
    }
    row++;
  }
}

function drawTileFloor(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.tileBase);
  const tileSize = P(6);
  for (let ty = 0; ty < h; ty += tileSize) {
    for (let tx = 0; tx < w; tx += tileSize) {
      const odd = ((tx / tileSize + ty / tileSize) % 2) === 0;
      if (odd) px(g, x + tx, y + ty, tileSize, tileSize, C.tileAlt);
      px(g, x + tx, y + ty, tileSize, 1, C.tileGrid);
      px(g, x + tx, y + ty, 1, tileSize, C.tileGrid);
      if (!odd) {
        px(g, x + tx + tileSize / 2 - 1, y + ty + tileSize / 2 - 1, 2, 2, C.tileDiamond);
      }
    }
  }
}

function drawDottedCarpet(
  g: Graphics, x: number, y: number, w: number, h: number,
  base: number, dot: number, edge: number, allEdges = true,
): void {
  px(g, x, y, w, h, base);
  for (let py = 0; py < h; py += P(2)) {
    for (let pxx = ((py / P(2)) % 2) * P(2); pxx < w; pxx += P(4)) {
      px(g, x + pxx, y + py, P(1), P(1), dot);
    }
  }
  px(g, x, y, w, P(1), edge);
  px(g, x, y + h - P(1), w, P(1), edge);
  if (allEdges) {
    px(g, x, y, P(1), h, edge);
    px(g, x + w - P(1), y, P(1), h, edge);
  }
}

function drawCarpetFloor(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawDottedCarpet(g, x, y, w, h, C.carpet, C.carpetDot, C.carpetEdge);
}

function drawWarmCarpet(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawDottedCarpet(g, x, y, w, h, C.carpetWarm, C.carpetWarmDot, C.carpetWarmAlt);
}

function drawDarkFloor(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.darkFloor);
  for (let py = 0; py < h; py += P(3)) px(g, x, y + py, w, 1, C.darkFloorLine);
  for (let py = P(1); py < h; py += P(6)) px(g, x, y + py, w, P(3), C.darkFloorAlt);
}

function drawGreenCarpet(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawDottedCarpet(g, x, y, w, h, C.greenFloor, C.greenFloorDot, C.greenFloorAlt, false);
}

// ── Furniture Pieces ────────────────────────────────────────

function drawBookshelf(g: Graphics, x: number, y: number, wide: boolean): void {
  const sw = wide ? P(16) : P(10);
  const sh = P(14);
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
    const colors = BOOK_ROWS[shelf % BOOK_ROWS.length];
    let bx = x + P(1) + 1;
    let ci = shelf * 3;
    while (bx < x + sw - P(2)) {
      const bw = PX - 1;
      const bh = P(2) + ((ci * 3 + shelf) % 3);
      px(g, bx, shelfBottom - bh, bw, bh, colors[ci % colors.length]);
      bx += bw + 1;
      ci++;
    }
  }
  px(g, x, y + sh - P(1), sw, P(1), C.medWood);
}

function drawDeskWithMonitor(g: Graphics, x: number, y: number): void {
  const dw = P(14), dh = P(7);
  drawWoodTableTop(g, x, y, dw, dh);
  px(g, x, y + dh, dw, P(2), C.medWood);
  px(g, x + P(1), y + dh, dw - P(2), P(1), C.darkWood);
  const mx = x + P(4), my = y;
  px(g, mx, my, P(6), P(5), C.screenFrame);
  px(g, mx + P(1), my + P(1), P(4), P(3), C.screenBlue);
  px(g, mx + P(1), my + P(1), P(2), P(1), C.screenGlow);
  px(g, mx + P(2), my + P(5), P(2), P(1), C.screenBody);
  px(g, x + P(3), y + P(5), P(5), P(1), C.metalDark);
}

function drawServerMonitor(g: Graphics, x: number, y: number): void {
  const dw = P(14), dh = P(7);
  px(g, x, y, dw, dh, C.metalDark);
  px(g, x + P(1), y + P(1), dw - P(2), dh - P(2), C.metalFrame);
  const mx = x + P(3), my = y;
  px(g, mx, my, P(8), P(5), C.screenFrame);
  px(g, mx + P(1), my + P(1), P(6), P(3), C.screenGreen);
  px(g, mx + P(1), my + P(1), P(3), P(1), C.screenGreenGlow);
  // Terminal text lines
  px(g, mx + P(2), my + P(2), P(4), 1, C.screenGreenGlow);
  px(g, mx + P(2), my + P(3), P(3), 1, C.screenGreenGlow);
  px(g, mx + P(3), my + P(5), P(2), P(1), C.metalDark);
  px(g, x + P(2), y + P(5), P(6), P(1), C.metalFrame);
}

function drawChair(g: Graphics, x: number, y: number): void {
  px(g, x + P(1), y, P(3), P(1), C.chairBack);
  px(g, x, y + P(1), P(5), P(4), C.chairSeat);
  px(g, x + P(1), y + P(1), P(3), P(3), C.chairBack);
  px(g, x, y + P(1), P(1), P(3), C.chairArm);
  px(g, x + P(4), y + P(1), P(1), P(3), C.chairArm);
}

function drawPlantLarge(g: Graphics, x: number, y: number): void {
  px(g, x + P(1), y + P(5), P(4), P(3), C.potBase);
  px(g, x + P(2), y + P(5), P(2), P(1), C.potRim);
  px(g, x + P(2), y + P(7), P(2), P(1), C.potDark);
  px(g, x + P(1), y + P(4), P(4), P(1), C.soil);
  px(g, x + P(2), y, P(2), P(5), C.leaf);
  px(g, x + P(1), y + P(1), P(1), P(3), C.leafDark);
  px(g, x + P(4), y + P(1), P(1), P(3), C.leafLight);
  px(g, x, y + P(2), P(1), P(2), C.leafDark);
  px(g, x + P(5), y + P(2), P(1), P(2), C.leafBright);
  px(g, x + P(2), y - P(1), P(2), P(1), C.leafLight);
}

function drawPlantSmall(g: Graphics, x: number, y: number): void {
  px(g, x, y + P(3), P(3), P(2), C.potBase);
  px(g, x, y + P(4), P(3), P(1), C.potDark);
  px(g, x + P(1), y, P(1), P(3), C.leaf);
  px(g, x, y + P(1), P(1), P(1), C.leafDark);
  px(g, x + P(2), y + P(1), P(1), P(1), C.leafLight);
}

function drawServerRack(g: Graphics, x: number, y: number): void {
  const rw = P(7), rh = P(14);
  px(g, x, y, rw, rh, C.metalFrame);
  px(g, x, y, rw, P(1), C.metalDark);
  for (let i = 0; i < 4; i++) {
    const sy = y + P(1) + i * P(3);
    px(g, x + P(1), sy, rw - P(2), P(2), C.metalDark);
    px(g, x + P(1), sy, rw - P(2), P(1), C.metalMid);
    px(g, x + P(2), sy + P(1), P(1), P(1), i < 3 ? C.led : C.ledOff);
    px(g, x + rw - P(3), sy + P(1), P(1), P(1), C.led);
    px(g, x + P(3), sy + P(1), P(1), P(1), C.black);
  }
  px(g, x, y + rh - P(1), rw, P(1), C.metalFrame);
}

function drawFileCabinet(g: Graphics, x: number, y: number): void {
  const fw = P(5), fh = P(10);
  px(g, x, y, fw, fh, C.metalDark);
  px(g, x + P(1), y + P(1), fw - P(2), P(3), C.metalMid);
  px(g, x + P(1), y + P(5), fw - P(2), P(3), C.metalMid);
  px(g, x + P(2), y + P(2), P(1), P(1), C.metalFrame);
  px(g, x + P(2), y + P(6), P(1), P(1), C.metalFrame);
  px(g, x + P(1), y + P(1), P(2), P(1), C.paper);
  px(g, x + P(1), y + P(5), P(2), P(1), C.paper);
  px(g, x, y + fh - P(1), fw, P(1), C.metalFrame);
}

function drawConferenceTable(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x + P(1), y + P(1), w, h, C.darkWood);
  px(g, x, y, w, h, C.medWood);
  px(g, x + P(1), y + P(1), w - P(2), h - P(2), C.wood);
  px(g, x + P(2), y + P(2), w - P(4), P(1), C.lightWood);
  px(g, x + P(2), y + P(4), w - P(4), 1, C.lightWood);
}

function drawRoundTable(g: Graphics, cx: number, cy: number, r: number): void {
  // Shadow
  px(g, cx - r / 2 + 3, cy - r / 2 + 3, r, r, C.darkWood);
  // Pixel-art circle approximation: concentric rings getting wider
  const half = r / 2;
  // Outermost ring (edge)
  px(g, cx - half + P(2), cy - half, r - P(4), P(1), C.medWood);
  px(g, cx - half + P(2), cy + half - P(1), r - P(4), P(1), C.medWood);
  px(g, cx - half, cy - half + P(2), P(1), r - P(4), C.medWood);
  px(g, cx + half - P(1), cy - half + P(2), P(1), r - P(4), C.medWood);
  // Second ring
  px(g, cx - half + P(1), cy - half + P(1), r - P(2), P(1), C.medWood);
  px(g, cx - half + P(1), cy + half - P(2), r - P(2), P(1), C.medWood);
  px(g, cx - half + P(1), cy - half + P(1), P(1), r - P(2), C.medWood);
  px(g, cx + half - P(2), cy - half + P(1), P(1), r - P(2), C.medWood);
  // Fill center
  px(g, cx - half + P(2), cy - half + P(1), r - P(4), r - P(2), C.wood);
  px(g, cx - half + P(1), cy - half + P(2), r - P(2), r - P(4), C.wood);
  // Woodgrain shine
  px(g, cx - P(3), cy - P(2), P(5), P(1), C.lightWood);
  px(g, cx - P(2), cy, P(4), 1, C.lightWood);
}

function drawWhiteboard(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.whiteboardFrame);
  px(g, x + P(1), y + P(1), w - P(2), h - P(2), C.whiteboardSurface);
  // Content
  px(g, x + P(2), y + P(2), w * 0.4, P(1), C.blue);
  px(g, x + P(2), y + P(4), w * 0.6, P(1), C.red);
  px(g, x + P(2), y + P(6), w * 0.3, P(1), C.black);
  if (w > P(16)) {
    px(g, x + w / 2, y + P(2), w * 0.3, P(1), C.green);
    px(g, x + w / 2, y + P(4), w * 0.2, P(1), C.blue);
  }
  // Marker tray
  px(g, x + P(2), y + h, w - P(4), P(1), C.metalDark);
  px(g, x + P(3), y + h, P(1), P(1), C.red);
  px(g, x + P(5), y + h, P(1), P(1), C.blue);
}

function drawStickyNote(g: Graphics, x: number, y: number, color: number): void {
  px(g, x, y, P(3), P(3), color);
  px(g, x, y, P(3), 1, 0x000000);
  px(g, x + P(1), y + P(1), P(1), 1, C.metalDark);
}

function drawSofa(g: Graphics, x: number, y: number, w: number): void {
  px(g, x, y, w, P(3), C.couchFrame);
  px(g, x + P(1), y + P(1), w - P(2), P(1), C.couchHighlight);
  px(g, x, y + P(3), w, P(5), C.couchSeat);
  // Cushions
  const cushW = Math.floor((w - P(3)) / 2);
  px(g, x + P(1), y + P(3), cushW, P(4), C.couchCushion);
  px(g, x + P(1), y + P(3), cushW, P(1), C.couchHighlight);
  px(g, x + P(2) + cushW, y + P(3), cushW, P(4), C.couchCushion);
  px(g, x + P(2) + cushW, y + P(3), cushW, P(1), C.couchHighlight);
  px(g, x, y, P(1), P(8), C.couchFrame);
  px(g, x + w - P(1), y, P(1), P(8), C.couchFrame);
}

function drawSmallTable(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawWoodTableTop(g, x, y, w, h);
}

function drawVendingMachine(g: Graphics, x: number, y: number): void {
  const vw = P(8), vh = P(16);
  px(g, x, y, vw, vh, C.vendingBody);
  px(g, x, y, vw, P(1), C.metalDark);
  px(g, x + P(1), y + P(2), vw - P(2), P(9), C.vendingGlass);
  const pColors = [C.bookRed, C.bookOrange, C.bookGreen, C.bookBlue, C.bookYellow];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      px(g, x + P(2) + col * P(2), y + P(3) + row * P(2), P(1), P(1), pColors[(row + col) % pColors.length]);
    }
    px(g, x + P(1), y + P(4) + row * P(2), vw - P(2), 1, C.metalDark);
  }
  px(g, x + P(1), y + P(12), vw - P(2), P(3), C.black);
  px(g, x + vw - P(2), y + P(4), P(1), P(1), C.red);
  px(g, x + vw - P(2), y + P(6), P(1), P(1), C.green);
}

function drawFridge(g: Graphics, x: number, y: number): void {
  const fw = P(6), fh = P(14);
  px(g, x, y, fw, fh, C.fridgeBody);
  px(g, x + P(1), y + P(1), fw - P(2), fh - P(2), C.fridgeLight);
  px(g, x + P(1), y + P(6), fw - P(2), P(1), C.fridgeDark);
  px(g, x + fw - P(2), y + P(3), P(1), P(2), C.metalMid);
  px(g, x + fw - P(2), y + P(8), P(1), P(2), C.metalMid);
  px(g, x, y, fw, P(1), C.metalLight);
  px(g, x, y + fh - P(1), fw, P(1), C.fridgeDark);
}

function drawCoffeeMachine(g: Graphics, x: number, y: number): void {
  px(g, x, y, P(4), P(6), C.metalDark);
  px(g, x + P(1), y, P(2), P(1), C.metalBright);
  px(g, x + P(1), y + P(3), P(2), P(1), C.red);
  px(g, x, y + P(5), P(4), P(1), C.metalFrame);
  px(g, x + P(1), y + P(4), P(2), P(2), C.white);
}

function drawWaterCooler(g: Graphics, x: number, y: number): void {
  px(g, x + P(1), y, P(2), P(3), C.screenBlue);
  px(g, x + P(1), y, P(2), P(1), C.screenGlow);
  px(g, x, y + P(3), P(4), P(5), C.metalLight);
  px(g, x + P(1), y + P(5), P(1), P(1), C.blue);
  px(g, x + P(2), y + P(5), P(1), P(1), C.red);
  px(g, x, y + P(7), P(4), P(1), C.metalDark);
}

function drawCounter(g: Graphics, x: number, y: number, w: number): void {
  px(g, x, y, w, P(5), C.medWood);
  px(g, x + P(1), y + P(1), w - P(2), P(3), C.lightWood);
  px(g, x, y, w, P(1), C.paleWood);
  px(g, x, y + P(5), w, P(4), C.medWood);
  const doorW = P(4);
  for (let dx = 0; dx < w - P(1); dx += doorW + 2) {
    px(g, x + dx + 1, y + P(6), doorW, P(2), C.wood);
    px(g, x + dx + P(2), y + P(7), P(1), P(1), C.darkWood);
  }
}

function drawPainting(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.paleWood);
  px(g, x + P(1), y + P(1), w - P(2), h - P(2), 0x6699cc);
  // Mountains
  px(g, x + P(1), y + h - P(4), P(3), P(2), C.leafDark);
  px(g, x + P(2), y + h - P(5), P(2), P(1), C.leaf);
  // Ground
  px(g, x + P(1), y + h - P(2), w - P(2), P(1), C.leafDark);
  // Sun
  px(g, x + w - P(3), y + P(1), P(2), P(2), C.yellow);
}

function drawClock(g: Graphics, x: number, y: number): void {
  px(g, x + P(1), y, P(4), P(1), C.offWhite);
  px(g, x, y + P(1), P(6), P(4), C.white);
  px(g, x + P(1), y + P(5), P(4), P(1), C.offWhite);
  px(g, x + P(1), y + P(1), P(4), P(4), C.cream);
  px(g, x + P(3), y + P(1), P(1), P(1), C.black);
  px(g, x + P(4), y + P(3), P(1), P(1), C.black);
  px(g, x + P(3), y + P(4), P(1), P(1), C.black);
  px(g, x + P(1), y + P(3), P(1), P(1), C.black);
  px(g, x + P(3), y + P(2), P(1), P(2), C.black);
  px(g, x + P(3), y + P(3), P(1), P(1), C.red);
}

function drawCoffeeCup(g: Graphics, x: number, y: number): void {
  px(g, x, y, P(2), P(2), C.white);
  px(g, x + P(2), y + P(1), P(1), P(1), C.offWhite);
}

function drawPapers(g: Graphics, x: number, y: number): void {
  px(g, x + 2, y + 2, P(3), P(4), C.offWhite);
  px(g, x, y, P(3), P(4), C.paper);
  px(g, x + PX, y + PX, P(1), 1, C.metalDark);
  px(g, x + PX, y + P(2), P(2), 1, C.metalDark);
}

function drawBox(g: Graphics, x: number, y: number, color: number): void {
  px(g, x, y, P(4), P(3), color);
  px(g, x, y, P(4), P(1), C.paleWood);
  px(g, x + P(1), y + P(1), P(2), P(1), C.darkWood);
}

function drawPortalEffect(g: Graphics, cx: number, cy: number): void {
  px(g, cx - P(6), cy - P(1), P(12), P(2), C.portalDeep);
  px(g, cx - P(1), cy - P(6), P(2), P(12), C.portalDeep);
  px(g, cx - P(4), cy - P(5), P(8), P(1), C.portalMid);
  px(g, cx - P(5), cy - P(4), P(10), P(1), C.portalLight);
  px(g, cx - P(6), cy - P(3), P(1), P(6), C.portalMid);
  px(g, cx + P(5), cy - P(3), P(1), P(6), C.portalMid);
  px(g, cx - P(5), cy - P(3), P(1), P(6), C.portalLight);
  px(g, cx + P(4), cy - P(3), P(1), P(6), C.portalLight);
  px(g, cx - P(5), cy + P(3), P(10), P(1), C.portalLight);
  px(g, cx - P(4), cy + P(4), P(8), P(1), C.portalMid);
  px(g, cx - P(3), cy - P(3), P(6), P(6), C.portalDeep);
  px(g, cx - P(2), cy - P(2), P(4), P(4), C.portalMid);
  px(g, cx - P(1), cy - P(1), P(2), P(2), C.portalGlow);
  px(g, cx - P(3), cy, P(1), P(1), C.portalGlow);
  px(g, cx + P(2), cy - P(1), P(1), P(1), C.portalGlow);
  px(g, cx, cy + P(2), P(1), P(1), C.portalGlow);
}

function drawLaptopDesk(g: Graphics, x: number, y: number): void {
  const dw = P(12), dh = P(6);
  drawWoodTableTop(g, x, y, dw, dh);
  px(g, x, y + dh, dw, P(2), C.medWood);
  const lx = x + P(3), ly = y + P(1);
  px(g, lx, ly, P(6), P(4), C.metalDark);
  px(g, lx + P(1), ly + P(1), P(4), P(2), C.screenBlue);
  px(g, lx + P(1), ly + P(1), P(2), P(1), C.screenGlow);
}

// Kanban board (vertical board with colored cards)
function drawKanbanBoard(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.whiteboardFrame);
  px(g, x + P(1), y + P(1), w - P(2), h - P(2), C.whiteboardSurface);
  // 3 columns
  const colW = Math.floor((w - P(4)) / 3);
  const headers = [C.bookRed, C.bookYellow, C.bookGreen];
  const labels = ['TODO', 'WIP', 'DONE'];
  for (let i = 0; i < 3; i++) {
    const cx = x + P(2) + i * (colW + P(1));
    // Column header
    px(g, cx, y + P(2), colW, P(2), headers[i]);
    // Cards
    const cardColors = [C.stickyYellow, C.stickyBlue, C.stickyPink, C.stickyGreen];
    const numCards = i === 0 ? 3 : i === 1 ? 2 : 1;
    for (let j = 0; j < numCards; j++) {
      px(g, cx + 2, y + P(5) + j * P(3), colW - 4, P(2), cardColors[(i + j) % cardColors.length]);
      px(g, cx + P(1), y + P(5) + j * P(3) + 2, colW - P(3), 1, C.metalDark);
    }
  }
}

// Network/globe decoration
function drawGlobeScreen(g: Graphics, x: number, y: number): void {
  const sw = P(20), sh = P(14);
  px(g, x, y, sw, sh, C.screenFrame);
  px(g, x + P(1), y + P(1), sw - P(2), sh - P(2), C.screenDark);
  px(g, x + P(2), y + P(2), sw - P(4), sh - P(4), C.screenBlue);
  // Globe-like circle
  const cx = x + sw / 2, cy = y + sh / 2;
  px(g, cx - P(3), cy - P(2), P(6), P(4), 0x2277aa);
  px(g, cx - P(2), cy - P(3), P(4), P(1), 0x2277aa);
  px(g, cx - P(2), cy + P(2), P(4), P(1), 0x2277aa);
  // Continents (green blobs)
  px(g, cx - P(2), cy - P(1), P(2), P(2), C.leafDark);
  px(g, cx + P(1), cy, P(2), P(1), C.leafDark);
  px(g, cx - P(1), cy + P(1), P(1), P(1), C.leaf);
  // Orbit lines
  px(g, x + P(2), y + P(2), sw - P(4), 1, 0x88bbdd);
  px(g, x + P(2), y + sh - P(3), sw - P(4), 1, 0x88bbdd);
}

// ── Room Decorator Functions ────────────────────────────────

/** Search/Library — 440×400 — Big room with bookshelves, reading areas */
function decorateSearch(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawWoodFloor(g, x, y, w, h);

  // Long row of bookshelves along top wall (pushed down for label)
  drawBookshelf(g, x + P(2), y + P(7), true);
  drawBookshelf(g, x + P(20), y + P(7), true);
  drawBookshelf(g, x + P(38), y + P(7), true);
  drawBookshelf(g, x + P(56), y + P(7), false);

  // Side shelves on left
  drawBookshelf(g, x + P(2), y + P(23), false);
  drawBookshelf(g, x + P(2), y + P(39), false);

  // Reading table center-left
  drawSmallTable(g, x + P(18), y + P(35), P(12), P(6));
  drawChair(g, x + P(21), y + P(43));
  drawChair(g, x + P(21), y + P(29));

  // Second reading area center-right
  drawSmallTable(g, x + P(40), y + P(35), P(12), P(6));
  drawChair(g, x + P(43), y + P(43));
  drawChair(g, x + P(43), y + P(29));

  // Papers and books scattered on tables
  drawPapers(g, x + P(20), y + P(36));
  drawPapers(g, x + P(42), y + P(37));
  drawCoffeeCup(g, x + P(50), y + P(36));

  // Large plants
  drawPlantLarge(g, x + P(2), y + h - P(12));
  drawPlantLarge(g, x + w - P(8), y + P(23));

  // Filing cabinet in corner
  drawFileCabinet(g, x + w - P(7), y + h - P(14));
  drawFileCabinet(g, x + w - P(13), y + h - P(14));

  // Globe on a stand (research theme)
  const gx = x + P(60), gy = y + P(50);
  px(g, gx, gy, P(6), P(6), C.leafDark);
  px(g, gx + P(1), gy + P(1), P(4), P(4), 0x4488aa);
  px(g, gx + P(2), gy + P(2), P(2), P(2), C.leaf);
  px(g, gx + P(2), gy + P(6), P(2), P(2), C.darkWood);
}

/** Terminal — 280×400 — Server room with racks and monitors */
function decorateTerminal(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawDarkFloor(g, x, y, w, h);

  // Server racks along top
  drawServerRack(g, x + P(2), y + P(7));
  drawServerRack(g, x + P(12), y + P(7));
  drawServerRack(g, x + P(22), y + P(7));

  // More racks on right wall
  drawServerRack(g, x + w - P(9), y + P(25));
  drawServerRack(g, x + w - P(9), y + P(43));

  // Monitoring desks (green terminal screens)
  drawServerMonitor(g, x + P(4), y + P(29));
  drawChair(g, x + P(8), y + P(39));

  drawServerMonitor(g, x + P(4), y + P(49));
  drawChair(g, x + P(8), y + P(59));

  // Cable trays (lines on floor)
  px(g, x + P(10), y + P(23), P(1), h - P(25), C.metalDark);
  px(g, x + P(20), y + P(23), P(1), h - P(25), C.metalDark);

  // Warning stripes near racks
  for (let i = 0; i < 3; i++) {
    px(g, x + P(2) + i * P(3), y + h - P(4), P(2), P(1), C.bookYellow);
  }

  // Status LEDs panel
  px(g, x + P(34), y + P(9), P(6), P(10), C.metalFrame);
  px(g, x + P(35), y + P(10), P(1), P(1), C.led);
  px(g, x + P(37), y + P(10), P(1), P(1), C.led);
  px(g, x + P(35), y + P(12), P(1), P(1), C.ledRed);
  px(g, x + P(37), y + P(12), P(1), P(1), C.led);
  px(g, x + P(35), y + P(14), P(1), P(1), C.ledBlue);
  px(g, x + P(37), y + P(14), P(1), P(1), C.led);
}

/** Web Lab — 340×400 — Tech lab with big screens and network gear */
function decorateWeb(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawCarpetFloor(g, x, y, w, h);

  // Large globe/network screen on wall
  drawGlobeScreen(g, x + P(4), y + P(7));

  // Server rack
  drawServerRack(g, x + w - P(9), y + P(7));

  // Workstations
  drawDeskWithMonitor(g, x + P(4), y + P(27));
  drawChair(g, x + P(8), y + P(37));

  drawDeskWithMonitor(g, x + P(28), y + P(27));
  drawChair(g, x + P(32), y + P(37));

  // Network hub table
  drawSmallTable(g, x + P(14), y + P(51), P(14), P(5));
  // Network device on table
  px(g, x + P(16), y + P(52), P(8), P(3), C.metalDark);
  px(g, x + P(17), y + P(53), P(1), P(1), C.led);
  px(g, x + P(19), y + P(53), P(1), P(1), C.led);
  px(g, x + P(21), y + P(53), P(1), P(1), C.ledBlue);

  // Plants
  drawPlantLarge(g, x + P(2), y + h - P(12));
  drawPlantSmall(g, x + w - P(5), y + h - P(8));

  // Cables along wall
  px(g, x + w - P(2), y + P(23), P(1), h - P(27), C.metalDark);
}

/** Files/Archive — 320×320 — Filing room with cabinets and storage */
function decorateFiles(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawWoodFloor(g, x, y, w, h);

  // Row of filing cabinets along top
  drawFileCabinet(g, x + P(2), y + P(7));
  drawFileCabinet(g, x + P(9), y + P(7));
  drawFileCabinet(g, x + P(16), y + P(7));
  drawFileCabinet(g, x + P(23), y + P(7));

  // Bookshelves on left
  drawBookshelf(g, x + P(2), y + P(21), true);

  // Desk for sorting files
  drawDeskWithMonitor(g, x + P(24), y + P(25));
  drawChair(g, x + P(28), y + P(35));

  // Storage boxes
  drawBox(g, x + P(2), y + P(39), C.paleWood);
  drawBox(g, x + P(8), y + P(41), C.medWood);
  drawBox(g, x + P(2), y + P(43), C.lightWood);

  // Papers around
  drawPapers(g, x + P(38), y + P(9));
  drawPapers(g, x + P(26), y + P(27));

  // Plant
  drawPlantSmall(g, x + w - P(5), y + h - P(8));
  drawPlantLarge(g, x + w - P(8), y + P(21));
}

/** Thinking/Meeting Room — 440×320 — Conference room with round table */
function decorateThinking(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawWarmCarpet(g, x, y, w, h);

  // Large round conference table in center (shifted down slightly)
  drawRoundTable(g, x + w / 2, y + h / 2 - P(1), P(18));

  // Chairs around the table (6 chairs)
  drawChair(g, x + w / 2 - P(12), y + h / 2 - P(11));  // top-left
  drawChair(g, x + w / 2 + P(8), y + h / 2 - P(11));   // top-right
  drawChair(g, x + w / 2 - P(16), y + h / 2 - P(1));   // left
  drawChair(g, x + w / 2 + P(12), y + h / 2 - P(1));   // right
  drawChair(g, x + w / 2 - P(12), y + h / 2 + P(11));  // bottom-left
  drawChair(g, x + w / 2 + P(8), y + h / 2 + P(11));   // bottom-right

  // Whiteboard on top wall
  drawWhiteboard(g, x + P(4), y + P(7), P(24), P(12));

  // Second whiteboard (brainstorming)
  drawWhiteboard(g, x + P(32), y + P(7), P(20), P(12));

  // Painting on right side
  drawPainting(g, x + w - P(14), y + P(7), P(10), P(7));

  // Papers on table
  drawPapers(g, x + w / 2 - P(4), y + h / 2 - P(3));
  drawCoffeeCup(g, x + w / 2 + P(2), y + h / 2 - P(1));

  // Plants in corners
  drawPlantLarge(g, x + P(2), y + h - P(12));
  drawPlantLarge(g, x + w - P(8), y + h - P(12));
}

/** Messaging/Lounge — 300×320 — Relaxed chat area with couches */
function decorateMessaging(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawGreenCarpet(g, x, y, w, h);

  // Painting on wall
  drawPainting(g, x + P(8), y + P(7), P(14), P(8));

  // Bookshelf on left
  drawBookshelf(g, x + P(2), y + P(7), false);

  // Sofa (wide, facing center)
  drawSofa(g, x + P(4), y + P(21), P(16));

  // Coffee table in front of sofa
  drawSmallTable(g, x + P(6), y + P(33), P(12), P(5));
  drawCoffeeCup(g, x + P(10), y + P(34));
  drawCoffeeCup(g, x + P(14), y + P(34));

  // Second smaller sofa/loveseat on right
  drawSofa(g, x + P(24), y + P(25), P(10));

  // Small side table
  drawSmallTable(g, x + P(26), y + P(37), P(6), P(4));
  drawPapers(g, x + P(27), y + P(38));

  // Plants
  drawPlantLarge(g, x + P(2), y + h - P(12));
  drawPlantSmall(g, x + w - P(5), y + P(7));

  // Wall clock
  drawClock(g, x + w - P(8), y + P(7));
}

/** Spawn/Lobby — 220×260 — Small entry area with portal */
function decorateSpawn(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawDarkFloor(g, x, y, w, h);

  // Portal in center (shifted down for label)
  drawPortalEffect(g, x + w / 2, y + h / 2 - P(2));

  // Welcome mat
  const matX = x + (w - P(14)) / 2;
  const matY = y + h - P(12);
  px(g, matX, matY, P(14), P(4), C.couchSeat);
  px(g, matX + P(1), matY + P(1), P(12), P(2), C.couchCushion);

  // Small plants flanking portal
  drawPlantSmall(g, x + P(2), y + P(12));
  drawPlantSmall(g, x + w - P(5), y + P(12));

  // Decorative lights along walls
  for (let i = 0; i < 3; i++) {
    px(g, x + P(3) + i * P(7), y + P(7), P(2), P(2), C.portalGlow);
  }
}

/** Idle/Break Room — 460×260 — Wide kitchen/break area */
function decorateIdle(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawTileFloor(g, x, y, w, h);

  // Kitchen counter along top
  drawCounter(g, x + P(2), y + P(7), P(28));
  drawCoffeeMachine(g, x + P(4), y + P(3));

  // Fridge next to counter
  drawFridge(g, x + P(32), y + P(7));

  // Vending machine on right
  drawVendingMachine(g, x + w - P(10), y + P(7));

  // Water cooler
  drawWaterCooler(g, x + P(42), y + P(7));

  // Dining tables (2 round tables)
  drawRoundTable(g, x + P(18), y + P(33), P(10));
  drawChair(g, x + P(10), y + P(29));
  drawChair(g, x + P(22), y + P(29));
  drawChair(g, x + P(10), y + P(37));
  drawChair(g, x + P(22), y + P(37));

  drawRoundTable(g, x + P(46), y + P(33), P(10));
  drawChair(g, x + P(38), y + P(29));
  drawChair(g, x + P(50), y + P(29));
  drawChair(g, x + P(38), y + P(37));
  drawChair(g, x + P(50), y + P(37));

  // Coffee cups on tables
  drawCoffeeCup(g, x + P(17), y + P(32));
  drawCoffeeCup(g, x + P(45), y + P(32));

  // Wall clock
  drawClock(g, x + P(52), y + P(7));

  // Plants
  drawPlantSmall(g, x + P(2), y + h - P(8));
  drawPlantSmall(g, x + w - P(5), y + h - P(8));
}

/** Tasks/Project Room — 380×260 — Kanban boards and work area */
function decorateTasks(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawWoodFloor(g, x, y, w, h);

  // Large Kanban board on top wall
  drawKanbanBoard(g, x + P(2), y + P(7), P(30), P(18));

  // Sticky notes cluster on right wall
  const noteColors = [C.stickyYellow, C.stickyPink, C.stickyGreen, C.stickyBlue, C.stickyOrange, C.stickyYellow];
  for (let i = 0; i < 6; i++) {
    const nx = x + P(36) + (i % 3) * P(4);
    const ny = y + P(7) + Math.floor(i / 3) * P(4);
    drawStickyNote(g, nx, ny, noteColors[i]);
  }

  // Laptop desk
  drawLaptopDesk(g, x + P(6), y + P(31));
  drawChair(g, x + P(9), y + P(41));

  // Standing desk with monitor
  drawDeskWithMonitor(g, x + P(30), y + P(31));
  drawChair(g, x + P(34), y + P(41));

  // Papers on desks
  drawPapers(g, x + P(44), y + P(33));

  // Whiteboard (smaller, for quick notes)
  drawWhiteboard(g, x + P(50), y + P(7), P(14), P(10));

  // Plant
  drawPlantLarge(g, x + w - P(8), y + h - P(12));
  drawPlantSmall(g, x + P(2), y + h - P(8));
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
