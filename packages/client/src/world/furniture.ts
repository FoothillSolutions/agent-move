import { Graphics } from 'pixi.js';
import { C, BOOK_ROWS } from './furniture-colors.js';

/**
 * High-quality pixel-art office furniture — Gather.town inspired.
 * Top-down perspective with pseudo-3D depth cues on walls and furniture edges.
 * PX = base pixel unit; all sizes are multiples of PX.
 */
const PX = 4;
const P = (n: number) => n * PX;

// ── Core Drawing Helpers ─────────────────────────────────────

function px(g: Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.rect(x, y, w, h).fill(color);
}

/** Draws a rounded 2×2 pixel dot — used for chair wheels, buttons, etc. */
function dot(g: Graphics, x: number, y: number, color: number): void {
  px(g, x, y, PX, PX, color);
}

/**
 * Desk/table top with warm wood surface, dark edge, and highlight stripe.
 * Adds a subtle drop-shadow below for depth.
 */
function drawWoodTableTop(g: Graphics, x: number, y: number, w: number, h: number): void {
  // Drop shadow
  px(g, x + 3, y + h, w, 4, 0x00000022);
  // Dark edge (south face, gives pseudo-3D depth)
  px(g, x, y + h - PX, w, PX, C.medWood);
  // Main surface
  px(g, x, y, w, h - PX, C.lightWood);
  // Wood grain lines
  for (let i = 0; i < 3; i++) {
    px(g, x + P(2) + i * P(4), y + PX, 1, h - P(2), C.paleWood);
  }
  // Top highlight
  px(g, x + PX, y, w - PX * 2, PX, C.paleWood);
  // Left highlight
  px(g, x, y, PX, h - PX, C.paleWood);
}

// ── Floor Patterns ───────────────────────────────────────────

/**
 * Light beige office floor tiles (Gather.town style).
 * Clean 6×6-PX tiles with subtle grid and alternating tone.
 */
function drawTileFloor(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.tileBase);
  const ts = P(6);
  for (let ty = 0; ty < h; ty += ts) {
    for (let tx = 0; tx < w; tx += ts) {
      const odd = (((tx / ts) + (ty / ts)) % 2) === 0;
      if (odd) px(g, x + tx, y + ty, ts, ts, C.tileAlt);
      // Grid lines
      px(g, x + tx, y + ty, ts, 1, C.tileGrid);
      px(g, x + tx, y + ty, 1, ts, C.tileGrid);
      // Inner highlight on alternate tiles
      if (!odd) {
        px(g, x + tx + 2, y + ty + 2, ts - 4, ts - 4, C.tileHighlight);
        px(g, x + tx + 2, y + ty + 2, ts - 4, ts - 4, C.tileBase);
      }
    }
  }
}

/**
 * Warm wood plank floor — lighter than before, staggered planks.
 */
function drawWoodFloor(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.woodFloor);
  const plankH = P(5);
  let row = 0;
  for (let fy = 0; fy < h; fy += plankH) {
    const ph = Math.min(plankH, h - fy);
    if (row % 2 === 1) px(g, x, y + fy, w, ph, C.woodFloorAlt);
    // Plank separator
    px(g, x, y + fy, w, 1, C.plankLine);
    // Staggered vertical grain lines
    const offset = (row % 2) * P(8);
    for (let fx = offset; fx < w; fx += P(16)) {
      px(g, x + fx, y + fy + 1, 1, ph - 2, C.woodFloorDark);
    }
    row++;
  }
}

/**
 * Dotted carpet pattern — used for various zones with different color sets.
 */
function drawDottedCarpet(
  g: Graphics, x: number, y: number, w: number, h: number,
  base: number, dot2: number, edge: number, allEdges = true,
): void {
  px(g, x, y, w, h, base);
  for (let fy = 0; fy < h; fy += P(3)) {
    for (let fx = ((fy / P(3)) % 2) * P(3); fx < w; fx += P(6)) {
      px(g, x + fx, y + fy, P(1), P(1), dot2);
    }
  }
  // Edges
  px(g, x, y, w, PX, edge);
  px(g, x, y + h - PX, w, PX, edge);
  if (allEdges) {
    px(g, x, y, PX, h, edge);
    px(g, x + w - PX, y, PX, h, edge);
  }
}

function drawCarpetFloor(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawDottedCarpet(g, x, y, w, h, C.carpet, C.carpetDot, C.carpetEdge);
}

function drawWarmCarpet(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawDottedCarpet(g, x, y, w, h, C.carpetWarm, C.carpetWarmDot, C.couchFrame);
}

function drawDarkFloor(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.darkFloor);
  // Subtle scan lines
  for (let fy = 0; fy < h; fy += P(4)) {
    px(g, x, y + fy, w, PX, C.darkFloorLine);
    px(g, x, y + fy + P(2), w, P(2), C.darkFloorAlt);
  }
  // Subtle diagonal crosshatch
  for (let fy = 0; fy < h; fy += P(8)) {
    for (let fx = 0; fx < w; fx += P(8)) {
      px(g, x + fx, y + fy, 1, 1, C.metalDark);
    }
  }
}

function drawGreenCarpet(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawDottedCarpet(g, x, y, w, h, C.greenFloor, C.greenFloorDot, C.leafDark, false);
}

function drawGreyCarpet(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawDottedCarpet(g, x, y, w, h, C.greyCarpet, C.greyCarpetDot, C.greyCarpetEdge);
}

// ── Furniture Pieces ─────────────────────────────────────────

/**
 * Office chair — dark charcoal, top-down view.
 * Rounded seat with armrests and 5-pointed star base peeking out.
 */
function drawChair(g: Graphics, x: number, y: number): void {
  // Chair base / wheels (peeking below seat)
  px(g, x + P(1), y + P(5), P(3), PX, C.chairWheel);
  // Seat cushion — large rounded rectangle
  px(g, x, y + P(1), P(5), P(4), C.chairSeat);
  px(g, x + PX, y + P(1), P(3), P(4), C.chairHighlight);
  // Backrest — taller darker rectangle
  px(g, x + PX, y, P(3), P(2), C.chairBack);
  px(g, x + P(2), y, PX, PX, C.chairHighlight);
  // Armrests
  px(g, x, y + P(2), PX, P(2), C.chairArm);
  px(g, x + P(4), y + P(2), PX, P(2), C.chairArm);
}

