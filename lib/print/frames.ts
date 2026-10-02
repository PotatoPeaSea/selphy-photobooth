import { canvasFamily, fraunces, inter } from "@/app/fonts";
import { drawMatrix, drawShape, shapeWidth } from "@/lib/brand/canvas";
import { MATRIX_SPRAY, MATRIX_STAR, type Matrix } from "@/lib/brand/matrix";
import {
  braceClose,
  braceOpen,
  bracketClose,
  bracketOpen,
  bracketX3,
  logoPrimary,
  logoTertiary,
  star,
  type BrandShape,
} from "@/lib/brand/shapes";
import { coverCrop } from "./capture";
import {
  printLayout,
  PRINTER_H,
  PRINTER_W,
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

export type FrameId = "stormy" | "sparky" | "orange" | "clean" | "garden" | "crew" | "hacker";

/** Illustrations cut from the brand guide, in public/brand/. */
export type ArtImage =
  | "otter-sparky"
  | "otter-stormy"
  | "otter-pink"
  | "otter-sparky-vr"
  | "otter-stormy-walk"
  | "daisy-1"
  | "daisy-2"
  | "daisy-3"
  | "daisy-4"
  | "bush-1"
  | "bush-2"
  | "bush-3";

export interface FrameInfo {
  id: FrameId;
  label: string;
  /** Sheet background. */
  bg: string;
  /** Footer text / logo colour. */
  fg: string;
  /** Character shown on swatches and the done screen. */
  mascot: ArtImage;
  /** Images the frame's artwork draws. */
  images: ArtImage[];
}

export const FRAMES: FrameInfo[] = [
  // Pink otter + [ ]; on blue, as in "Applications Open Now".
  { id: "stormy", label: "Stormy", bg: BRAND.blue, fg: BRAND.white, mascot: "otter-pink", images: ["otter-pink"] },
  // Blue otter on yellow (dynamic loops post 2), with orange {i++;} matrices.
  { id: "sparky", label: "Sparky", bg: BRAND.yellow, fg: BRAND.black, mascot: "otter-stormy", images: ["otter-stormy"] },
  // Yellow otter + { }; on orange (dynamic loops post 1).
  { id: "orange", label: "Orange", bg: BRAND.orange, fg: BRAND.black, mascot: "otter-sparky", images: ["otter-sparky"] },
  { id: "clean", label: "Clean", bg: BRAND.white, fg: BRAND.black, mascot: "otter-sparky", images: [] },
  // Bushes, daisies and both otters from the landing-page illustration.
  {
    id: "garden",
    label: "Garden",
    bg: BRAND.blue,
    fg: BRAND.white,
    mascot: "otter-sparky",
    images: ["otter-sparky", "otter-stormy-walk", "bush-1", "bush-2", "bush-3", "daisy-1", "daisy-3", "daisy-4"],
  },
  // The whole otter crew behind [[[ ]]];.
  {
    id: "crew",
    label: "Crew",
    bg: BRAND.white,
    fg: BRAND.black,
    mascot: "otter-pink",
    images: ["otter-pink", "otter-stormy", "otter-sparky-vr"],
  },
  // Code-matrices post: Stormy Blue dots, orange {i++;}, VR Sparky.
  { id: "hacker", label: "Hacker", bg: BRAND.black, fg: BRAND.white, mascot: "otter-sparky-vr", images: ["otter-sparky-vr"] },
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

export const artSrc = (name: ArtImage) => `/brand/${name}.png`;

/** Fonts and images must be ready before drawing or canvas silently falls back. */
export async function preparePrintAssets(): Promise<void> {
  const names = new Set(FRAMES.flatMap((f) => f.images));
  await Promise.all([
    document.fonts.load(`800 40px ${canvasFamily(fraunces)}`),
    document.fonts.load(`500 40px ${canvasFamily(inter)}`),
    loadImage("/brand/grain.png"),
    ...[...names].map((n) => loadImage(artSrc(n))),
  ]);
}

interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  layout: PrintLayout;
  frame: FrameInfo;
  display: string;
  body: string;
  images: Partial<Record<ArtImage, HTMLImageElement>>;
}

function drawGrain(ctx: CanvasRenderingContext2D, grain: HTMLImageElement | null, w: number, h: number) {
  if (!grain) return;
  const pattern = ctx.createPattern(grain, "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
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

// ---------------------------------------------------------------- text

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

function fitDateSize(d: DrawCtx, max: number, width: number): number {
  let size = max;
  while (size > 20 && dateLine(d, size) > width) size -= 1;
  return size;
}

/**
 * Logo over the date line. `align` "left" anchors at x, "center" centres in
 * `width`. Returns the block's bottom y.
 */
function drawTextBlock(
  d: DrawCtx,
  x: number,
  top: number,
  width: number,
  align: "left" | "center",
  sizes: { logo: number; date: number }
): number {
  const clean = d.frame.id === "clean";
  const logo = clean ? logoPrimary : logoTertiary;
  const logoColor = clean ? BRAND.blue : d.frame.fg;
  let logoH = sizes.logo;
  while (shapeWidth(logo, logoH) > width) logoH -= 1;
  const logoW = shapeWidth(logo, logoH);
  const dateSize = fitDateSize(d, sizes.date, width);
  const dateW = dateLine(d, dateSize);
  const lx = align === "left" ? x : x + (width - logoW) / 2;
  const dx = align === "left" ? x : x + (width - dateW) / 2;
  drawShape(d.ctx, logo, lx, top, logoH, logoColor);
  const gap = dateSize * 0.6;
  dateLine(d, dateSize, { x: dx, midY: top + logoH + gap + dateSize / 2 });
  return top + logoH + gap + dateSize;
}

// ---------------------------------------------------------------- artwork

/**
 * Each artwork is a composition measured in otter-heights (`u`): `width`
 * is its width at u = 1, `draw` paints it with its bottom edge on `bottom`,
 * horizontally centred on `cx`.
 */
interface Art {
  width: number;
  /** Fraction of the box height the tallest element may use. */
  height: number;
  draw: (d: DrawCtx, cx: number, bottom: number, u: number) => void;
}

const aspect = (img: HTMLImageElement | undefined) => (img ? img.width / img.height : 0.8);

function img(d: DrawCtx, name: ArtImage, x: number, y: number, h: number) {
  const i = d.images[name];
  if (i) d.ctx.drawImage(i, x, y, h * aspect(i), h);
}

function matrixWidth(m: Matrix) {
  return (m.maxX - m.minX) / (m.maxY - m.minY);
}

/** Otter framed by a dynamic loop: opener behind, closer in front. */
function loopsArt(otter: ArtImage, open: BrandShape, close: BrandShape, color: string, a: number): Art {
  const lw = shapeWidth(open, 0.62);
  const cw = shapeWidth(close, 0.55);
  return {
    width: a + lw * 0.5 + cw * 0.58,
    height: 0.9,
    draw(d, cx, bottom, u) {
      const left = cx - (this.width * u) / 2;
      const ox = left + lw * 0.5 * u;
      const fullBody = otter === "otter-sparky";
      const oy = bottom - u - (fullBody ? u * 0.04 : 0);
      drawShape(d.ctx, open, ox - lw * 0.5 * u, oy + u * 0.12, u * 0.62, color);
      img(d, otter, ox, oy, u);
      drawShape(d.ctx, close, ox + a * u - cw * 0.42 * u, oy + u * 0.42, u * 0.55, color);
    },
  };
}

/** Otter in front of a code matrix, as in the code-matrices post. */
function matrixArt(otter: ArtImage, a: number, dot: string, label: string, spray: boolean): Art {
  const mw = matrixWidth(MATRIX_STAR) * 0.95;
  const sw = matrixWidth(MATRIX_SPRAY) * 0.5;
  return {
    width: a + mw * 0.62 + (spray ? sw * 0.6 : 0),
    height: 0.92,
    draw(d, cx, bottom, u) {
      const left = cx - (this.width * u) / 2;
      const ox = left + mw * 0.62 * u;
      const oy = bottom - u;
      drawMatrix(d.ctx, MATRIX_STAR, left, oy + u * 0.04, u * 0.95, dot, label, d.display);
      img(d, otter, ox, oy, u);
      if (spray) drawMatrix(d.ctx, MATRIX_SPRAY, ox + a * u * 0.82, oy + u * 0.4, u * 0.5, dot, label, d.display);
    },
  };
}

/** Sparky with boba among the landing-page bushes and daisies, Stormy wandering behind. */
function gardenArt(): Art {
  return {
    width: 1.75,
    height: 0.92,
    draw(d, cx, bottom, u) {
      const left = cx - (this.width * u) / 2;
      img(d, "bush-3", left + u * 0.75, bottom - u * 0.62, u * 0.5);
      img(d, "otter-stormy-walk", left + u * 0.05, bottom - u * 0.68, u * 0.52);
      img(d, "bush-2", left - u * 0.05, bottom - u * 0.36, u * 0.42);
      img(d, "otter-sparky", left + u * 0.55, bottom - u * 1.0, u);
      img(d, "daisy-4", left + u * 0.42, bottom - u * 0.62, u * 0.5);
      img(d, "bush-1", left + u * 0.1, bottom - u * 0.3, u * 0.36);
      img(d, "daisy-1", left + u * 1.38, bottom - u * 0.72, u * 0.64);
      img(d, "daisy-3", left + u * 0.02, bottom - u * 0.5, u * 0.42);
    },
  };
}

/** Pink, Stormy and VR Sparky together behind a [[[ ]]]; loop. */
function crewArt(d: DrawCtx): Art {
  const ap = aspect(d.images["otter-pink"]);
  const as = aspect(d.images["otter-stormy"]);
  const av = aspect(d.images["otter-sparky-vr"]);
  const back = 0.8;
  const width = ap * back * 0.72 + av + as * back * 0.72;
  return {
    width,
    height: 0.95,
    draw(d, cx, bottom, u) {
      const left = cx - (width * u) / 2;
      const loopH = u * 0.52;
      const loopW = shapeWidth(bracketX3, loopH);
      drawShape(d.ctx, bracketX3, cx - loopW / 2, bottom - u * 1.02, loopH, BRAND.blue);
      img(d, "otter-pink", left, bottom - u * back, u * back);
      img(d, "otter-stormy", left + width * u - as * back * u, bottom - u * back, u * back);
      img(d, "otter-sparky-vr", left + ap * back * 0.72 * u, bottom - u * 0.98, u * 0.98);
    },
  };
}

function artFor(d: DrawCtx): Art | null {
  const a = (n: ArtImage) => aspect(d.images[n]);
  switch (d.frame.id) {
    case "stormy":
      return loopsArt("otter-pink", bracketOpen, bracketClose, "#FFFFFF", a("otter-pink"));
    case "orange":
      return loopsArt("otter-sparky", braceOpen, braceClose, BRAND.white, a("otter-sparky"));
    case "sparky":
      return matrixArt("otter-stormy", a("otter-stormy"), BRAND.orange, BRAND.black, d.layout.mode === "grid");
    case "hacker":
      return matrixArt("otter-sparky-vr", a("otter-sparky-vr"), BRAND.blue, BRAND.orange, true);
    case "garden":
      return gardenArt();
    case "crew":
      return crewArt(d);
    case "clean":
      return null;
  }
}

/**
 * Fit `art` into `box`, bottom-aligned to the sheet edge. `overflow` lets the
 * composition run past the box sides by that fraction of its width (it is
 * drawn before the photos, so spill on the left tucks behind them).
 */
function placeArt(d: DrawCtx, art: Art, box: Rect, sheetBottom: number, overflow = 0, shift = 0) {
  const u = Math.min(box.h * art.height, box.w / (art.width * (1 - overflow)));
  art.draw(d, box.x + box.w / 2 + shift * u, sheetBottom, u);
}

const STRIP_TEXT_W = 236;
const COLUMN_PAD = 28;
const COLUMN_TEXT = { logo: 54, date: 30 };

/** Frame artwork for one panel — drawn before the photos. */
function drawArt(d: DrawCtx, panel: Panel) {
  const art = artFor(d);
  if (!art) return;
  const b = panel.brand;
  const bottom = panel.bounds.y + panel.bounds.h;
  if (panel.brandSide === "bottom") {
    if (d.frame.id === "garden") img(d, "bush-1", panel.bounds.x - 30, bottom - b.h * 0.24, b.h * 0.3);
    const x = b.x + Math.min(STRIP_TEXT_W, b.w * 0.48) + 12;
    placeArt(d, art, { x, y: b.y + 8, w: panel.bounds.x + panel.bounds.w - x, h: b.h - 8 }, bottom);
    return;
  }
  // Column: art rises from the bottom edge under the logo block.
  const textBottom = b.y + 6 + COLUMN_TEXT.logo + COLUMN_TEXT.date * 1.6;
  const top = textBottom + 36;
  if (d.frame.id === "garden") img(d, "bush-1", b.x - 160, bottom - 120, 150);
  placeArt(d, art, { x: b.x, y: top, w: b.w, h: bottom - top }, bottom, 0.42, -0.02);
}

/** Logo + date for one panel — drawn after the photos. */
function drawText(d: DrawCtx, panel: Panel) {
  const b = panel.brand;
  const hasArt = artFor(d) !== null;
  if (panel.brandSide === "bottom") {
    const textW = hasArt ? Math.min(STRIP_TEXT_W, b.w * 0.48) : b.w;
    const mid = b.y + (b.h - 30) / 2 + 6;
    const blockH = 44 + 26 * 1.6;
    drawTextBlock(d, b.x, mid - blockH / 2, textW, "left", { logo: 44, date: 26 });
    return;
  }
  const x = b.x + COLUMN_PAD * 0.5;
  const w = b.w - COLUMN_PAD * 1.5;
  if (!hasArt) {
    // Clean: logo and date sit level with the bottom of the photos.
    const blockH = 40 + 30 * 1.6;
    drawTextBlock(d, x, panel.bounds.h - b.y - blockH, w, "center", { logo: 40, date: 30 });
    return;
  }
  drawTextBlock(d, x, b.y + 6, w, "center", COLUMN_TEXT);
}

function drawCutGuides(d: DrawCtx) {
  const { ctx } = d;
  ctx.save();
  ctx.strokeStyle = d.frame.fg;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  const h = d.layout.height;
  for (const x of d.layout.cuts) {
    for (const [y0, y1] of [[0, 18], [h - 18, h]] as const) {
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
  /** 1 = full 300 DPI print; smaller for on-screen previews. */
  scale?: number;
}

/**
 * Compose the 4×6 print, upright: portrait for strips, landscape for the
 * grid. Use `toPrinterDataUrl` for the printer.
 */
export async function renderPrint({
  mode,
  frame: frameId,
  photos,
  scale = 1,
}: RenderPrintOptions): Promise<HTMLCanvasElement> {
  await preparePrintAssets();
  const layout = printLayout(mode);
  const frame = frameInfo(frameId);
  const [grain, ...loaded] = await Promise.all([
    loadImage("/brand/grain.png"),
    ...frame.images.map((n) => loadImage(artSrc(n))),
  ]);
  const images: DrawCtx["images"] = {};
  frame.images.forEach((n, i) => {
    if (loaded[i]) images[n] = loaded[i]!;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.imageSmoothingQuality = "high";

  const d: DrawCtx = { ctx, layout, frame, display: canvasFamily(fraunces), body: canvasFamily(inter), images };

  ctx.fillStyle = frame.bg;
  ctx.fillRect(0, 0, layout.width, layout.height);
  if (frame.id !== "clean" && frame.id !== "crew") drawGrain(ctx, grain, layout.width, layout.height);

  for (const panel of layout.panels) {
    // Clip to the panel so the two strips cut cleanly.
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.bounds.x, panel.bounds.y, panel.bounds.w, panel.bounds.h);
    ctx.clip();
    drawArt(d, panel);
    panel.cells.forEach((cell, i) => {
      const photo = photos[i];
      if (photo) drawPhoto(ctx, photo, cell, layout.radius);
    });
    drawText(d, panel);
    ctx.restore();
  }
  drawCutGuides(d);
  return canvas;
}

/** JPEG of the print as composed (landscape grid stays landscape) — for sharing. */
export function printToDataUrl(canvas: HTMLCanvasElement, quality = 0.95): string {
  return canvas.toDataURL("image/jpeg", quality);
}

/** JPEG for the Selphy: always portrait 1200×1800, landscape sheets rotated 90°. */
export function toPrinterDataUrl(canvas: HTMLCanvasElement, quality = 0.95): string {
  if (canvas.height >= canvas.width) return printToDataUrl(canvas, quality);
  const out = document.createElement("canvas");
  out.width = PRINTER_W;
  out.height = PRINTER_H;
  const ctx = out.getContext("2d")!;
  ctx.translate(PRINTER_W, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, 0, 0, PRINTER_H, PRINTER_W);
  return out.toDataURL("image/jpeg", quality);
}
