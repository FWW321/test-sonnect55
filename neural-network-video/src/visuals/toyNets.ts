/**
 * The small 2-D networks of the "space" chapter, loaded from src/data/toys.json (see
 * scripts/train-toys.ts), plus the derived geometry the scenes animate: hidden-space coordinates,
 * grids and points pushed through every 2-D bottleneck block, and the decision boundary as
 * marching-squares segments that can be carried through the same maps.
 */
import raw from "../data/toys.json";
import { Dataset, spiralPoint } from "../nn/datasets";
import { Act, Net, predictGrid } from "../nn/mlp";
import { SPIRAL_TURNS, TOY } from "../nn/toys";

const memo = <T,>(f: () => T) => {
  let v: T | undefined;
  return () => (v ??= f());
};

function assertFresh(name: string, X: Float64Array[], expected: number) {
  if (Math.abs(TOY.check(X) - expected) > 1e-4) {
    throw new Error(`toys.json is stale for "${name}" — run \`npm run train:toys\``);
  }
}

// ------------------------------------------------------------------------------------ circles → 3-D
export const circlesData = memo<Dataset>(() => TOY.circles());
export const circlesNet = memo(() => {
  assertFresh("circles", circlesData().X, raw.circles.check);
  return new Net(raw.circles.sizes, raw.circles.acts as Act[], raw.circles.params);
});

export interface Lift {
  /** Original 2-D coordinates. */
  xy: [number, number][];
  /** Hidden-layer coordinates (3 ReLU units), recentred and scaled to fit a cube of half-width ≈ 0.85. */
  h: [number, number, number][];
  cls: number[];
  /** Separating plane in the same (normalised) hidden coordinates: n·h = d, n a unit normal. */
  plane: { n: [number, number, number]; d: number };
}
export const circlesLift = memo<Lift>(() => {
  const ds = circlesData();
  const net = circlesNet();
  const cache = net.makeCache();
  const raw3: [number, number, number][] = [];
  const xy: Lift["xy"] = [];
  for (const p of ds.X) {
    net.forward(p, cache);
    xy.push([p[0], p[1]]);
    raw3.push([cache.a[1][0], cache.a[1][1], cache.a[1][2]]);
  }
  // isotropic normalisation: centre the bounding box on the origin, scale its longest side to 1.7
  const lo = [1e9, 1e9, 1e9];
  const hi = [-1e9, -1e9, -1e9];
  for (const h of raw3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], h[k]); hi[k] = Math.max(hi[k], h[k]); }
  const ctr = lo.map((v, k) => (v + hi[k]) / 2);
  const s = 1.7 / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const h = raw3.map((r) => [(r[0] - ctr[0]) * s, (r[1] - ctr[1]) * s, (r[2] - ctr[2]) * s] as [number, number, number]);
  // plane w·h_raw + b = 0  →  in normalised coordinates: n·h' = d
  const w = net.layers[1].W;
  const b = net.layers[1].b[0];
  const wn = Math.hypot(w[0], w[1], w[2]);
  const n: [number, number, number] = [w[0] / wn, w[1] / wn, w[2] / wn];
  const d = s * (-b / wn - (n[0] * ctr[0] + n[1] * ctr[1] + n[2] * ctr[2]));
  return { xy, h, cls: ds.y, plane: { n, d } };
});

// ------------------------------------------------------------------------------------ spirals through blocks
export const spiralData = memo<Dataset>(() => TOY.spirals());
export const spiralNet = memo(() => {
  assertFresh("spirals", spiralData().X, raw.spirals.check);
  return new Net(raw.spirals.sizes, raw.spirals.acts as Act[], raw.spirals.params);
});

/** A window [x0,x1]×[y0,y1] in some stage's coordinates. */
export interface View {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface SpiralStages {
  /** Per stage (0 = input, 1..3 = after block k): flat [x0,y0,x1,y1,…] coordinates of the data points. */
  points: Float64Array[];
  cls: number[];
  /** Per stage: coordinates of every grid-line vertex, lines concatenated (see `gridLines`). */
  grid: Float64Array[];
  gridLines: { start: number; count: number; axis: boolean }[];
  /** Decision boundary as segments [ax,ay,bx,by,…] per stage. */
  contour: Float64Array[];
  /** Noise-free centre line of each spiral arm, per stage: [arm0 xy…, arm1 xy…] with ARM_N samples per arm. */
  arms: Float64Array[];
  /** Fitted square window per stage, framing the points. */
  view: View[];
  /** p(class 1) on an nx×ny grid of the input space, for the background field. */
  field: Float32Array;
  fieldN: number;
  /** Final separating line in the last 2-D space: a·x + b·y + c = 0. */
  line: [number, number, number];
}

const EXT = 1.15;
const GRID_EXT = 1.0;
const GRID_STEP = 0.25;
const GRID_SEG = 46;
export const ARM_N = 160;

/** Marching squares over p = 0.5. Returns segments in input space. */
function contourSegments(field: Float32Array, n: number, lo: number, hi: number): number[] {
  const segs: number[] = [];
  const at = (i: number, j: number) => field[j * n + i] - 0.5;
  const xy = (i: number, j: number): [number, number] => [lo + ((hi - lo) * (i + 0.5)) / n, lo + ((hi - lo) * (j + 0.5)) / n];
  const lerpPt = (a: [number, number], b: [number, number], va: number, vb: number): [number, number] => {
    const t = va / (va - vb);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const v = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      const p = [xy(i, j), xy(i + 1, j), xy(i + 1, j + 1), xy(i, j + 1)];
      const pts: [number, number][] = [];
      for (let e = 0; e < 4; e++) {
        const a = e;
        const b = (e + 1) % 4;
        if (v[a] > 0 !== v[b] > 0) pts.push(lerpPt(p[a], p[b], v[a], v[b]));
      }
      if (pts.length === 2) segs.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
      else if (pts.length === 4) segs.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
    }
  }
  return segs;
}