/**
 * High-quality bookshelf — tall frame, colored book spines, visible shelves.
 */
function drawBookshelf(g: Graphics, x: number, y: number, wide: boolean): void {
  const sw = wide ? P(18) : P(11);
  const sh = P(16);
  // Shadow
  px(g, x + 3, y + sh, sw, 4, 0x00000022);
  // Back panel
  px(g, x, y, sw, sh, C.darkWood);
  // Side planks (give 3D depth)
  px(g, x, y, PX, sh, C.medWood);
  px(g, x + sw - PX, y, PX, sh, C.medWood);
  // Inner wood fill
  px(g, x + PX, y + PX, sw - PX * 2, sh - PX * 2, C.wood);
  // Top highlight
  px(g, x, y, sw, PX, C.lightWood);

  // 4 shelves
  for (let i = 1; i <= 4; i++) {
    const sy = y + i * P(3);
    px(g, x, sy, sw, PX + 1, C.medWood);
    px(g, x + PX, sy, sw - PX * 2, 1, C.lightWood);
  }

  // Books on shelves
  for (let shelf = 0; shelf < 4; shelf++) {
    const shelfBottom = y + (shelf + 1) * P(3);
    const colors = BOOK_ROWS[shelf % BOOK_ROWS.length];
    let bx = x + PX + 1;
    let ci = shelf * 3;
    while (bx < x + sw - PX - 1) {
      const bw = PX - 1;
      const bh = P(2) + ((ci * 7 + shelf * 3) % 4);
      px(g, bx, shelfBottom - bh, bw, bh, colors[ci % colors.length]);
      // Book highlight
      px(g, bx, shelfBottom - bh, 1, bh, 0xffffff11);
      bx += bw + 1;
      ci++;
    }
  }
  // Bottom edge
  px(g, x, y + sh - PX, sw, PX, C.medWood);
}

/**
 * Computer workstation desk — desk surface with monitor, keyboard, mouse.
 * Has a back wall + pseudo-3D south face.
 */
function drawDeskWithMonitor(g: Graphics, x: number, y: number): void {
  const dw = P(16), dh = P(8);
  // Shadow
  px(g, x + 3, y + dh, dw, 5, 0x00000030);
  // Back face (wall-mount height)
  px(g, x, y, dw, P(2), C.wood);
  // Desk surface
  drawWoodTableTop(g, x, y + P(2), dw, dh - P(2));

  // Monitor — sits at back of desk
  const mx = x + P(3);
  const my = y;
  // Monitor frame
  px(g, mx, my, P(8), P(6), C.screenFrame);
  px(g, mx + PX, my + PX, P(6), P(4), C.screenBlue);
  // Screen glow/content
  px(g, mx + PX, my + PX, P(3), P(2), C.screenGlow);
  px(g, mx + P(2), my + P(3), P(4), PX, C.screenBlueDark);
  // Monitor stand
  px(g, mx + P(3), my + P(5), P(2), PX, C.metalDark);
  px(g, mx + P(2), my + P(6), P(4), PX, C.metalDark);

  // Keyboard
  px(g, x + P(3), y + P(6), P(7), P(2), C.metalLight);
  px(g, x + P(3) + 1, y + P(6) + 1, P(7) - 2, PX - 2, C.offWhite);

  // Mouse
  px(g, x + P(11), y + P(6), P(2), P(2), C.metalMid);
  px(g, x + P(11), y + P(6), P(2), PX, C.metalLight);
}

/**
 * Server monitoring terminal — glowing green CRT monitor on dark desk.
 */
function drawServerMonitor(g: Graphics, x: number, y: number): void {
  const dw = P(16), dh = P(8);
  px(g, x + 3, y + dh, dw, 5, 0x00000030);
  // Desk — dark metal
  px(g, x, y + P(2), dw, dh - P(2), C.metalFrame);
  px(g, x + PX, y + P(2) + PX, dw - PX * 2, dh - P(3), C.metalDark);
  // South edge
  px(g, x, y + dh - PX, dw, PX, C.metalMid);

  // Monitor (CRT green terminal)
  const mx = x + P(2);
  const my = y;
  px(g, mx, my, P(10), P(7), C.screenFrame);
  px(g, mx + PX, my + PX, P(8), P(5), C.screenGreen);
  // Scanlines
  for (let sl = 0; sl < P(5); sl += P(1)) {
    px(g, mx + PX, my + PX + sl, P(8), 1, C.screenGreenGlow);
  }
  // Fake terminal text lines
  px(g, mx + P(1), my + P(1), P(4), 1, C.screenGreenGlow);
  px(g, mx + P(1), my + P(2), P(6), 1, C.screenGreenGlow);
  px(g, mx + P(1), my + P(3), P(3), 1, C.screenGreenGlow);
  // Monitor stand
  px(g, mx + P(4), my + P(6), P(2), PX, C.metalDark);
}

/**
 * Server rack — tall dark enclosure with blinking LEDs and drive bays.
 */
function drawServerRack(g: Graphics, x: number, y: number): void {
  const rw = P(8), rh = P(16);
  // Shadow
  px(g, x + 3, y + rh, rw, 4, 0x00000030);
  // Body
  px(g, x, y, rw, rh, C.metalFrame);
  // Rivets / edge detail
  px(g, x, y, PX, rh, C.metalDark);
  px(g, x + rw - PX, y, PX, rh, C.metalDark);
  // Top
  px(g, x, y, rw, PX, C.metalMid);

  // Drive bays
  for (let i = 0; i < 5; i++) {
    const by = y + P(1) + i * P(3);
    px(g, x + PX, by, rw - PX * 2, P(2), C.metalDark);
    px(g, x + PX, by, rw - PX * 2, PX, C.metalMid);
    // Activity LED
    const ledColor = i === 2 ? C.ledRed : (i === 4 ? C.ledBlue : C.led);
    px(g, x + P(1), by + PX, PX, PX, i < 4 ? ledColor : C.ledOff);
    // Drive slot lines
    px(g, x + P(2), by + PX, rw - P(4), 1, C.metalDark);
  }
  // Bottom bracket
  px(g, x, y + rh - PX, rw, PX, C.metalMid);
}

