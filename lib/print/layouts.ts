/**
 * Print geometry for the Canon Selphy 4×6″ (100 × 148 mm) sheet at 300 DPI.
 *
 * Two capture modes, both four shots:
 * - "strip": 4 × 4:3 landscape photos stacked, duplicated into two identical
 *   2×6″ strips side by side (cut down the middle).
 * - "grid": 2×2 grid of 2:3 portrait photos filling the sheet, with a slim
 *   branded footer band.
 */

export const PRINT_DPI = 300;
export const SHEET_W = 1200; // 4″
export const SHEET_H = 1800; // 6″
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
  grid: 2 / 3,
};

/** One branded panel: its photo cells and footer band, in sheet pixels. */
export interface Panel {
  bounds: Rect;
  cells: Rect[];
  footer: Rect;
}

export interface PrintLayout {
  mode: PrintMode;
  panels: Panel[];
  /** x positions of cut guides (strip mode). */
  cuts: number[];
  /** Photo corner radius. */
  radius: number;
}

const STRIP_W = SHEET_W / 2;
const STRIP_TOP = 36;
const STRIP_SIDE = 56;
const STRIP_GAP = 16;

function stripPanel(x0: number): Panel {
  const cellW = STRIP_W - STRIP_SIDE * 2;
  const cellH = Math.round(cellW / PHOTO_ASPECT.strip);
  const cells: Rect[] = [];
  for (let i = 0; i < SHOT_COUNT; i++) {
    cells.push({
      x: x0 + STRIP_SIDE,
      y: STRIP_TOP + i * (cellH + STRIP_GAP),
      w: cellW,
      h: cellH,
    });
  }
  const last = cells[SHOT_COUNT - 1]!;
  const footerY = last.y + last.h;
  return {
    bounds: { x: x0, y: 0, w: STRIP_W, h: SHEET_H },
    cells,
    footer: {
      x: x0 + STRIP_SIDE,
      y: footerY,
      w: cellW,
      h: SHEET_H - footerY,
    },
  };
}

const GRID_TOP = 40;
const GRID_GAP = 18;
const GRID_FOOTER = 210;

function gridPanel(): Panel {
  const cellH = Math.floor((SHEET_H - GRID_TOP - GRID_FOOTER - GRID_GAP) / 2);
  const cellW = Math.round(cellH * PHOTO_ASPECT.grid);
  const gridW = cellW * 2 + GRID_GAP;
  const x0 = Math.round((SHEET_W - gridW) / 2);
  const cells: Rect[] = [];
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 2; col++)
      cells.push({
        x: x0 + col * (cellW + GRID_GAP),
        y: GRID_TOP + row * (cellH + GRID_GAP),
        w: cellW,
        h: cellH,
      });
  const footerY = GRID_TOP + cellH * 2 + GRID_GAP;
  return {
    bounds: { x: 0, y: 0, w: SHEET_W, h: SHEET_H },
    cells,
    footer: { x: x0, y: footerY, w: gridW, h: SHEET_H - footerY },
  };
}

export function printLayout(mode: PrintMode): PrintLayout {
  if (mode === "strip") {
    return {
      mode,
      panels: [stripPanel(0), stripPanel(STRIP_W)],
      cuts: [STRIP_W],
      radius: 12,
    };
  }
  return { mode, panels: [gridPanel()], cuts: [], radius: 16 };
}
