/**
 * Procedural handwritten digits (MNIST-style 28×28, ink = 1). No dataset download needed:
 * each digit is a set of stroke polylines that get a random affine wobble, per-point jitter and a
 * random pen width, then are rasterised with an anti-aliased distance field.
 * Deterministic: renderDigit(d, seed) is a pure function.
 */
import { TAU, clamp, gaussian, mulberry32 } from "../lib/math";

export const DIGIT_SIZE = 28;
type Pt = [number, number];

const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 28): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt;
  });

const PI = Math.PI;

/** Stroke skeletons in the unit square (y grows downward). `variant` flips optional details. */
function skeleton(d: number, variant: number): Pt[][] {
  switch (d) {
    case 0:
      return [arc(0.5, 0.5, 0.26, 0.39, 0, TAU, 36)];
    case 1:
      return [
        [
          [0.34, 0.26],
          [0.53, 0.1],
          [0.53, 0.5],
          [0.53, 0.9],
        ],
        ...(variant > 0.6
          ? ([
              [
                [0.36, 0.9],
                [0.7, 0.9],
              ],
            ] as Pt[][])
          : []),
      ];
    case 2:
      return [[...arc(0.5, 0.31, 0.25, 0.21, PI * 1.02, PI * 2.32, 22), [0.26, 0.88], [0.8, 0.88]]];
    case 3:
      return [
        arc(0.47, 0.29, 0.24, 0.19, PI * 1.12, PI * 2.5, 22),
        arc(0.47, 0.68, 0.28, 0.21, -PI * 0.5, PI * 0.88, 24),
      ];
    case 4:
      return [
        [
          [0.66, 0.1],
          [0.17, 0.64],
          [0.86, 0.64],
        ],
        [
          [0.65, 0.1],
          [0.65, 0.92],
        ],
      ];
    case 5:
      return [
        [
          [0.75, 0.1],
          [0.32, 0.1],
          [0.29, 0.46],
        ],
        arc(0.48, 0.66, 0.28, 0.24, -PI * 0.62, PI * 0.78, 24),
      ];
    case 6:
      return [
        [
          [0.7, 0.1],
          [0.45, 0.2],
          [0.3, 0.42],
          [0.25, 0.62],
        ],
        arc(0.5, 0.66, 0.25, 0.25, PI, PI + TAU, 32),
      ];
    case 7:
      return [
        [
          [0.2, 0.12],
          [0.8, 0.12],
          [0.42, 0.9],
        ],
        ...(variant > 0.75
          ? ([
              [
                [0.36, 0.52],
                [0.66, 0.52],
              ],
            ] as Pt[][])
          : []),
      ];
    case 8:
      return [arc(0.5, 0.3, 0.2, 0.2, 0, TAU, 28), arc(0.5, 0.71, 0.25, 0.22, 0, TAU, 28)];
    default:
      return [
        arc(0.5, 0.33, 0.24, 0.22, 0, TAU, 28),
        [
          [0.74, 0.34],
          [0.7, 0.62],
          [0.5, 0.9],
        ],
      ];
  }
}

export interface DigitOptions {
  /** 0 → perfectly regular glyph; 1 → typical handwriting wobble. */
  wobble?: number;
}

/** Render digit `d` (0–9) as a 784-vector in row-major order. */
export function renderDigit(d: number, seed: number, opts: DigitOptions = {}): Float32Array {
  const wob = opts.wobble ?? 1;
  const rng = mulberry32(seed * 7919 + d * 104729 + 13);
  const rot = gaussian(rng) * 0.11 * wob;
  const shear = gaussian(rng) * 0.13 * wob;
  const sx = 1 + gaussian(rng) * 0.06 * wob;
  const sy = 1 + gaussian(rng) * 0.05 * wob;
  const tx = gaussian(rng) * 0.03 * wob;
  const ty = gaussian(rng) * 0.03 * wob;
  const width = 1.15 + (0.35 + rng() * 0.55) * (0.6 + 0.4 * wob) + (1 - wob) * 0.25; // px radius
  const jit = 0.011 * wob;

  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const strokes = skeleton(d, rng()).map((s) =>
    s.map(([x, y]) => {
      // wobble around the glyph centre
      let px = (x - 0.5 + gaussian(rng) * jit) * sx;
      let py = (y - 0.5 + gaussian(rng) * jit) * sy;
      px += shear * py;
      const rx = px * cs - py * sn;
      const ry = px * sn + py * cs;
      // unit box → central 20×20 of the 28×28 field, like MNIST
      return [4 + (rx + 0.5 + tx) * 20, 4 + (ry + 0.5 + ty) * 20] as Pt;
    }),
  );

  const img = new Float32Array(DIGIT_SIZE * DIGIT_SIZE);
  for (let py = 0; py < DIGIT_SIZE; py++) {
    for (let px = 0; px < DIGIT_SIZE; px++) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      let best = 1e9;
      for (const s of strokes) {
        for (let i = 0; i + 1 < s.length; i++) {
          const [ax, ay] = s[i];
          const [bx, by] = s[i + 1];
          const vx = bx - ax;
          const vy = by - ay;
          const len2 = vx * vx + vy * vy || 1e-9;
          const t = clamp(((cx - ax) * vx + (cy - ay) * vy) / len2);
          const dx = cx - (ax + vx * t);
          const dy = cy - (ay + vy * t);
          const dist = dx * dx + dy * dy;
          if (dist < best) best = dist;
        }
      }
      const dist = Math.sqrt(best);
      img[py * DIGIT_SIZE + px] = clamp(1 - (dist - width * 0.55) / 1.25);
    }
  }
  return img;
}

/** One-hot label vector. */
export const oneHot = (d: number, n = 10) => {
  const v = new Float64Array(n);
  v[d] = 1;
  return v;
};