/**
 * Filing cabinet — metal two-drawer unit with paper tabs.
 */
function drawFileCabinet(g: Graphics, x: number, y: number): void {
  const fw = P(6), fh = P(12);
  // Shadow
  px(g, x + 3, y + fh, fw, 4, 0x00000022);
  // Body
  px(g, x, y, fw, fh, C.metalDark);
  // Side highlight
  px(g, x, y, PX, fh, C.metalMid);
  // Top
  px(g, x, y, fw, PX, C.metalLight);

  // Two drawers
  for (let d = 0; d < 2; d++) {
    const dy = y + PX + d * P(5);
    px(g, x + PX, dy, fw - PX * 2, P(4), C.metalMid);
    px(g, x + PX, dy, fw - PX * 2, PX, C.metalLight);
    // Paper peeking out of top drawer
    px(g, x + P(1), dy, fw - P(3), PX, C.paper);
    // Drawer handle
    px(g, x + P(2), dy + P(2), P(2), PX, C.metalFrame);
    px(g, x + P(2), dy + P(2), P(2), 1, C.metalBright);
  }
  // Bottom edge
  px(g, x, y + fh - PX, fw, PX, C.metalMid);
}

/**
 * Large conference / boardroom table — wood with highlight lines.
 * Drawn as a flat top-down rectangle.
 */
function drawConferenceTable(g: Graphics, x: number, y: number, w: number, h: number): void {
  // Shadow
  px(g, x + 4, y + h, w, 5, 0x00000030);
  // South face
  px(g, x + PX, y + h - PX, w, PX, C.medWood);
  // Surface
  px(g, x, y, w, h - PX, C.lightWood);
  // Top highlight
  px(g, x + PX, y, w - PX * 2, PX, C.paleWood);
  // Wood grain lines
  for (let i = 0; i < 4; i++) {
    px(g, x + P(3) + i * P(6), y + PX, 1, h - P(2), C.paleWood);
  }
  // Dark border
  px(g, x, y, PX, h - PX, C.medWood);
  px(g, x + w - PX, y, PX, h - PX, C.medWood);
}

/**
 * Round coffee/meeting table — pixel-art circle approximation.
 */
function drawRoundTable(g: Graphics, cx: number, cy: number, r: number): void {
  // Shadow
  px(g, cx - r / 2 + 4, cy - r / 2 + 4, r, r, 0x00000028);
  const h = r / 2;
  // Outermost rim
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
  // Shine streak
  px(g, cx - P(3), cy - P(2), P(6), PX, C.paleWood);
  px(g, cx - P(2), cy, P(4), 1, C.paleWood);
}

/**
 * Whiteboard — wall-mounted, with colored marker lines.
 */
function drawWhiteboard(g: Graphics, x: number, y: number, w: number, h: number): void {
  // Shadow
  px(g, x + 2, y + h, w, 3, 0x00000022);
  // Frame
  px(g, x, y, w, h, C.whiteboardFrame);
  // Surface
  px(g, x + PX, y + PX, w - PX * 2, h - PX * 2, C.whiteboardSurface);
  // Subtle surface lines
  for (let i = 2; i < h - PX * 2; i += P(3)) {
    px(g, x + PX, y + PX + i, w - PX * 2, 1, C.whiteboardLine);
  }
  // Marker content
  px(g, x + P(2), y + P(2), w * 0.45, PX, C.blue);
  px(g, x + P(2), y + P(4), w * 0.65, PX, C.red);
  px(g, x + P(2), y + P(6), w * 0.35, PX, C.black);
  if (w > P(14)) {
    px(g, x + w / 2, y + P(2), w * 0.3, PX, C.green);
    px(g, x + w / 2, y + P(4), w * 0.2, PX, C.blue);
  }
  // Marker tray
  px(g, x + P(2), y + h, w - P(4), PX, C.metalDark);
  px(g, x + P(3), y + h, PX, PX, C.red);
  px(g, x + P(5), y + h, PX, PX, C.blue);
  px(g, x + P(7), y + h, PX, PX, C.green);
}

/**
 * Sticky note — small colored square with a fold shadow and a text line.
 */
function drawStickyNote(g: Graphics, x: number, y: number, color: number): void {
  // Shadow
  px(g, x + 2, y + 2, P(4), P(4), 0x00000022);
  // Body
  px(g, x, y, P(4), P(4), color);
  // Top fold
  px(g, x, y, P(4), PX, 0xffffff33);
  // Fake text lines
  px(g, x + PX, y + P(1) + 2, P(2), 1, C.metalDark);
  px(g, x + PX, y + P(2) + 1, P(2) + 2, 1, C.metalDark);
}

/**
 * Sofa / couch — warm orange, top-down view with back, seat, and armrests.
 */
function drawSofa(g: Graphics, x: number, y: number, w: number): void {
  // Shadow
  px(g, x + 3, y + P(9), w, 5, 0x00000030);
  // Back rest (darker, at top)
  px(g, x, y, w, P(3), C.sofaDark);
  px(g, x + PX, y, w - PX * 2, PX, C.sofaLight);
  // Armrests
  px(g, x, y, PX * 2, P(9), C.sofaArm);
  px(g, x + w - PX * 2, y, PX * 2, P(9), C.sofaArm);
  // Seat cushions
  const cushW = Math.floor((w - P(3) - PX * 4) / 2);
  px(g, x + PX * 2, y + P(3), w - PX * 4, P(6), C.sofaBody);
  // Cushion divider
  px(g, x + PX * 2 + cushW, y + P(3), PX, P(6), C.sofaDark);
  // Cushion highlights
  px(g, x + PX * 2, y + P(3), cushW, PX, C.sofaHighlight);
  px(g, x + PX * 2 + cushW + PX, y + P(3), cushW - 1, PX, C.sofaHighlight);
  // Front edge
  px(g, x, y + P(8), w, PX, C.sofaDark);
}

/**
 * Small side table / coffee table.
 */
