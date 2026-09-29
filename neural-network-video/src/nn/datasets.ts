/** Tiny 2-D toy datasets. Class 0 is drawn orange, class 1 cyan. All coordinates live in [-1, 1]². */
import { TAU, gaussian, mulberry32 } from "../lib/math";

export interface Dataset {
  X: Float64Array[];
  /** 0 or 1 */
  y: number[];
}

/** Centre line of spiral arm `c` (0 or 1) at parameter t ∈ [0, 1]. */
export function spiralPoint(c: number, t: number, turns: number): [number, number] {
  const r = 0.08 + 0.9 * t;
  const a = turns * TAU * t + c * Math.PI;
  return [r * Math.cos(a), r * Math.sin(a)];
}

/** Two interleaved spiral arms — the classic "no straight line will do" problem. */
export function twoSpirals(nPer: number, noise: number, seed: number, turns = 1.75): Dataset {
  const rng = mulberry32(seed);
  const X: Float64Array[] = [];
  const y: number[] = [];
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < nPer; i++) {
      const [x0, y0] = spiralPoint(c, (i + 0.5) / nPer, turns);
      X.push(Float64Array.of(x0 + gaussian(rng) * noise, y0 + gaussian(rng) * noise));
      y.push(c);
    }
  }
  return { X, y };
}

/** An inner disk (class 1) surrounded by a ring (class 0). */
export function circles(nPer: number, noise: number, seed: number): Dataset {
  const rng = mulberry32(seed);
  const X: Float64Array[] = [];
  const y: number[] = [];
  for (let i = 0; i < nPer; i++) {
    const r = 0.42 * Math.sqrt(rng());
    const a = rng() * TAU;
    X.push(Float64Array.of(r * Math.cos(a) + gaussian(rng) * noise, r * Math.sin(a) + gaussian(rng) * noise));
    y.push(1);
  }
  for (let i = 0; i < nPer; i++) {
    const r = 0.72 + 0.2 * rng();
    const a = rng() * TAU;
    X.push(Float64Array.of(r * Math.cos(a) + gaussian(rng) * noise, r * Math.sin(a) + gaussian(rng) * noise));
    y.push(0);
  }
  return { X, y };
}

/** Four Gaussian blobs at the corners: XOR. */
export function xor(nPer: number, noise: number, seed: number): Dataset {
  const rng = mulberry32(seed);
  const X: Float64Array[] = [];
  const y: number[] = [];
  const centers: [number, number, number][] = [
    [0.5, 0.5, 1],
    [-0.5, -0.5, 1],
    [-0.5, 0.5, 0],
    [0.5, -0.5, 0],
  ];
  for (const [cx, cy, c] of centers) {
    for (let i = 0; i < nPer; i++) {
      X.push(Float64Array.of(cx + gaussian(rng) * noise, cy + gaussian(rng) * noise));
      y.push(c);
    }
  }
  return { X, y };
}

/** Noisy samples of a smooth function on [-1, 1] — for the regression / overfitting scenes. */
export function noisyCurve(
  n: number,
  noise: number,
  seed: number,
  f: (x: number) => number,
  jitter = true,
): { x: number[]; y: number[] } {
  const rng = mulberry32(seed);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const xi = jitter ? -1 + (2 * (i + rng() * 0.8)) / n : -1 + (2 * i) / (n - 1);
    x.push(Math.max(-1, Math.min(1, xi)));
    y.push(f(xi) + gaussian(rng) * noise);
  }
  return { x, y };
}

/** Two interleaved crescents ("moons"), scaled into [-1, 1]². Class 0 is the upper arc. */
export function moons(nPer: number, noise: number, seed: number): Dataset {
  const rng = mulberry32(seed);
  const X: Float64Array[] = [];
  const y: number[] = [];
  const S = 0.62;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < nPer; i++) {
      const th = (i / (nPer - 1)) * Math.PI;
      const x = c === 0 ? Math.cos(th) : 1 - Math.cos(th);
      const yy = c === 0 ? Math.sin(th) : 0.5 - Math.sin(th);
      X.push(Float64Array.of((x - 0.5) * S * 1.5 + gaussian(rng) * noise, (yy - 0.25) * S * 1.5 + gaussian(rng) * noise));
      y.push(c);
    }
  }
  return { X, y };
}
