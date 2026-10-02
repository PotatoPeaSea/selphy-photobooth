/**
 * Print geometry for the Canon Selphy 4×6″ (100 × 148 mm) sheet at 300 DPI.
 *
 * Two capture modes, both four 4:3 landscape shots (the camera is landscape):
 * - "strip": portrait sheet; photos stacked, duplicated into two identical
 *   2×6″ strips side by side (cut down the middle), brand band at the bottom.
 * - "grid": landscape sheet; 2×2 grid of big photos with a brand column on
 *   the right. Rotated to portrait only when sent to the printer.
 */

export const PRINT_DPI = 300;
/** The printer always receives a portrait 1200×1800 image. */
export const PRINTER_W = 1200;
export const PRINTER_H = 1800;
export const SHOT_COUNT = 4;

export type PrintMode = "strip" | "grid";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Photo width / height for each mode — the capture crop and the print cell. */
export const PHOTO_ASPECT: Record<PrintMode, number> = {
  strip: 4 / 3,
  grid: 4 / 3,
};

/** One branded panel: its photo cells and the area left for branding. */
export interface Panel {
  bounds: Rect;
  cells: Rect[];
  /** Branding area: a band under the photos (strip) or a column beside them (grid). */
  brand: Rect;
  brandSide: "bottom" | "right";
}

export interface PrintLayout {
  mode: PrintMode;
  /** Sheet size in its natural (upright) orientation. */
  width: number;
  height: number;
  panels: Panel[];
  /** x positions of cut guides (strip mode). */
  cuts: number[];
  /** Photo corner radius. */
  radius: number;
}

const STRIP_W = PRINTER_W / 2;
const STRIP_TOP = 36;
const STRIP_SIDE = 56;
const STRIP_GAP = 16;

function stripPanel(x0: number): Panel {
  const cellW = STRIP_W - STRIP_SIDE * 2;
  const cellH = Math.round(cellW / PHOTO_ASPECT.strip);
  const cells: Rect[] = [];
  for (let i = 0; i < SHOT_COUNT; i++) {
    cells.push({ x: x0 + STRIP_SIDE, y: STRIP_TOP + i * (cellH + STRIP_GAP), w: cellW, h: cellH });
  }
  const last = cells[SHOT_COUNT - 1]!;
  const brandY = last.y + last.h;
  return {
    bounds: { x: x0, y: 0, w: STRIP_W, h: PRINTER_H },
    cells,
    brand: { x: x0 + STRIP_SIDE, y: brandY, w: cellW, h: PRINTER_H - brandY },
    brandSide: "bottom",
  };
}

const GRID_W = PRINTER_H; // landscape
const GRID_H = PRINTER_W;
const GRID_MARGIN = 40;
const GRID_GAP = 18;
const GRID_COLUMN = 400;

function gridPanel(): Panel {
  const gridW = GRID_W - GRID_MARGIN - GRID_COLUMN;
  const cellW = Math.floor((gridW - GRID_GAP) / 2);
  const cellH = Math.round(cellW / PHOTO_ASPECT.grid);
  const y0 = Math.round((GRID_H - (cellH * 2 + GRID_GAP)) / 2);
  const cells: Rect[] = [];
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 2; col++)
      cells.push({
        x: GRID_MARGIN + col * (cellW + GRID_GAP),
        y: y0 + row * (cellH + GRID_GAP),
        w: cellW,
        h: cellH,
      });
  const right = GRID_MARGIN + cellW * 2 + GRID_GAP;
  return {
    bounds: { x: 0, y: 0, w: GRID_W, h: GRID_H },
    cells,
    brand: { x: right, y: y0, w: GRID_W - right, h: GRID_H - y0 },
    brandSide: "right",
  };
}

export function printLayout(mode: PrintMode): PrintLayout {
  if (mode === "strip") {
    return {
      mode,
      width: PRINTER_W,
      height: PRINTER_H,
      panels: [stripPanel(0), stripPanel(STRIP_W)],
      cuts: [STRIP_W],
      radius: 12,
    };
  }
  return { mode, width: GRID_W, height: GRID_H, panels: [gridPanel()], cuts: [], radius: 16 };
}