export const spiralStages = memo<SpiralStages>(() => {
  const ds = spiralData();
  const net = spiralNet();
  const cache = net.makeCache();
  // stage k = the 2-D output of hidden layer k (cache.a[k]); stage 0 is the input itself
  const stageOf = (p: ArrayLike<number>): number[][] => {
    net.forward(p, cache);
    return [[p[0], p[1]], [cache.a[1][0], cache.a[1][1]], [cache.a[2][0], cache.a[2][1]], [cache.a[3][0], cache.a[3][1]]];
  };

  // points
  const points = [0, 1, 2, 3].map(() => new Float64Array(ds.X.length * 2));
  ds.X.forEach((p, i) => {
    const st = stageOf(p);
    for (let k = 0; k < 4; k++) {
      points[k][2 * i] = st[k][0];
      points[k][2 * i + 1] = st[k][1];
    }
  });

  // grid lines
  const nLines = Math.round((2 * GRID_EXT) / GRID_STEP) + 1;
  const gridLines: SpiralStages["gridLines"] = [];
  const gridPts: number[][][] = [[], [], [], []];
  for (let dir = 0; dir < 2; dir++) {
    for (let k = 0; k < nLines; k++) {
      const c = -GRID_EXT + k * GRID_STEP;
      gridLines.push({ start: gridPts[0].length, count: GRID_SEG + 1, axis: Math.abs(c) < GRID_STEP / 2 });
      for (let i = 0; i <= GRID_SEG; i++) {
        const s = -GRID_EXT + (2 * GRID_EXT * i) / GRID_SEG;
        const st = stageOf(dir === 0 ? [s, c] : [c, s]);
        for (let q = 0; q < 4; q++) gridPts[q].push(st[q]);
      }
    }
  }
  const grid = gridPts.map((arr) => Float64Array.from(arr.flat()));

  // centre lines of the two spiral arms (same parametrisation as nn/datasets.ts)
  const arms = [0, 1, 2, 3].map(() => new Float64Array(2 * ARM_N * 2));
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < ARM_N; i++) {
      const st = stageOf(spiralPoint(c, (i + 0.5) / ARM_N, SPIRAL_TURNS));
      for (let q = 0; q < 4; q++) {
        arms[q][2 * (c * ARM_N + i)] = st[q][0];
        arms[q][2 * (c * ARM_N + i) + 1] = st[q][1];
      }
    }
  }

  // background field + boundary segments (input space), then carried through every stage
  const fieldN = 96;
  const field = predictGrid(net, -EXT, EXT, -EXT, EXT, fieldN, fieldN, cache);
  const segs = contourSegments(field, fieldN, -EXT, EXT);
  const contour = [0, 1, 2, 3].map(() => new Float64Array(segs.length));
  for (let s = 0; s < segs.length; s += 2) {
    const st = stageOf([segs[s], segs[s + 1]]);
    for (let q = 0; q < 4; q++) {
      contour[q][s] = st[q][0];
      contour[q][s + 1] = st[q][1];
    }
  }

  // window per stage: frame the points (with a margin), keep it square
  const view: View[] = points.map((P) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < P.length; i += 2) {
      x0 = Math.min(x0, P[i]);
      x1 = Math.max(x1, P[i]);
      y0 = Math.min(y0, P[i + 1]);
      y1 = Math.max(y1, P[i + 1]);
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const half = (Math.max(x1 - x0, y1 - y0) / 2) * 1.3 + 1e-6;
    return { x0: cx - half, x1: cx + half, y0: cy - half, y1: cy + half };
  });
  view[0] = { x0: -EXT, x1: EXT, y0: -EXT, y1: EXT };

  const L = net.layers[3];
  return { points, cls: ds.y, grid, gridLines, contour, arms, view, field, fieldN, line: [L.W[0], L.W[1], L.b[0]] };
});
