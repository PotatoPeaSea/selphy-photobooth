import type { BrandShape } from "./shapes";
import { MATRIX_LABEL, MATRIX_LABEL_SIZE, type Matrix } from "./matrix";

const pathCache = new WeakMap<BrandShape, Path2D[]>();

function pathsFor(shape: BrandShape): Path2D[] {
  let paths = pathCache.get(shape);
  if (!paths) {
    paths = shape.paths.map((p) => new Path2D(p.d));
    pathCache.set(shape, paths);
  }
  return paths;
}

/** Width of `shape` when drawn at height `h`. */
export function shapeWidth(shape: BrandShape, h: number): number {
  return (h * shape.w) / shape.h;
}

/** Fill a brand shape with its top-left at (x, y), scaled to height `h`. */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: BrandShape,
  x: number,
  y: number,
  h: number,
  color: string
): void {
  const s = h / shape.h;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(-shape.x, -shape.y);
  ctx.fillStyle = color;
  shape.paths.forEach((p, i) => ctx.fill(pathsFor(shape)[i]!, p.evenodd ? "evenodd" : "nonzero"));
  ctx.restore();
}

/**
 * Draw a code matrix with its bounding box's top-left at (x, y), scaled so the
 * whole cluster is `h` tall. `labelFamily` is a canvas font family.
 */
export function drawMatrix(
  ctx: CanvasRenderingContext2D,
  matrix: Matrix,
  x: number,
  y: number,
  h: number,
  dotColor: string,
  labelColor: string,
  labelFamily: string
): void {
  const unit = h / (matrix.maxY - matrix.minY);
  const ox = x - matrix.minX * unit;
  const oy = y - matrix.minY * unit;
  ctx.save();
  ctx.fillStyle = dotColor;
  for (const d of matrix.dots) {
    ctx.beginPath();
    ctx.arc(ox + d.x * unit, oy + d.y * unit, d.r * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = labelColor;
  ctx.font = `800 ${MATRIX_LABEL_SIZE * unit}px ${labelFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const l of matrix.labels) ctx.fillText(MATRIX_LABEL, ox + l.x * unit, oy + l.y * unit);
  ctx.restore();
}