function drawSmallTable(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x + 3, y + h, w, 4, 0x00000022);
  // South edge
  px(g, x + PX, y + h - PX, w, PX, C.medWood);
  // Surface
  px(g, x, y, w, h - PX, C.lightWood);
  px(g, x + PX, y, w - PX * 2, PX, C.paleWood);
  px(g, x, y, PX, h - PX, C.paleWood);
}

/**
 * Vending machine — bright snack colors behind glass.
 */
function drawVendingMachine(g: Graphics, x: number, y: number): void {
  const vw = P(9), vh = P(18);
  // Shadow
  px(g, x + 3, y + vh, vw, 4, 0x00000030);
  // Body
  px(g, x, y, vw, vh, C.vendingBody);
  // Side highlight
  px(g, x, y, PX, vh, C.metalMid);
  // Top
  px(g, x, y, vw, PX, C.metalDark);
  // Glass panel
  px(g, x + PX, y + P(2), vw - PX * 2, P(10), C.vendingGlass);
  // Top reflection on glass
  px(g, x + PX, y + P(2), vw - PX * 2, PX, C.vendingLight);
  // Product rows
  const pColors = [C.bookRed, C.bookOrange, C.bookGreen, C.bookBlue, C.bookYellow, C.bookPink];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      px(g, x + P(2) + col * P(2), y + P(3) + row * P(2), P(1) + 1, P(1) + 1, pColors[(row * 2 + col) % pColors.length]);
    }
    px(g, x + PX, y + P(4) + row * P(2), vw - PX * 2, 1, C.metalDark);
  }
  // Control panel
  px(g, x + PX, y + P(13), vw - PX * 2, P(3), C.metalFrame);
  px(g, x + vw - P(2), y + P(14), PX, PX, C.ledRed);
  px(g, x + vw - P(2), y + P(15), PX, PX, C.green);
  // Bottom
  px(g, x, y + vh - PX, vw, PX, C.metalDark);
}

/**
 * Fridge — light body with handle and division line.
 */
function drawFridge(g: Graphics, x: number, y: number): void {
  const fw = P(7), fh = P(16);
  // Shadow
  px(g, x + 3, y + fh, fw, 4, 0x00000022);
  // Body
  px(g, x, y, fw, fh, C.fridgeBody);
  // Top highlight
  px(g, x, y, fw, PX, C.metalShine);
  // Left shine
  px(g, x, y, PX, fh, C.fridgeLight);
  // Inner panel
  px(g, x + PX, y + PX, fw - PX * 2, fh - PX * 2, C.fridgeLight);
  // Freezer divider
  px(g, x + PX, y + P(5), fw - PX * 2, PX, C.fridgeDark);
  // Door handles
  px(g, x + fw - PX * 2, y + P(2), PX, P(2), C.fridgeHandle);
  px(g, x + fw - PX * 2, y + P(7), PX, P(2), C.fridgeHandle);
  // Bottom
  px(g, x, y + fh - PX, fw, PX, C.fridgeDark);
}

/**
 * Coffee machine — espresso machine with button panel.
 */
function drawCoffeeMachine(g: Graphics, x: number, y: number): void {
  // Body
  px(g, x, y, P(5), P(7), C.metalDark);
  // Side shine
  px(g, x, y, PX, P(7), C.metalMid);
  // Top highlight
  px(g, x, y, P(5), PX, C.metalBright);
  // Water tank (transparent blue)
  px(g, x + P(1), y + PX, P(3), P(3), C.screenBlue);
  px(g, x + P(1), y + PX, P(3), PX, C.screenGlow);
  // Button panel
  px(g, x + PX, y + P(4), P(3), P(2), C.metalMid);
  px(g, x + P(1), y + P(4), PX, PX, C.red);
  px(g, x + P(2), y + P(4), PX, PX, C.led);
  // Cup area
  px(g, x, y + P(6), P(5), PX, C.metalFrame);
  px(g, x + P(1), y + P(5) + 2, P(2), P(2), C.white);
}

/**
 * Water cooler — blue bottle on white body with tap buttons.
 */
function drawWaterCooler(g: Graphics, x: number, y: number): void {
  // Body
  px(g, x, y + P(3), P(4), P(6), C.fridgeLight);
  px(g, x, y + P(3), PX, P(6), C.fridgeBody);
  px(g, x, y + P(3), P(4), PX, C.metalShine);
  // Water bottle
  px(g, x + PX, y, P(2), P(4), C.screenBlue);
  px(g, x + PX, y, P(2), PX, C.screenGlow);
  // Tap buttons
  px(g, x + PX, y + P(5), PX, PX, C.blue);
  px(g, x + P(2), y + P(5), PX, PX, C.red);
  // Bottom edge
  px(g, x, y + P(8), P(4), PX, C.fridgeDark);
}

/**
 * Kitchen counter — light wood top with cabinet doors below.
 */
function drawCounter(g: Graphics, x: number, y: number, w: number): void {
  // Shadow
  px(g, x + 3, y + P(9), w, 4, 0x00000022);
  // Cabinet body (below counter)
  px(g, x, y + P(5), w, P(5), C.wood);
  px(g, x, y + P(5), PX, P(5), C.lightWood);
  // Cabinet doors
  const doorW = P(5);
  for (let dx = 0; dx < w - PX; dx += doorW + 2) {
    px(g, x + dx + 2, y + P(6), doorW - 1, P(3), C.medWood);
    px(g, x + dx + P(2), y + P(7), PX, PX, C.lightWood);
  }
  // Counter top surface
  px(g, x, y, w, P(5), C.lightWood);
  px(g, x + PX, y + PX, w - PX * 2, P(3), C.paleWood);
  px(g, x, y, w, PX, C.white);
  // South edge
  px(g, x, y + P(5) - PX, w, PX, C.medWood);
}

/**
 * Painting / wall art — landscape with mountains.
 */
