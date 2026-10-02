import { canvasFamily, fraunces, inter } from "@/app/fonts";
import { drawMatrix, drawShape, shapeWidth } from "@/lib/brand/canvas";
import { MATRIX_SPRAY, MATRIX_STAR } from "@/lib/brand/matrix";
import {
  braceClose,
  braceOpen,
  bracketClose,
  bracketOpen,
  logoPrimary,
  logoTertiary,
  star,
  type BrandShape,
} from "@/lib/brand/shapes";
import { coverCrop } from "./capture";
import {
  printLayout,
  SHEET_H,
  SHEET_W,
  type Panel,
  type PrintLayout,
  type PrintMode,
  type Rect,
} from "./layouts";

export const BRAND = {
  blue: "#0278FF",
  orange: "#FF5D0B",
  yellow: "#F9B200",
  white: "#ECECEF",
  black: "#101A21",
} as const;

export type FrameId = "stormy" | "sparky" | "orange" | "clean";
export type OtterId = "sparky" | "stormy" | "pink";

export interface FrameInfo {
  id: FrameId;
  label: string;
  /** Sheet background. */
  bg: string;
  /** Footer text / logo colour. */
  fg: string;
  /** Otter in the footer, paired as in the brand posts. */
  otter: OtterId | null;
}

export const FRAMES: FrameInfo[] = [
  // Pink otter + [ ]; on blue, as in "Applications Open Now".
  { id: "stormy", label: "Stormy", bg: BRAND.blue, fg: BRAND.white, otter: "pink" },
  // Blue otter on yellow (dynamic loops post 2), with orange {i++;} matrices.
  { id: "sparky", label: "Sparky", bg: BRAND.yellow, fg: BRAND.black, otter: "stormy" },
  // Yellow otter + { }; on orange (dynamic loops post 1).
  { id: "orange", label: "Orange", bg: BRAND.orange, fg: BRAND.black, otter: "sparky" },
  { id: "clean", label: "Clean", bg: BRAND.white, fg: BRAND.black, otter: null },
];

export function frameInfo(id: FrameId): FrameInfo {
  return FRAMES.find((f) => f.id === id)!;
}

const DATE_LEFT = "Oct 3 + 4";
const DATE_RIGHT = "SFU Burnaby";

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

const otterSrc = (id: OtterId) => `/brand/otter-${id}.png`;

/** Fonts and images must be ready before drawing or canvas silently falls back. */
export async function preparePrintAssets(): Promise<void> {
  await Promise.all([
    document.fonts.load(`800 40px ${canvasFamily(fraunces)}`),
    document.fonts.load(`500 40px ${canvasFamily(inter)}`),
    loadImage("/brand/grain.png"),
    ...FRAMES.flatMap((f) => (f.otter ? [loadImage(otterSrc(f.otter))] : [])),
  ]);
}

interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  layout: PrintLayout;
  frame: FrameInfo;
  display: string;
  body: string;
  otter: HTMLImageElement | null;
}

function drawGrain(ctx: CanvasRenderingContext2D, grain: HTMLImageElement | null) {
  if (!grain) return;
  const pattern = ctx.createPattern(grain, "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);
  ctx.restore();
}

function drawPhoto(
  ctx: CanvasRenderingContext2D,
  photo: CanvasImageSource & { width: number; height: number },
  cell: Rect,
  radius: number
) {
  const { sx, sy, sw, sh } = coverCrop(photo.width, photo.height, cell.w / cell.h);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cell.x, cell.y, cell.w, cell.h, radius);
  ctx.clip();
  ctx.drawImage(photo, sx, sy, sw, sh, cell.x, cell.y, cell.w, cell.h);
  ctx.restore();
}

/** "Oct 3 + 4 ✺ SFU Burnaby" at `size`; returns its width, draws only when `at` is given. */
function dateLine(d: DrawCtx, size: number, at?: { x: number; midY: number }): number {
  const { ctx } = d;
  ctx.font = `500 ${size}px ${d.body}`;
  const starH = size * 0.82;
  const gap = size * 0.42;
  const a = ctx.measureText(DATE_LEFT).width;
  const b = ctx.measureText(DATE_RIGHT).width;
  const starW = shapeWidth(star, starH);
  if (at) {
    ctx.fillStyle = d.frame.fg;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(DATE_LEFT, at.x, at.midY);
    drawShape(ctx, star, at.x + a + gap, at.midY - starH / 2, starH, d.frame.fg);
    ctx.fillText(DATE_RIGHT, at.x + a + gap + starW + gap, at.midY);
  }
  return a + gap + starW + gap + b;
}

/** Largest text size ≤ max whose date line fits `width`. */
function fitDateSize(d: DrawCtx, max: number, width: number): number {
  let size = max;
  while (size > 20 && dateLine(d, size) > width) size -= 1;
  return size;
}

/**
 * Footer art: the frame's otter rising from the bottom edge of the sheet,
 * framed by its loops (opener behind, closer in front) or code matrices.
 * Returns the x where the art begins so the text block can stay clear of it.
 */
