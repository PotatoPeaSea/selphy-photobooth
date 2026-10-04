import QRCode from "qrcode";
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
  onePassword,
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

/** 1Password's navy and blue, taken from 1password.com's stylesheet. */
export const ONE_PASSWORD = {
  navy: "#172663",
  blue: "#145FE4",
  sky: "#85BEFF",
  cream: "#FFFEFB",
} as const;

export type FrameId = "stormy" | "sparky" | "orange" | "clean" | "garden" | "crew" | "hacker" | "onepassword";

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
  /** Sponsor whose mark sits beside the StormHacks logo (partnership lock-up). */
  sponsor?: Sponsor;
}

export interface Sponsor {
  name: string;
  mark: BrandShape;
  /** The mark as a coloured SVG, for the frame swatch. */
  src: string;
  /** Mark colour on the frame. */
  color: string;
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
  // Sponsor frame: a big 1Password keyhole in sky-blue [ ]; on their navy,
  // "1PASSWORD" round the borders and the partnership lock-up beside our logo.
  {
    id: "onepassword",
    label: "1Password",
    bg: ONE_PASSWORD.navy,
    fg: ONE_PASSWORD.cream,
    mascot: "otter-stormy",
    images: [],
    sponsor: { name: "1Password", mark: onePassword, src: "/brand/sponsor-1password.svg", color: ONE_PASSWORD.cream },
  },
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
  const names = new Set(FRAMES.flatMap((f) => frameImages(f.id)));
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
  /** Link for the small QR code under the logo, or null for none. */
  qrUrl: string | null;
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

/**
 * A sponsor's round mark, `size` across, centred on (cx, cy), in their blue
 * with a cream keyhole, framed by sky-blue [ ]; loops lapping its edges.
 */
function drawBigMark(d: DrawCtx, mark: BrandShape, cx: number, cy: number, size: number) {
  const { ctx } = d;
  drawShape(ctx, bracketOpen, cx - size * 0.66, cy - size * 0.5, size * 0.56, ONE_PASSWORD.sky);
  drawBigMarkDisc(d, mark, cx, cy, size);
  drawShape(ctx, bracketClose, cx + size * 0.12, cy + size * 0.06, size * 0.5, ONE_PASSWORD.sky);
}

/** The mark in their blue on a cream disc, so the keyhole reads as a cut-out. */
function drawBigMarkDisc(d: DrawCtx, mark: BrandShape, cx: number, cy: number, size: number) {
  const { ctx } = d;
  ctx.fillStyle = ONE_PASSWORD.cream;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
  ctx.fill();
  drawShape(ctx, mark, cx - shapeWidth(mark, size) / 2, cy - size / 2, size, ONE_PASSWORD.blue);
}

/** Left and right reach of drawBigMark's loops from its centre, per unit of size. */
const bigMarkReach = () => ({ left: 0.66, right: 0.12 + shapeWidth(bracketClose, 0.5) });

/** Strip band art: the big mark, its loops included in the width. */
function sponsorArt(mark: BrandShape): Art {
  return {
    width: 1.25,
    height: 0.86,
    draw(d, cx, bottom, u) {
      const r = bigMarkReach();
      const size = u * 0.86;
      // Centre the loops' full reach on cx, clear of the bottom edge (the printer may crop it).
      drawBigMark(d, mark, cx + ((r.left - r.right) * size) / 2, bottom - u * 0.62, size);
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
    case "onepassword":
      return sponsorArt(onePassword);
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
/** Strip logo + date when the QR code shares the band. */
const STRIP_TEXT_QR = { logo: 40, date: 22 };
/** QR side in the grid's brand column. */
const QR_COLUMN = 170;
const QR_GAP = { strip: 8, column: 24 };
/** Keep the QR this far from the sheet edge, clear of the borderless crop. */
const QR_EDGE = 28;
const COLUMN_PAD = 28;
const COLUMN_TEXT = { logo: 54, date: 30 };
const COLUMN_OVERFLOW = 0.42;
/** Sponsor lock-up: mark height, and the divider's length/gap around it. */
const LOCKUP = { strip: 34, gap: 14, rule: 3 };

/**
 * The sponsor's name repeated along a line of length `len` centred on
 * (cx, cy) and turned by `angle`, split by its mark, like security tape.
 */
function drawRun(d: DrawCtx, sponsor: Sponsor, cx: number, cy: number, len: number, size: number, angle: number) {
  const { ctx } = d;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.font = `800 ${size}px ${d.body}`;
  ctx.letterSpacing = `${size * 0.22}px`;
  const word = sponsor.name.toUpperCase();
  const wordW = ctx.measureText(word).width;
  const markH = size * 1.05;
  const markW = shapeWidth(sponsor.mark, markH);
  const gap = size * 0.9;
  const step = wordW + gap * 2 + markW;
  const n = Math.max(1, Math.floor((len + gap * 2 + markW) / step));
  let x = -(n * step - gap * 2 - markW) / 2;
  ctx.fillStyle = ONE_PASSWORD.sky;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    ctx.fillText(word, x, size * 0.04);
    x += wordW;
    if (i < n - 1) {
      drawShape(ctx, sponsor.mark, x + gap, -markH / 2, markH, ONE_PASSWORD.blue);
      x += gap * 2 + markW;
    }
  }
  ctx.letterSpacing = "0px";
  ctx.restore();
}

/**
 * Sponsor name runs round the photos — part of the frame, not an add-on.
 * Strips: across the top and up the outer margin. Grid: across the top.
 */
function drawSponsorBorder(d: DrawCtx, panel: Panel) {
  const sponsor = d.frame.sponsor;
  if (!sponsor) return;
  const first = panel.cells[0]!;
  const last = panel.cells[panel.cells.length - 1]!;
  const b = panel.bounds;
  const top = first.y - b.y;
  const photosRight = panel.cells[1]!.x + panel.cells[1]!.w;
  const acrossW = (panel.brandSide === "bottom" ? first.x + first.w : photosRight) - first.x;
  drawRun(d, sponsor, first.x + acrossW / 2, b.y + top / 2, acrossW, Math.min(22, top * 0.42), 0);
  if (panel.brandSide === "bottom") {
    const side = first.x - b.x;
    const len = last.y + last.h - first.y;
    drawRun(d, sponsor, b.x + side / 2, first.y + len / 2, len, Math.min(22, side * 0.42), -Math.PI / 2);
  }
}

/** Thin rule with rounded caps from (x0, y0) to (x1, y1), as in the brand's partner lock-ups. */
function drawDivider(d: DrawCtx, x0: number, y0: number, x1: number, y1: number) {
  const { ctx } = d;
  ctx.save();
  ctx.strokeStyle = d.frame.fg;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = LOCKUP.rule;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

/**
 * Sponsor mark + name at height `h`, vertically centred on `midY`. Returns
 * its width; draws only when `x` is given.
 */
function sponsorLockup(d: DrawCtx, sponsor: Sponsor, h: number, x?: number, midY = 0): number {
  const { ctx } = d;
  const size = h * 0.66;
  ctx.font = `700 ${size}px ${d.body}`;
  const markW = shapeWidth(sponsor.mark, h);
  const gap = h * 0.3;
  const w = markW + gap + ctx.measureText(sponsor.name).width;
  if (x !== undefined) {
    drawShape(ctx, sponsor.mark, x, midY - h / 2, h, sponsor.color);
    ctx.fillStyle = d.frame.fg;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(sponsor.name, x + markW + gap, midY + h * 0.03);
  }
  return w;
}

/**
 * Big lock-up for the grid column: the mark upright on top, the name turned
 * 90° reading down beneath it, as large as fits in `box`.
 */
function drawTallLockup(d: DrawCtx, sponsor: Sponsor, box: Rect) {
  const { ctx } = d;
  const fit = (f: number) => {
    ctx.font = `800 ${f}px ${d.body}`;
    const len = ctx.measureText(sponsor.name).width;
    const mark = Math.min(f * 1.3, box.w * 0.9);
    return { len, mark, gap: f * 0.35, total: mark + f * 0.35 + len };
  };
  let f = Math.min(box.w * 0.85, 240);
  let m = fit(f);
  while (m.total > box.h && f > 20) m = fit(--f);
  const cx = box.x + box.w / 2;
  const y0 = box.y + (box.h - m.total) / 2;
  drawBigMarkDisc(d, sponsor.mark, cx, y0 + m.mark / 2, m.mark);
  ctx.save();
  ctx.translate(cx, y0 + m.mark + m.gap);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = d.frame.fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(sponsor.name, 0, f * 0.04);
  ctx.restore();
}

/** Frame artwork for one panel — behind the photos in strips, over them in the grid. */
function drawArt(d: DrawCtx, panel: Panel) {
  const art = artFor(d);
  if (!art) return;
  const b = panel.brand;
  const bottom = panel.bounds.y + panel.bounds.h;
  if (panel.brandSide === "bottom") {
    if (d.frame.id === "garden") img(d, "bush-1", panel.bounds.x - 30, bottom - b.h * 0.24, b.h * 0.3);
    const x = b.x + Math.min(STRIP_TEXT_W, b.w * 0.48) + 12;
    // A sponsor's lock-up takes the top of the art box.
    const y = b.y + 8 + (d.frame.sponsor ? LOCKUP.strip + LOCKUP.gap : 0);
    placeArt(d, art, { x, y, w: panel.bounds.x + panel.bounds.w - x, h: bottom - y }, bottom);
    return;
  }
  // Column: art rises from the bottom edge under the logo block. The column
  // is narrow, so the art is drawn over the photos and may lap their edge.
  const textBottom = b.y + 6 + COLUMN_TEXT.logo + COLUMN_TEXT.date * 1.6;
  const top = d.qrUrl ? textBottom + QR_GAP.column * 2 + QR_COLUMN : textBottom + 36;
  if (d.frame.sponsor) {
    // Under the QR (or the date): the partner rule, then the big sideways
    // lock-up filling the rest of the column.
    const ruleTop = d.qrUrl ? textBottom + QR_GAP.column * 2 + QR_COLUMN : textBottom + 30;
    const x = b.x + COLUMN_PAD * 0.5;
    const w = b.w - COLUMN_PAD * 1.5;
    drawDivider(d, x + w * 0.2, ruleTop, x + w * 0.8, ruleTop);
    const y = ruleTop + LOCKUP.gap * 2;
    drawTallLockup(d, d.frame.sponsor, { x, y, w, h: bottom - QR_EDGE - y });
    return;
  }
  if (d.frame.id === "garden") img(d, "bush-1", b.x - 160, bottom - 120, 150);
  placeArt(d, art, { x: b.x, y: top, w: b.w, h: bottom - top }, bottom, COLUMN_OVERFLOW, -0.06);
}

/** Logo + date for one panel — drawn after the photos. */
function drawText(d: DrawCtx, panel: Panel) {
  const b = panel.brand;
  const hasArt = artFor(d) !== null;
  const sheetBottom = panel.bounds.y + panel.bounds.h;
  if (panel.brandSide === "bottom") {
    const textW = hasArt ? Math.min(STRIP_TEXT_W, b.w * 0.48) : b.w;
    const sponsor = d.frame.sponsor;
    if (sponsor) {
      // Lock-up beside the logo: a rule down the band, then the mark over the art.
      const rx = b.x + textW + 14;
      drawDivider(d, rx, b.y + 14, rx, sheetBottom - QR_EDGE - 6);
      const right = panel.bounds.x + panel.bounds.w - 16;
      const lw = sponsorLockup(d, sponsor, LOCKUP.strip);
      sponsorLockup(d, sponsor, LOCKUP.strip, rx + (right - rx - lw) / 2, b.y + 10 + LOCKUP.strip / 2);
    }
    if (d.qrUrl) {
      // Logo at the top of the band, QR under it filling the rest.
      const bottom = drawTextBlock(d, b.x, b.y + 10, textW, "left", STRIP_TEXT_QR);
      const y = bottom + QR_GAP.strip;
      drawQr(d, d.qrUrl, b.x, y, sheetBottom - QR_EDGE - y);
      return;
    }
    const mid = b.y + (b.h - 30) / 2 + 6;
    const blockH = 44 + 26 * 1.6;
    drawTextBlock(d, b.x, mid - blockH / 2, textW, "left", { logo: 44, date: 26 });
    return;
  }
  const x = b.x + COLUMN_PAD * 0.5;
  const w = b.w - COLUMN_PAD * 1.5;
  const qrX = x + (w - QR_COLUMN) / 2;
  if (!hasArt) {
    // Clean: logo and date sit level with the bottom of the photos, QR above them.
    const blockH = 40 + 30 * 1.6;
    const top = panel.bounds.h - b.y - blockH;
    drawTextBlock(d, x, top, w, "center", { logo: 40, date: 30 });
    if (d.qrUrl) drawQr(d, d.qrUrl, qrX, top - QR_GAP.column - QR_COLUMN, QR_COLUMN);
    return;
  }
  const bottom = drawTextBlock(d, x, b.y + 6, w, "center", COLUMN_TEXT);
  if (d.qrUrl) drawQr(d, d.qrUrl, qrX, bottom + QR_GAP.column, QR_COLUMN);
}

// ---------------------------------------------------------------- decor

/**
 * Optional event-strip extras drawn over the photos: die-cut stickers pinned
 * across the photo edges, tagline text down the side margin and brand
 * stars/dots scattered in the empty margins. Guests toggle each one at
 * review; with none on, the print is just the frame's band or column art.
 */
export type AddOn = "stickers" | "tagline" | "confetti";
export type AddOns = Record<AddOn, boolean>;

export const NO_ADDONS: AddOns = { stickers: false, tagline: false, confetti: false };
/** What each guest starts with; they can untick these at review. */
export const DEFAULT_ADDONS: AddOns = { stickers: false, tagline: true, confetti: true };

export const ADDONS: { id: AddOn; label: string }[] = [
  { id: "stickers", label: "Stickers" },
  { id: "tagline", label: "Tagline" },
  { id: "confetti", label: "Confetti" },
];

type StickerArt =
  | { kind: "image"; name: ArtImage }
  | { kind: "star"; color: string }
  /** A sponsor's round mark, its cut-outs backed in white. */
  | { kind: "mark"; shape: BrandShape; color: string }
  /** "{i++;}" chip, or other short `text`. */
  | { kind: "code"; bg: string; fg: string; text?: string };

interface Sticker {
  art: StickerArt;
  /** Cell the sticker is pinned to, and its centre as fractions of that cell. */
  cell: number;
  at: [number, number];
  /** Height as a fraction of a strip photo's height. */
  size: number;
  /** Tilt in degrees. */
  tilt: number;
}

interface Decor {
  stickers: Sticker[];
  /** Colours for the scattered stars and dots. */
  confetti: string[];
}

/** Sticker slots, alternating sides down the strip like a printed event strip. */
const pinA = (art: StickerArt): Sticker => ({ art, cell: 0, at: [0.92, 0.08], size: 0.3, tilt: 12 });
const pinB = (art: StickerArt): Sticker => ({ art, cell: 1, at: [0.93, 1.0], size: 0.5, tilt: -8 });
const pinC = (art: StickerArt): Sticker => ({ art, cell: 2, at: [0.07, 0.98], size: 0.46, tilt: 7 });
const image = (name: ArtImage): StickerArt => ({ kind: "image", name });
const starArt = (color: string): StickerArt => ({ kind: "star", color });
const code = (bg: string, fg: string, text?: string): StickerArt => ({ kind: "code", bg, fg, text });
const mark = (shape: BrandShape, color: string): StickerArt => ({ kind: "mark", shape, color });

const DECOR: Record<FrameId, Decor> = {
  stormy: {
    stickers: [pinA(starArt(BRAND.yellow)), pinB(image("otter-stormy-walk")), pinC(image("daisy-2"))],
    confetti: [BRAND.yellow, BRAND.white, BRAND.orange],
  },
  sparky: {
    stickers: [pinA(code(BRAND.black, BRAND.orange)), pinB(image("otter-pink")), pinC(image("daisy-1"))],
    confetti: [BRAND.blue, BRAND.orange, BRAND.white],
  },
  orange: {
    stickers: [pinA(starArt(BRAND.blue)), pinB(image("otter-sparky-vr")), pinC(image("daisy-3"))],
    confetti: [BRAND.yellow, BRAND.white, BRAND.blue],
  },
  clean: {
    stickers: [pinA(starArt(BRAND.orange)), pinB(image("otter-sparky")), pinC(image("daisy-2"))],
    confetti: [BRAND.blue, BRAND.orange, BRAND.yellow],
  },
  garden: {
    stickers: [pinA(image("daisy-4")), pinB(image("otter-pink")), pinC(image("otter-stormy"))],
    confetti: [BRAND.yellow, BRAND.white],
  },
  crew: {
    stickers: [pinA(starArt(BRAND.yellow)), pinB(image("daisy-1")), pinC(code(BRAND.blue, BRAND.white))],
    confetti: [BRAND.blue, BRAND.orange, BRAND.yellow],
  },
  hacker: {
    stickers: [pinA(code(BRAND.blue, BRAND.black)), pinB(image("otter-stormy")), pinC(starArt(BRAND.orange))],
    confetti: [BRAND.blue, BRAND.orange],
  },
  onepassword: {
    // Two keyhole stickers (kept upright) and a masked-password chip.
    stickers: [
      { ...pinA(mark(onePassword, ONE_PASSWORD.blue)), tilt: 0 },
      pinB(code(ONE_PASSWORD.blue, ONE_PASSWORD.cream, "••••••••")),
      { ...pinC(mark(onePassword, ONE_PASSWORD.navy)), tilt: 0 },
    ],
    confetti: [ONE_PASSWORD.blue, ONE_PASSWORD.sky, ONE_PASSWORD.cream],
  },
};

/** Every image a frame draws: its artwork plus its stickers. */
export function frameImages(id: FrameId): ArtImage[] {
  const names = new Set(frameInfo(id).images);
  for (const s of DECOR[id].stickers) if (s.art.kind === "image") names.add(s.art.name);
  return [...names];
}

const TAGLINE = ["West Canada’s Largest Hackathon", "Oct 3 + 4", "SFU Burnaby", "#StormHacks26"];

/** Seeded PRNG so both strips (and every reprint) scatter identically. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paint the sticker's art into a fresh canvas of height `h` (device px). */
function stickerBody(d: DrawCtx, art: StickerArt, h: number): HTMLCanvasElement | null {
  let w: number;
  if (art.kind === "image") {
    const i = d.images[art.name];
    if (!i) return null;
    w = h * aspect(i);
  } else if (art.kind === "star") w = shapeWidth(star, h);
  else if (art.kind === "mark") w = shapeWidth(art.shape, h);
  else w = h * 2.5;
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  const ctx = c.getContext("2d")!;
  if (art.kind === "image") ctx.drawImage(d.images[art.name]!, 0, 0, w, h);
  else if (art.kind === "star") drawShape(ctx, star, 0, 0, h, art.color);
  else if (art.kind === "mark") {
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.45, h * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    drawShape(ctx, art.shape, 0, 0, h, art.color);
  }
  else {
    ctx.fillStyle = art.bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, h * 0.28);
    ctx.fill();
    ctx.fillStyle = art.fg;
    ctx.font = `800 ${h * 0.56}px ${d.display}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(art.text ?? "{i++;}", w / 2, h * 0.53);
  }
  return c;
}

/** Fill `src`'s silhouette with `color`. */
function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

const stickerCache = new Map<string, HTMLCanvasElement | null>();

/** The art with a white die-cut border and a faint dark rim, at device resolution. */
function stickerCanvas(d: DrawCtx, art: StickerArt, h: number): HTMLCanvasElement | null {
  const key = `${art.kind === "mark" ? `mark:${art.color}` : JSON.stringify(art)}@${Math.round(h)}`;
  if (stickerCache.has(key)) return stickerCache.get(key)!;
  const body = stickerBody(d, art, h);
  let out: HTMLCanvasElement | null = null;
  if (body) {
    const pad = Math.max(4, Math.round(h * 0.045));
    const rim = Math.max(1, Math.round(pad * 0.25));
    out = document.createElement("canvas");
    out.width = body.width + (pad + rim) * 2;
    out.height = body.height + (pad + rim) * 2;
    const ctx = out.getContext("2d")!;
    const o = pad + rim;
    const ring = (layer: HTMLCanvasElement, r: number) => {
      for (let a = 0; a < 24; a++) {
        const t = (a / 24) * Math.PI * 2;
        ctx.drawImage(layer, o + Math.cos(t) * r, o + Math.sin(t) * r);
      }
    };
    ring(silhouette(body, "rgba(16,26,33,0.28)"), pad + rim);
    const white = silhouette(body, "#FFFFFF");
    ring(white, pad);
    ring(white, pad * 0.5);
    ctx.drawImage(body, o, o);
  }
  stickerCache.set(key, out);
  return out;
}

function drawSticker(d: DrawCtx, s: Sticker, panel: Panel, unit: number) {
  const cell = panel.cells[s.cell];
  if (!cell) return;
  const scale = d.ctx.getTransform().a;
  // Chips are wide, so they get a shorter height to match the other stickers' area.
  const h = unit * s.size * (s.art.kind === "code" ? 0.5 : 1);
  // Rendered at device resolution, drawn back at layout size.
  const c = stickerCanvas(d, s.art, h * scale);
  if (!c) return;
  const fullW = c.width / scale;
  const fullH = c.height / scale;
  // Keep the whole sticker on its panel (rotation ignored; tilts are small).
  const b = panel.bounds;
  const m = 8;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const cx = clamp(cell.x + cell.w * s.at[0], b.x + fullW / 2 + m, b.x + b.w - fullW / 2 - m);
  const cy = clamp(cell.y + cell.h * s.at[1], b.y + fullH / 2 + m, b.y + b.h - fullH / 2 - m);
  const { ctx } = d;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((s.tilt * Math.PI) / 180);
  ctx.drawImage(c, -fullW / 2, -fullH / 2, fullW, fullH);
  ctx.restore();
}

/**
 * Tagline `segments` split by brand stars along a line of length `len`,
 * centred at the origin; shrinks from `maxSize` until it fits.
 */
function drawSideText(d: DrawCtx, segments: string[], len: number, maxSize: number) {
  const { ctx } = d;
  const parts = segments.map((t) => t.toUpperCase());
  const measure = (size: number) => {
    ctx.font = `700 ${size}px ${d.body}`;
    ctx.letterSpacing = `${size * 0.18}px`;
    const starH = size * 0.9;
    const gap = size * 0.9;
    const starW = shapeWidth(star, starH);
    const widths = parts.map((p) => ctx.measureText(p).width);
    const total = widths.reduce((a, b) => a + b, 0) + (parts.length - 1) * (starW + gap * 2);
    return { starH, gap, starW, widths, total };
  };
  let size = maxSize;
  let m = measure(size);
  while (m.total > len && size > 12) m = measure(--size);
  const { starH, gap, starW, widths, total } = m;
  if (total > len) {
    ctx.letterSpacing = "0px";
    return;
  }
  ctx.fillStyle = d.frame.fg;
  ctx.globalAlpha = 0.85;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let x = -total / 2;
  parts.forEach((p, i) => {
    ctx.fillText(p, x, 0);
    x += widths[i]!;
    if (i < parts.length - 1) {
      drawShape(ctx, star, x + gap, -starH / 2, starH, d.frame.fg);
      x += starW + gap * 2;
    }
  });
  ctx.globalAlpha = 1;
  ctx.letterSpacing = "0px";
}

/** Stars and dots scattered along a margin strip `zone`, spaced along its long side. */
function drawConfetti(d: DrawCtx, zone: Rect, count: number, seed: number) {
  const { ctx } = d;
  const colors = DECOR[d.frame.id].confetti;
  const rand = rng(seed);
  const vertical = zone.h > zone.w;
  const long = vertical ? zone.h : zone.w;
  const short = vertical ? zone.w : zone.h;
  for (let i = 0; i < count; i++) {
    const along = ((i + 0.2 + rand() * 0.6) / count) * long;
    const isStar = i % 3 !== 1;
    const s = isStar ? short * (0.4 + rand() * 0.35) : short * (0.12 + rand() * 0.1);
    const across = s / 2 + rand() * Math.max(0, short - s);
    const x = zone.x + (vertical ? across : along);
    const y = zone.y + (vertical ? along : across);
    const color = colors[i % colors.length]!;
    if (isStar) drawShape(ctx, star, x - shapeWidth(star, s) / 2, y - s / 2, s, color);
    else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, s / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The add-ons that are on, for one panel — drawn last, over the photos. */
function drawDecor(d: DrawCtx, panel: Panel, on: AddOns) {
  const { ctx } = d;
  if (!on.stickers && !on.tagline && !on.confetti) return;
  const decor = DECOR[d.frame.id];
  const cells = panel.cells;
  const first = cells[0]!;
  const last = cells[cells.length - 1]!;
  const b = panel.bounds;

  if (panel.brandSide === "bottom") {
    // Tagline running down the right margin (in two runs when stickers are
    // on, leaving the second-gap sticker room); confetti down the left.
    const right = first.x + first.w;
    const midX = right + (b.x + b.w - right) / 2;
    const gapY = cells[1]!.y + cells[1]!.h;
    const runs: [string[], number, number][] = on.stickers
      ? [
          [TAGLINE.slice(0, 1), first.y, gapY - first.h * 0.32],
          [TAGLINE.slice(1), gapY + first.h * 0.32, last.y + last.h],
        ]
      : [[TAGLINE, first.y, last.y + last.h]];
    for (const [segments, y0, y1] of on.tagline ? runs : []) {
      ctx.save();
      ctx.translate(midX, (y0 + y1) / 2);
      ctx.rotate(Math.PI / 2);
      drawSideText(d, segments, y1 - y0, 17);
      ctx.restore();
    }
    if (on.confetti && d.frame.sponsor)
      // The margins carry the sponsor's name; scatter along the gaps between photos.
      cells.slice(0, -1).forEach((c, i) =>
        drawConfetti(d, { x: c.x + 40, y: c.y + c.h, w: c.w - 80, h: cells[i + 1]!.y - c.y - c.h }, 7, 26 + i)
      );
    else if (on.confetti)
      drawConfetti(d, { x: b.x + 6, y: first.y, w: first.x - b.x - 12, h: last.y + last.h - first.y }, 11, 26);
  } else {
    // Tagline along the bottom margin, confetti down the left and across the top.
    const top = first.y;
    const right = cells[1]!.x + cells[1]!.w;
    const bottom = last.y + last.h;
    if (on.tagline) {
      ctx.save();
      // Clear of the corner sticker on the left and the column art on the right.
      const x0 = first.x + 270;
      const x1 = right - 260;
      ctx.translate((x0 + x1) / 2, (bottom + b.y + b.h) / 2);
      drawSideText(d, TAGLINE, x1 - x0, Math.min(20, (b.y + b.h - bottom) * 0.45));
      ctx.restore();
    }
    if (on.confetti) {
      drawConfetti(d, { x: b.x + 4, y: top, w: first.x - b.x - 8, h: bottom - top }, 9, 26);
      if (!d.frame.sponsor) drawConfetti(d, { x: first.x, y: 14, w: right - first.x, h: top - 28 }, 16, 3);
    }
  }

  const unit = panel.brandSide === "bottom" ? first.h : first.h * 0.8;
  if (on.stickers) for (const s of decor.stickers) drawSticker(d, s, panel, unit);
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

/**
 * QR code to the guest's digital copy on a white tile, `size` square at
 * (x, y). Module edges snap to whole pixels so it stays sharp at any size.
 */
function drawQr(d: DrawCtx, url: string, x: number, y: number, size: number) {
  const { ctx } = d;
  const qr = QRCode.create(url, { errorCorrectionLevel: "L" });
  const n = qr.modules.size;
  const quiet = 1;
  const cell = size / (n + quiet * 2);
  const edge = (i: number) => Math.round((quiet + i) * cell);
  x = Math.round(x);
  y = Math.round(y);
  ctx.save();
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(x, y, Math.round(size), Math.round(size), cell);
  ctx.fill();
  ctx.fillStyle = BRAND.black;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.modules.get(r, c))
        ctx.fillRect(x + edge(c), y + edge(r), edge(c + 1) - edge(c), edge(r + 1) - edge(r));
  ctx.restore();
}

export interface RenderPrintOptions {
  mode: PrintMode;
  frame: FrameId;
  /** Four photos in shot order, any size; they're cover-cropped into cells. */
  photos: (CanvasImageSource & { width: number; height: number })[];
  /** 1 = full 300 DPI print; smaller for on-screen previews. */
  scale?: number;
  /** Extras over the photos; DEFAULT_ADDONS if omitted. */
  addons?: AddOns;
  /** Link for a small QR code under each panel's logo (the printed copy only). */
  qrUrl?: string | null;
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
  addons = DEFAULT_ADDONS,
  qrUrl = null,
}: RenderPrintOptions): Promise<HTMLCanvasElement> {
  await preparePrintAssets();
  const layout = printLayout(mode);
  const frame = frameInfo(frameId);
  const names = frameImages(frameId);
  const [grain, ...loaded] = await Promise.all([
    loadImage("/brand/grain.png"),
    ...names.map((n) => loadImage(artSrc(n))),
  ]);
  const images: DrawCtx["images"] = {};
  names.forEach((n, i) => {
    if (loaded[i]) images[n] = loaded[i]!;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.imageSmoothingQuality = "high";

  const d: DrawCtx = { ctx, layout, frame, display: canvasFamily(fraunces), body: canvasFamily(inter), images, qrUrl };

  ctx.fillStyle = frame.bg;
  ctx.fillRect(0, 0, layout.width, layout.height);
  if (frame.id !== "clean" && frame.id !== "crew") drawGrain(ctx, grain, layout.width, layout.height);

  for (const panel of layout.panels) {
    // Clip to the panel so the two strips cut cleanly.
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.bounds.x, panel.bounds.y, panel.bounds.w, panel.bounds.h);
    ctx.clip();
    const artOnTop = panel.brandSide === "right";
    if (!artOnTop) drawArt(d, panel);
    panel.cells.forEach((cell, i) => {
      const photo = photos[i];
      if (photo) drawPhoto(ctx, photo, cell, layout.radius);
    });
    if (artOnTop) drawArt(d, panel);
    drawText(d, panel);
    drawSponsorBorder(d, panel);
    drawDecor(d, panel, addons);
    ctx.restore();
  }
  drawCutGuides(d);
  return canvas;
}

/** JPEG of the print as composed (landscape grid stays landscape) — for sharing. */
export function printToDataUrl(canvas: HTMLCanvasElement, quality = 0.95): string {
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * JPEG of one strip for the guest's zip. The strip sheet is two identical
 * strips side by side, so this is the left one; a grid sheet is already one piece.
 */
export function singleStripDataUrl(canvas: HTMLCanvasElement, mode: PrintMode, quality = 0.95): string {
  if (mode !== "strip") return printToDataUrl(canvas, quality);
  const { x, y, w, h } = printLayout(mode).panels[0]!.bounds;
  const k = canvas.width / PRINTER_W;
  const out = document.createElement("canvas");
  out.width = Math.round(w * k);
  out.height = Math.round(h * k);
  out.getContext("2d")!.drawImage(canvas, x * k, y * k, w * k, h * k, 0, 0, out.width, out.height);
  return printToDataUrl(out, quality);
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