function drawPainting(g: Graphics, x: number, y: number, w: number, h: number): void {
  // Shadow
  px(g, x + 2, y + h, w, 3, 0x00000022);
  // Frame
  px(g, x, y, w, h, C.darkWood);
  // Canvas — sky
  px(g, x + PX, y + PX, w - PX * 2, h - PX * 2, 0x88aacc);
  // Sun
  px(g, x + w - P(4), y + P(1), P(3), P(3), C.yellow);
  px(g, x + w - P(3), y + P(1), PX, PX, 0xffffaa);
  // Mountains
  px(g, x + PX, y + h - P(5), P(4), P(3), 0x446688);
  px(g, x + P(3), y + h - P(6), P(3), P(1), 0x557799);
  px(g, x + P(5), y + h - P(4), P(3), P(2), 0x446688);
  // Snow caps
  px(g, x + P(3), y + h - P(6), PX, PX, C.white);
  // Ground
  px(g, x + PX, y + h - P(2), w - PX * 2, PX, C.leaf);
}

/**
 * Wall clock — round face with hands and tick marks.
 */
function drawClock(g: Graphics, x: number, y: number): void {
  // Frame
  px(g, x + PX, y, P(4), PX, C.offWhite);
  px(g, x, y + PX, P(6), P(4), C.white);
  px(g, x + PX, y + P(5), P(4), PX, C.offWhite);
  // Face
  px(g, x + PX, y + PX, P(4), P(4), C.cream);
  // Tick marks (4 cardinal)
  px(g, x + P(3), y + PX, PX, PX, C.black);
  px(g, x + P(5) - PX, y + P(3), PX, PX, C.black);
  px(g, x + P(3), y + P(5) - PX, PX, PX, C.black);
  px(g, x + PX + 1, y + P(3), PX, PX, C.black);
  // Hour hand
  px(g, x + P(3), y + P(2), PX, P(2), C.black);
  // Minute hand
  px(g, x + P(3), y + P(3), P(2), PX, C.black);
  // Center dot
  px(g, x + P(3), y + P(3), PX, PX, C.red);
}

function drawCoffeeCup(g: Graphics, x: number, y: number): void {
  // Cup body
  px(g, x, y, P(2), P(3), C.white);
  px(g, x, y + P(2), P(2), PX, C.offWhite);
  // Handle
  px(g, x + P(2), y + PX, PX, P(1), C.offWhite);
  // Coffee
  px(g, x, y, P(2), PX, 0xaa7744);
}

function drawPapers(g: Graphics, x: number, y: number): void {
  // Back sheet (slightly offset)
  px(g, x + 3, y + 3, P(4), P(5), C.offWhite);
  // Front sheet
  px(g, x, y, P(4), P(5), C.paper);
  // Text lines
  px(g, x + PX, y + P(1), P(2), 1, C.metalDark);
  px(g, x + PX, y + P(2), P(3) - 1, 1, C.metalDark);
  px(g, x + PX, y + P(3), P(2) + 1, 1, C.metalDark);
}

function drawBox(g: Graphics, x: number, y: number, color: number): void {
  // Shadow
  px(g, x + 3, y + P(4), P(4), 3, 0x00000022);
  // Box body
  px(g, x, y, P(4), P(4), color);
  // Top face (lighter)
  px(g, x, y, P(4), PX, C.paleWood);
  // Front face (shadow)
  px(g, x, y + P(3), P(4), PX, C.darkWood);
  // Tape strip
  px(g, x + PX, y + PX, P(2), P(2), C.offWhite);
}

/**
 * Portal swirl effect — glowing rings.
 */
function drawPortalEffect(g: Graphics, cx: number, cy: number): void {
  // Outer ring
  px(g, cx - P(7), cy - P(1), P(14), P(2), C.portalDeep);
  px(g, cx - P(1), cy - P(7), P(2), P(14), C.portalDeep);
  px(g, cx - P(5), cy - P(6), P(10), PX, C.portalMid);
  px(g, cx - P(6), cy - P(5), PX, P(10), C.portalMid);
  px(g, cx - P(5), cy + P(5), P(10), PX, C.portalMid);
  px(g, cx + P(5), cy - P(5), PX, P(10), C.portalMid);
  // Middle ring
  px(g, cx - P(4), cy - P(5), P(8), PX, C.portalLight);
  px(g, cx - P(5), cy - P(4), PX, P(8), C.portalLight);
  px(g, cx - P(4), cy + P(4), P(8), PX, C.portalLight);
  px(g, cx + P(4), cy - P(4), PX, P(8), C.portalLight);
  // Inner fill
  px(g, cx - P(3), cy - P(3), P(6), P(6), C.portalDeep);
  px(g, cx - P(2), cy - P(2), P(4), P(4), C.portalMid);
  // Core glow
  px(g, cx - P(1), cy - P(1), P(2), P(2), C.portalGlow);
  // Sparkles
  px(g, cx - P(4), cy, PX, PX, C.portalGlow);
  px(g, cx + P(3), cy - P(1), PX, PX, C.portalGlow);
  px(g, cx, cy + P(3), PX, PX, C.portalGlow);
}

/**
 * Laptop on desk — slim design.
 */
function drawLaptopDesk(g: Graphics, x: number, y: number): void {
  const dw = P(14), dh = P(7);
  drawWoodTableTop(g, x, y, dw, dh);
  // Laptop screen (open)
  const lx = x + P(3), ly = y + PX;
  px(g, lx, ly, P(7), P(5), C.metalDark);
  px(g, lx + PX, ly + PX, P(5), P(3), C.screenBlue);
  px(g, lx + PX, ly + PX, P(3), P(1), C.screenGlow);
  // Laptop base / keyboard
  px(g, lx, ly + P(5), P(7), P(2), C.metalFrame);
  px(g, lx + PX, ly + P(5) + PX, P(5), P(1) - 2, C.metalMid);
  // Mouse
  px(g, x + P(11), y + P(4), P(2), P(2), C.metalMid);
}

/**
 * Kanban board — three-column card wall.
 */
