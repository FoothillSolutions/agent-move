import { ZONES, GRID_COLS, ROW_WEIGHTS, updateWorldExports } from '@agent-move/shared';

const MIN_ZONE_W = 120;
const MIN_ZONE_H = 100;
const EDGE_PAD = 48;  // Outdoor border space (for trees/grass)
const GAP = 4;        // Thin shared-wall gap between rooms

/**
 * Responsive bento-grid layout engine.
 * Computes zone positions/sizes to fill the available viewport.
 * Mutates the ZONES array in-place so existing code (ZoneRenderer.rebuild()) works.
 */
export class LayoutEngine {
  private lastW = 0;
  private lastH = 0;

  /**
   * Recompute layout for the given viewport size.
   * Returns { worldWidth, worldHeight } of the computed layout.
   */
  computeLayout(viewportW: number, viewportH: number): { worldWidth: number; worldHeight: number } {
    // Ensure minimum size
    const w = Math.max(viewportW, MIN_ZONE_W * 3 + GAP * 4 + EDGE_PAD * 2);
    const h = Math.max(viewportH, MIN_ZONE_H * 3 + GAP * 4 + EDGE_PAD * 2);

    if (w === this.lastW && h === this.lastH) {
      return { worldWidth: w, worldHeight: h };
    }
    this.lastW = w;
    this.lastH = h;

    const totalRowWeight = ROW_WEIGHTS.reduce((s, v) => s + v, 0);
    const availableW = w - EDGE_PAD * 2 - GAP * (GRID_COLS - 1);
    const availableH = h - EDGE_PAD * 2 - GAP * (ROW_WEIGHTS.length - 1);
    const colUnit = availableW / GRID_COLS;

    // Compute row heights from weights
    const rowHeights = ROW_WEIGHTS.map(weight =>
      Math.max(MIN_ZONE_H, (weight / totalRowWeight) * availableH)
    );

    // Compute row y positions
    const rowYs: number[] = [];
    let cy = EDGE_PAD;
    for (let r = 0; r < ROW_WEIGHTS.length; r++) {
      rowYs.push(cy);
      cy += rowHeights[r] + GAP;
    }

    // Update each zone
    for (const zone of ZONES) {
      zone.x = EDGE_PAD + zone.colStart * (colUnit + GAP);
      zone.y = rowYs[zone.rowStart];
      zone.width = Math.max(MIN_ZONE_W, zone.colSpan * colUnit + (zone.colSpan - 1) * GAP);
      zone.height = Math.max(MIN_ZONE_H, rowHeights[zone.rowStart] * zone.rowSpan + (zone.rowSpan - 1) * GAP);
    }

    updateWorldExports(w, h);
    return { worldWidth: w, worldHeight: h };
  }

  /** Force recalculation on next call */
  invalidate(): void {
    this.lastW = 0;
    this.lastH = 0;
  }
}