function drawFooterArt(d: DrawCtx, panel: Panel): number {
  const { ctx, frame, otter } = d;
  const f = panel.footer;
  const panelRight = panel.bounds.x + panel.bounds.w;
  if (!frame.otter || !otter) return panelRight;

  const grid = d.layout.mode === "grid";
  const oh = Math.round(f.h * (grid ? 0.92 : 0.76));
  const ow = (oh * otter.width) / otter.height;
  // Full-body Sparky stands on the edge; the half-body otters are cut by it.
  const fullBody = frame.otter === "sparky";
  const oy = SHEET_H - oh - (fullBody ? 10 : 0);
  const edge = grid ? 40 : 8;

  const loop = (open: BrandShape, close: BrandShape, color: string) => {
    // Closer overlaps the otter's right side but must stay on the sheet.
    const ch = oh * 0.55;
    const cw = shapeWidth(close, ch);
    const ox = panelRight - edge - ow - cw * 0.58;
    const lh = oh * 0.62;
    const lw = shapeWidth(open, lh);
    drawShape(ctx, open, ox - lw * 0.5, oy + oh * 0.12, lh, color);
    ctx.drawImage(otter, ox, oy, ow, oh);
    drawShape(ctx, close, ox + ow - cw * 0.42, oy + oh * 0.42, ch, color);
    return ox - lw * 0.5;
  };

  switch (frame.id) {
    case "stormy":
      return loop(bracketOpen, bracketClose, "#FFFFFF");
    case "orange":
      return loop(braceOpen, braceClose, BRAND.white);
    case "sparky": {
      // Matrices in the gap between the otter and the background.
      const ox = panelRight - edge - ow - (grid ? oh * 0.3 : 0);
      const mh = oh * 0.95;
      const mw = (mh * (MATRIX_STAR.maxX - MATRIX_STAR.minX)) / (MATRIX_STAR.maxY - MATRIX_STAR.minY);
      const mx = ox - mw * 0.62;
      drawMatrix(ctx, MATRIX_STAR, mx, oy + oh * 0.04, mh, BRAND.orange, BRAND.black, d.display);
      ctx.drawImage(otter, ox, oy, ow, oh);
      if (grid) {
        const sh = oh * 0.55;
        drawMatrix(ctx, MATRIX_SPRAY, ox + ow * 0.78, oy + oh * 0.38, sh, BRAND.orange, BRAND.black, d.display);
      }
      return mx;
    }
    default:
      return panelRight;
  }
}

/** Logo + date, left-aligned and stacked (or in a row when there's room and no art). */
function drawFooterText(d: DrawCtx, panel: Panel, artX: number) {
  const { ctx, frame } = d;
  const f = panel.footer;
  const grid = d.layout.mode === "grid";
  const clean = frame.id === "clean";
  const logo = clean ? logoPrimary : logoTertiary;
  const logoColor = clean ? BRAND.blue : frame.fg;
  const room = Math.min(f.x + f.w, artX - 24) - f.x;
  // Visual middle of the band, ignoring the bottom bleed margin.
  const mid = f.y + (f.h - (grid ? 36 : 30)) / 2 + 6;

  let logoH = grid ? (clean ? 48 : 64) : clean ? 34 : 44;
  while (shapeWidth(logo, logoH) > room) logoH -= 1;
  const logoW = shapeWidth(logo, logoH);
  const maxText = grid ? 34 : 26;

  if (!frame.otter && dateLine(d, maxText) + logoW + 40 <= f.w) {
    drawShape(ctx, logo, f.x, mid - logoH / 2, logoH, logoColor);
    const w = dateLine(d, maxText);
    dateLine(d, maxText, { x: f.x + f.w - w, midY: mid });
    return;
  }

  const textSize = fitDateSize(d, maxText, room);
  const gap = textSize * 0.6;
  const top = mid - (logoH + gap + textSize) / 2;
  drawShape(ctx, logo, f.x, top, logoH, logoColor);
  dateLine(d, textSize, { x: f.x, midY: top + logoH + gap + textSize / 2 });
}

function drawCutGuides(d: DrawCtx) {
  const { ctx } = d;
  ctx.save();
  ctx.strokeStyle = d.frame.fg;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  for (const x of d.layout.cuts) {
    for (const [y0, y1] of [[0, 18], [SHEET_H - 18, SHEET_H]] as const) {
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export interface RenderPrintOptions {
  mode: PrintMode;
  frame: FrameId;
  /** Four photos in shot order, any size; they're cover-cropped into cells. */
  photos: (CanvasImageSource & { width: number; height: number })[];
  /** 1 = full 1200×1800 print; smaller for on-screen previews. */
  scale?: number;
}

/** Compose the 4×6 print. */
export async function renderPrint({
  mode,
  frame: frameId,
  photos,
  scale = 1,
}: RenderPrintOptions): Promise<HTMLCanvasElement> {
  await preparePrintAssets();
  const layout = printLayout(mode);
  const frame = frameInfo(frameId);
  const [grain, otter] = await Promise.all([
    loadImage("/brand/grain.png"),
    frame.otter ? loadImage(otterSrc(frame.otter)) : Promise.resolve(null),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(SHEET_W * scale);
  canvas.height = Math.round(SHEET_H * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.imageSmoothingQuality = "high";

  const d: DrawCtx = {
    ctx,
    layout,
    frame,
    display: canvasFamily(fraunces),
    body: canvasFamily(inter),
    otter,
  };

  ctx.fillStyle = frame.bg;
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);
  if (frame.id !== "clean") drawGrain(ctx, grain);

  for (const panel of layout.panels) {
    // Clip to the panel so the two strips cut cleanly.
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.bounds.x, panel.bounds.y, panel.bounds.w, panel.bounds.h);
    ctx.clip();
    panel.cells.forEach((cell, i) => {
      const photo = photos[i];
      if (photo) drawPhoto(ctx, photo, cell, layout.radius);
    });
    const artX = drawFooterArt(d, panel);
    drawFooterText(d, panel, artX);
    ctx.restore();
  }
  drawCutGuides(d);
  return canvas;
}

/** JPEG data URL for the print server / share upload. */
export function printToDataUrl(canvas: HTMLCanvasElement, quality = 0.95): string {
  return canvas.toDataURL("image/jpeg", quality);
}