function drawKanbanBoard(g: Graphics, x: number, y: number, w: number, h: number): void {
  // Shadow
  px(g, x + 2, y + h, w, 3, 0x00000022);
  // Frame
  px(g, x, y, w, h, C.whiteboardFrame);
  // Surface
  px(g, x + PX, y + PX, w - PX * 2, h - PX * 2, C.whiteboardSurface);
  // 3 columns
  const colW = Math.floor((w - P(5)) / 3);
  const headers = [C.bookRed, C.bookYellow, C.bookGreen];
  for (let i = 0; i < 3; i++) {
    const colX = x + P(2) + i * (colW + PX);
    // Column header background
    px(g, colX, y + P(2), colW, P(2), headers[i]);
    // Column header shine
    px(g, colX, y + P(2), colW, PX, 0xffffff44);
    // Cards
    const cardColors = [C.stickyYellow, C.stickyBlue, C.stickyPink, C.stickyGreen, C.stickyOrange, C.stickyPurple];
    const numCards = i === 0 ? 3 : i === 1 ? 2 : 1;
    for (let j = 0; j < numCards; j++) {
      const cardX = colX + 2;
      const cardY = y + P(5) + j * (P(3) + 2);
      px(g, cardX, cardY, colW - 4, P(2), cardColors[(i + j * 2) % cardColors.length]);
      // Card shine
      px(g, cardX, cardY, colW - 4, 1, 0xffffff55);
      // Card text line
      px(g, cardX + 2, cardY + PX + 1, colW - 8, 1, C.metalDark);
    }
  }
}

/**
 * Globe/network display — large wall screen with world map.
 */
function drawGlobeScreen(g: Graphics, x: number, y: number): void {
  const sw = P(22), sh = P(15);
  // Shadow
  px(g, x + 3, y + sh, sw, 4, 0x00000030);
  // Screen frame
  px(g, x, y, sw, sh, C.screenFrame);
  px(g, x, y, sw, PX, C.metalMid);
  px(g, x, y, PX, sh, C.metalMid);
  // Screen inner bezel
  px(g, x + PX, y + PX, sw - PX * 2, sh - PX * 2, C.screenDark);
  // Display area
  px(g, x + P(2), y + P(2), sw - P(4), sh - P(4), C.screenBlue);
  // Globe circle
  const gcx = x + sw / 2, gcy = y + sh / 2;
  const gr = P(4);
  px(g, gcx - gr, gcy - P(2), gr * 2, P(4), 0x1155aa);
  px(g, gcx - P(2), gcy - gr, P(4), gr * 2, 0x1155aa);
  px(g, gcx - P(3), gcy - P(3), P(6), P(6), 0x1166bb);
  // Continents
  px(g, gcx - P(2), gcy - P(1), P(3), P(2), C.leafDark);
  px(g, gcx + P(1), gcy, P(2), P(1), C.leaf);
  px(g, gcx - P(1), gcy + P(1), PX, PX, C.leaf);
  // Orbit lines
  px(g, x + P(2), y + P(2), sw - P(4), 1, 0x4488cc);
  px(g, x + P(2), y + sh - P(3), sw - P(4), 1, 0x4488cc);
  // Connection dots
  px(g, x + P(4), y + P(4), PX, PX, C.led);
  px(g, x + sw - P(6), y + P(4), PX, PX, C.ledRed);
  px(g, x + P(6), y + sh - P(5), PX, PX, C.ledBlue);
  // Stand
  px(g, x + sw / 2 - P(1), y + sh, P(2), PX, C.metalDark);
  px(g, x + sw / 2 - P(2), y + sh + PX, P(4), PX, C.metalDark);
}

/**
 * Large tropical plant — detailed fronds.
 */
function drawPlantLarge(g: Graphics, x: number, y: number): void {
  // Pot shadow
  px(g, x + 3, y + P(9), P(7), 4, 0x00000022);
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
  // Leaves — wide fronds
  px(g, x + P(2), y, P(3), P(3), C.leaf);
  px(g, x + P(3), y + PX, P(2), P(3), C.leafLight);
  px(g, x, y + P(2), P(2), P(2), C.leafDark);
  px(g, x + P(5), y + P(2), P(2), P(2), C.leafLight);
  px(g, x + P(1), y + P(1), PX, P(2), C.leafDark);
  px(g, x + P(5), y + P(1), PX, P(2), C.leafBright);
  // Top leaf highlight
  px(g, x + P(3), y, PX, PX, C.leafBright);
}

/**
 * Small desk plant — simple succulent.
 */
function drawPlantSmall(g: Graphics, x: number, y: number): void {
  // Pot shadow
  px(g, x + 2, y + P(5), P(3) + 2, 3, 0x00000022);
  // Pot
  px(g, x, y + P(3), P(3), P(2), C.potBase);
  px(g, x, y + P(3), P(3), PX, C.potRim);
  px(g, x + PX, y + P(3), PX, PX, C.potHighlight);
  px(g, x, y + P(4), P(3), PX, C.potDark);
  // Soil
  px(g, x + PX, y + P(2) + 2, PX, PX, C.soil);
  // Leaves
  px(g, x + PX, y, PX, P(3), C.leaf);
  px(g, x, y + PX, PX, P(2), C.leafDark);
  px(g, x + P(2), y + PX, PX, P(2), C.leafLight);
  px(g, x + PX, y, PX, PX, C.leafBright);
}

// ── Room Decorator Functions ─────────────────────────────────

/** Search/Library — bookshelves, reading tables, globe */
function decorateSearch(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawWoodFloor(g, x, y, w, h);

  // Bookshelves along top wall
  drawBookshelf(g, x + P(2), y + P(7), true);
  drawBookshelf(g, x + P(22), y + P(7), true);
  drawBookshelf(g, x + P(42), y + P(7), true);
  drawBookshelf(g, x + P(62), y + P(7), false);

  // Side shelves
  drawBookshelf(g, x + P(2), y + P(26), false);
  drawBookshelf(g, x + P(2), y + P(45), false);

  // Reading table center-left
  drawSmallTable(g, x + P(20), y + P(36), P(14), P(7));
  drawChair(g, x + P(24), y + P(45));
  drawChair(g, x + P(24), y + P(30));
  drawPapers(g, x + P(22), y + P(37));
  drawCoffeeCup(g, x + P(30), y + P(37));

  // Reading table center-right
  drawSmallTable(g, x + P(44), y + P(36), P(14), P(7));
  drawChair(g, x + P(48), y + P(45));
  drawChair(g, x + P(48), y + P(30));
  drawPapers(g, x + P(46), y + P(38));

  // Plants
  drawPlantLarge(g, x + P(2), y + h - P(12));
  drawPlantLarge(g, x + w - P(9), y + P(24));
  drawPlantSmall(g, x + w - P(6), y + h - P(8));

  // Filing cabinets corner
  drawFileCabinet(g, x + w - P(8), y + h - P(15));
  drawFileCabinet(g, x + w - P(15), y + h - P(15));

  // Globe on desk
  const gx = x + P(58), gy = y + P(48);
  px(g, gx + P(2), gy + P(7), P(2), PX, C.darkWood);
  px(g, gx, gy + P(7) + PX, P(6), PX, C.darkWood);
  px(g, gx + PX, gy + P(1), P(4), P(1), 0x2277aa);
  px(g, gx, gy + P(2), P(6), P(4), 0x2277aa);
  px(g, gx + P(1), gy, P(4), P(2), 0x2277aa);
  px(g, gx + P(2), gy + P(3), P(2), P(2), C.leaf);
}

