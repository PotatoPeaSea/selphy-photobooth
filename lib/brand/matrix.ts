/**
 * Code matrices (design/design.md §4): interlocking dot clusters plus the
 * `{i++;}` creation motif, in two contrasting colours. Geometry follows the
 * left cluster of design/examples/code-matrices-core.png on a unit grid.
 */

export interface MatrixDot {
  x: number;
  y: number;
  r: number;
}

export interface MatrixLabel {
  x: number;
  y: number;
}

export interface Matrix {
  dots: MatrixDot[];
  labels: MatrixLabel[];
  /** bounds in grid units */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const DOT_R = 0.3;
const HUB_R = 0.52;

/** "Star" cluster: big hub, ring of 8, and 8 outer dots on the axes and corners. */
function starCluster(): MatrixDot[] {
  const dots: MatrixDot[] = [{ x: 0, y: 0, r: HUB_R }];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      // The reference leaves the inner diagonals at full size but drops none.
      dots.push({ x: dx, y: dy, r: DOT_R });
    }
  for (const [dx, dy] of [
    [-2, -2], [0, -2], [2, -2],
    [-2, 0], [2, 0],
    [-2, 2], [0, 2], [2, 2],
  ] as const) {
    dots.push({ x: dx, y: dy, r: DOT_R });
  }
  return dots;
}

/** Sparse "spray": the middle reference cluster, hub with a broken ring. */
function sprayCluster(): MatrixDot[] {
  return [
    { x: 0, y: 0, r: HUB_R },
    { x: -1, y: -1, r: DOT_R },
    { x: 0, y: -1, r: DOT_R },
    { x: 1, y: 0, r: DOT_R },
    { x: -1, y: 0.2, r: DOT_R },
    { x: -0.8, y: 0.8, r: DOT_R },
    { x: 0, y: 1, r: DOT_R },
    { x: 1.6, y: -1.7, r: DOT_R },
    { x: 1.6, y: 0.9, r: DOT_R },
    { x: 0, y: 1.9, r: DOT_R },
  ];
}

function bounds(dots: MatrixDot[], labels: MatrixLabel[]): Matrix {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of dots) {
    minX = Math.min(minX, d.x - d.r);
    minY = Math.min(minY, d.y - d.r);
    maxX = Math.max(maxX, d.x + d.r);
    maxY = Math.max(maxY, d.y + d.r);
  }
  for (const l of labels) {
    minX = Math.min(minX, l.x - 0.55);
    maxX = Math.max(maxX, l.x + 0.55);
    minY = Math.min(minY, l.y - 0.25);
    maxY = Math.max(maxY, l.y + 0.25);
  }
  return { dots, labels, minX, minY, maxX, maxY };
}

export const MATRIX_STAR: Matrix = bounds(starCluster(), [
  { x: 0, y: -2.6 },
  { x: 1.05, y: -2 },
  { x: 1.05, y: 0 },
  { x: 0.4, y: 0.7 },
  { x: 0.4, y: 2.1 },
  { x: 1.7, y: 2.1 },
  { x: 1.7, y: 2.8 },
]);

export const MATRIX_SPRAY: Matrix = bounds(sprayCluster(), [
  { x: -1.3, y: -0.3 },
  { x: 0.6, y: 1 },
  { x: -0.2, y: 2.1 },
]);

/** Label text size in grid units. */
export const MATRIX_LABEL_SIZE = 0.5;
export const MATRIX_LABEL = "{i++;}";
