/** Grids and point clouds pushed through 2×2 linear maps and elementwise nonlinearities. */
import { circle, polyline } from "../lib/draw";
import { lerp } from "../lib/math";

type Ctx = CanvasRenderingContext2D;
export type Vec = [number, number];
/** Row-major 2×2: x' = a·x + b·y, y' = c·x + d·y. */
export type Mat = [number, number, number, number];

export const IDENT: Mat = [1, 0, 0, 1];
export const matMul = (A: Mat, B: Mat): Mat => [
  A[0] * B[0] + A[1] * B[2],
  A[0] * B[1] + A[1] * B[3],
  A[2] * B[0] + A[3] * B[2],
  A[2] * B[1] + A[3] * B[3],
];
export const matLerp = (A: Mat, B: Mat, t: number): Mat => [
  lerp(A[0], B[0], t),
  lerp(A[1], B[1], t),
  lerp(A[2], B[2], t),
  lerp(A[3], B[3], t),
];
export const matApply = (M: Mat, [x, y]: Vec): Vec => [M[0] * x + M[1] * y, M[2] * x + M[3] * y];

export interface Frame {
  /** Pixel square the data window [-half, half]² is mapped into. */
  x: number;
  y: number;
  w: number;
  h: number;
  half: number;
}
const sx = (f: Frame, u: number) => f.x + ((u + f.half) / (2 * f.half)) * f.w;
const sy = (f: Frame, v: number) => f.y + f.h - ((v + f.half) / (2 * f.half)) * f.h;

export interface GridOpts {
  /** Source-space extent of the grid, lines at multiples of `step`. */
  extent?: number;
  step?: number;
  segments?: number;
  color?: string;
  lw?: number;
  alpha?: number;
}

/** Draw the image of a regular grid under `map` (clipped to the frame). */
export function drawMappedGrid(ctx: Ctx, f: Frame, map: (p: Vec) => Vec, o: GridOpts = {}) {
  const ext = o.extent ?? 1.2;
  const step = o.step ?? 0.4;
  const seg = o.segments ?? 28;
  const n = Math.round((2 * ext) / step);
  ctx.save();
  ctx.beginPath();
  ctx.rect(f.x, f.y, f.w, f.h);
  ctx.clip();
  for (let dir = 0; dir < 2; dir++) {
    for (let k = 0; k <= n; k++) {
      const c = -ext + k * step;
      const pts: number[] = [];
      for (let i = 0; i <= seg; i++) {
        const s = -ext + (2 * ext * i) / seg;
        const [u, v] = map(dir === 0 ? [s, c] : [c, s]);
        pts.push(sx(f, u), sy(f, v));
      }
      const axis = Math.abs(c) < 1e-9;
      polyline(ctx, pts, {
        color: o.color ?? "rgba(255,255,255,0.3)",
        lw: axis ? (o.lw ?? 1.2) * 1.6 : o.lw ?? 1.2,
        alpha: (o.alpha ?? 1) * (axis ? 1.5 : 1),
      });
    }
  }
  ctx.restore();
}

export interface PointsOpts {
  r?: number;
  alpha?: number;
}
export function drawMappedPoints(ctx: Ctx, f: Frame, map: (p: Vec) => Vec, pts: Vec[], fill: string, o: PointsOpts = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(f.x, f.y, f.w, f.h);
  ctx.clip();
  for (const p of pts) {
    const [u, v] = map(p);
    circle(ctx, sx(f, u), sy(f, v), o.r ?? 3, { fill, alpha: o.alpha });
  }
  ctx.restore();
}

export const ring = (radius: number, n: number, phase = 0): Vec[] =>
  Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return [radius * Math.cos(a), radius * Math.sin(a)] as Vec;
  });