/** Terminal — server room, dark floor, racks, monitor desks */
function decorateTerminal(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawDarkFloor(g, x, y, w, h);

  // Server racks along top wall
  drawServerRack(g, x + P(2), y + P(7));
  drawServerRack(g, x + P(13), y + P(7));
  drawServerRack(g, x + P(24), y + P(7));

  // Right wall racks
  drawServerRack(g, x + w - P(10), y + P(28));
  drawServerRack(g, x + w - P(10), y + P(48));

  // Monitor desks (green terminal)
  drawServerMonitor(g, x + P(2), y + P(28));
  drawChair(g, x + P(6), y + P(40));

  drawServerMonitor(g, x + P(2), y + P(50));
  drawChair(g, x + P(6), y + P(62));

  // Cable trays
  px(g, x + P(11), y + P(25), PX, h - P(27), C.metalFrame);
  px(g, x + P(22), y + P(25), PX, h - P(27), C.metalFrame);

  // Hazard stripes near equipment
  for (let i = 0; i < 4; i++) {
    px(g, x + P(2) + i * P(3), y + h - P(5), P(2), PX, i % 2 === 0 ? C.bookYellow : C.metalDark);
  }

  // Status panel
  px(g, x + P(36), y + P(9), P(7), P(12), C.metalFrame);
  px(g, x + P(37), y + P(10), PX, PX, C.led);
  px(g, x + P(39), y + P(10), PX, PX, C.led);
  px(g, x + P(37), y + P(12), PX, PX, C.ledRed);
  px(g, x + P(39), y + P(12), PX, PX, C.led);
  px(g, x + P(37), y + P(14), PX, PX, C.ledBlue);
  px(g, x + P(39), y + P(14), PX, PX, C.ledYellow);
}

/** Web Lab — tech workstations, globe screen, network gear */
function decorateWeb(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawCarpetFloor(g, x, y, w, h);

  // Large globe/network screen on back wall
  drawGlobeScreen(g, x + P(2), y + P(7));

  // Server rack
  drawServerRack(g, x + w - P(10), y + P(7));

  // Workstations
  drawDeskWithMonitor(g, x + P(2), y + P(28));
  drawChair(g, x + P(6), y + P(40));

  drawDeskWithMonitor(g, x + P(26), y + P(28));
  drawChair(g, x + P(30), y + P(40));

  // Network hub table
  drawSmallTable(g, x + P(12), y + P(52), P(16), P(6));
  // Network switch
  px(g, x + P(14), y + P(53), P(10), P(3), C.metalDark);
  px(g, x + P(14), y + P(53), P(10), PX, C.metalMid);
  for (let i = 0; i < 6; i++) {
    px(g, x + P(15) + i * P(1) + 2, y + P(54) + 2, PX - 1, PX - 1, i < 5 ? C.led : C.ledRed);
  }

  // Plants
  drawPlantLarge(g, x + P(2), y + h - P(13));
  drawPlantSmall(g, x + w - P(5), y + h - P(9));

  // Cable along wall
  px(g, x + w - PX * 2, y + P(25), PX, h - P(29), C.metalDark);
}

/** Files/Archive — filing cabinets, bookshelves, sorting desk */
function decorateFiles(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawWoodFloor(g, x, y, w, h);

  // Row of filing cabinets along top
  drawFileCabinet(g, x + P(2), y + P(7));
  drawFileCabinet(g, x + P(10), y + P(7));
  drawFileCabinet(g, x + P(18), y + P(7));
  drawFileCabinet(g, x + P(26), y + P(7));

  // Bookshelves on left
  drawBookshelf(g, x + P(2), y + P(22), true);

  // Sorting desk with monitor
  drawDeskWithMonitor(g, x + P(26), y + P(26));
  drawChair(g, x + P(30), y + P(38));

  // Storage boxes
  drawBox(g, x + P(2), y + P(42), C.paleWood);
  drawBox(g, x + P(8), y + P(44), C.medWood);
  drawBox(g, x + P(2), y + P(48), C.wood);
  drawBox(g, x + P(8), y + P(50), C.lightWood);

  // Papers
  drawPapers(g, x + P(38), y + P(9));
  drawPapers(g, x + P(28), y + P(28));

  // Plants
  drawPlantSmall(g, x + w - P(5), y + h - P(9));
  drawPlantLarge(g, x + w - P(9), y + P(22));
}

/** Thinking/Meeting Room — round table, whiteboards, cozy carpet */
function decorateThinking(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawWarmCarpet(g, x, y, w, h);

  // Large round conference table
  drawRoundTable(g, x + w / 2, y + h / 2 - P(2), P(20));

  // 6 chairs around table
  drawChair(g, x + w / 2 - P(14), y + h / 2 - P(13));  // top-left
  drawChair(g, x + w / 2 + P(9), y + h / 2 - P(13));   // top-right
  drawChair(g, x + w / 2 - P(18), y + h / 2 - P(3));   // left
  drawChair(g, x + w / 2 + P(14), y + h / 2 - P(3));   // right
  drawChair(g, x + w / 2 - P(14), y + h / 2 + P(8));   // bottom-left
  drawChair(g, x + w / 2 + P(9), y + h / 2 + P(8));    // bottom-right

  // Whiteboard main
  drawWhiteboard(g, x + P(4), y + P(7), P(26), P(14));
  // Whiteboard secondary
  drawWhiteboard(g, x + P(34), y + P(7), P(22), P(14));

  // Painting on right wall
  drawPainting(g, x + w - P(16), y + P(7), P(12), P(8));

  // Table props
  drawPapers(g, x + w / 2 - P(5), y + h / 2 - P(4));
  drawCoffeeCup(g, x + w / 2 + P(3), y + h / 2 - P(2));
  drawCoffeeCup(g, x + w / 2 - P(8), y + h / 2 + P(2));

  // Plants in corners
  drawPlantLarge(g, x + P(2), y + h - P(14));
  drawPlantLarge(g, x + w - P(9), y + h - P(14));
}

/** Messaging/Lounge — sofas, coffee table, warm green carpet */
function decorateMessaging(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawGreenCarpet(g, x, y, w, h);

  // Painting on wall
  drawPainting(g, x + P(10), y + P(7), P(16), P(9));

  // Bookshelf on left
  drawBookshelf(g, x + P(2), y + P(7), false);

  // Main sofa
  drawSofa(g, x + P(3), y + P(22), P(18));

  // Coffee table in front of sofa
  drawSmallTable(g, x + P(5), y + P(34), P(14), P(6));
  drawCoffeeCup(g, x + P(9), y + P(35));
  drawCoffeeCup(g, x + P(14), y + P(35));
  drawPapers(g, x + P(7), y + P(36));

  // Second sofa / loveseat on right
  drawSofa(g, x + P(26), y + P(26), P(12));

  // Side table
  drawSmallTable(g, x + P(28), y + P(40), P(8), P(5));
  drawCoffeeCup(g, x + P(30), y + P(41));

  // Plants
  drawPlantLarge(g, x + P(2), y + h - P(13));
  drawPlantSmall(g, x + w - P(5), y + P(7));
  drawPlantSmall(g, x + P(2), y + P(7) + P(6));

  // Wall clock
  drawClock(g, x + w - P(9), y + P(8));
}

/** Spawn/Lobby — portal, welcome mat, dramatic dark floor */
function decorateSpawn(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawDarkFloor(g, x, y, w, h);

  // Portal in center
  drawPortalEffect(g, x + w / 2, y + h / 2 - P(4));

  // Welcome mat
  const matX = x + (w - P(16)) / 2;
  const matY = y + h - P(14);
  px(g, matX, matY, P(16), P(5), C.carpetWarm);
  px(g, matX + PX, matY + PX, P(14), P(3), C.carpetWarmDot);
  px(g, matX, matY, P(16), PX, C.couchSeat);
  px(g, matX, matY + P(4), P(16), PX, C.couchSeat);

  // Flanking plants
  drawPlantSmall(g, x + P(2), y + P(10));
  drawPlantSmall(g, x + w - P(5), y + P(10));
  drawPlantLarge(g, x + P(2), y + h - P(14));
  drawPlantLarge(g, x + w - P(9), y + h - P(14));

  // Decorative lights
  for (let i = 0; i < 4; i++) {
    px(g, x + P(4) + i * P(7), y + P(8), PX, PX, C.portalGlow);
    px(g, x + P(4) + i * P(7), y + P(8) - 1, PX, 1, C.portalLight);
  }
}

/** Idle/Break Room — kitchen, vending, dining tables, tile floor */
function decorateIdle(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawTileFloor(g, x, y, w, h);

  // Kitchen counter across top
  drawCounter(g, x + P(2), y + P(7), P(30));
  drawCoffeeMachine(g, x + P(4), y + P(2));
  drawCoffeeCup(g, x + P(10), y + P(4));

  // Fridge
  drawFridge(g, x + P(34), y + P(7));

  // Vending machine
  drawVendingMachine(g, x + w - P(11), y + P(7));

  // Water cooler
  drawWaterCooler(g, x + P(45), y + P(7));

  // Dining table 1
  drawRoundTable(g, x + P(18), y + P(36), P(11));
  drawChair(g, x + P(10), y + P(32));
  drawChair(g, x + P(22), y + P(32));
  drawChair(g, x + P(10), y + P(41));
  drawChair(g, x + P(22), y + P(41));
  drawCoffeeCup(g, x + P(17), y + P(35));

  // Dining table 2
  drawRoundTable(g, x + P(48), y + P(36), P(11));
  drawChair(g, x + P(40), y + P(32));
  drawChair(g, x + P(52), y + P(32));
  drawChair(g, x + P(40), y + P(41));
  drawChair(g, x + P(52), y + P(41));
  drawCoffeeCup(g, x + P(47), y + P(35));

  // Wall clock
  drawClock(g, x + P(58), y + P(8));

  // Plants
  drawPlantSmall(g, x + P(2), y + h - P(9));
  drawPlantSmall(g, x + w - P(5), y + h - P(9));
}

/** Tasks/Project Room — kanban, sticky notes, workstations */
function decorateTasks(g: Graphics, x: number, y: number, w: number, h: number): void {
  drawGreyCarpet(g, x, y, w, h);

  // Large Kanban board
  drawKanbanBoard(g, x + P(2), y + P(7), P(32), P(20));

  // Sticky notes cluster
  const noteColors = [C.stickyYellow, C.stickyPink, C.stickyGreen, C.stickyBlue, C.stickyOrange, C.stickyPurple];
  for (let i = 0; i < 6; i++) {
    const nx = x + P(38) + (i % 3) * P(5);
    const ny = y + P(7) + Math.floor(i / 3) * P(5);
    drawStickyNote(g, nx, ny, noteColors[i]);
  }

  // Laptop desk
  drawLaptopDesk(g, x + P(4), y + P(34));
  drawChair(g, x + P(7), y + P(45));

  // Standing desk with monitor
  drawDeskWithMonitor(g, x + P(30), y + P(34));
  drawChair(g, x + P(34), y + P(45));

  // Papers
  drawPapers(g, x + P(46), y + P(36));

  // Whiteboard (smaller)
  drawWhiteboard(g, x + P(52), y + P(7), P(14), P(12));

  // Plants
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
