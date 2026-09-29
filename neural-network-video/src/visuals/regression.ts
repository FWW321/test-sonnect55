/**
 * The regression problem that doubles as the loss landscape: fit y = w·x + b to 14 noisy points.
 * The mean-squared error L(w, b) is exactly what chapters 6–7 draw as terrain and roll a ball down.
 * Because x is not centred, w and b are correlated: the bowl is a long, narrow ravine — the classic
 * case where step size and momentum matter.
 */
import { gaussian, mulberry32 } from "../lib/math";

export const REG = (() => {
  const rng = mulberry32(21);
  const xs: number[] = [];
  const ys: number[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const x = 0.45 + 4.5 * ((i + rng() * 0.7) / n);
    xs.push(x);
    ys.push(0.7 * x + 0.5 + gaussian(rng) * 0.3);
  }
  // closed-form least squares
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const wStar = sxy / sxx;
  const bStar = my - wStar * mx;
  return { xs, ys, n, wStar, bStar };
})();

export const mse = (w: number, b: number) => {
  let s = 0;
  for (let i = 0; i < REG.n; i++) {
    const d = w * REG.xs[i] + b - REG.ys[i];
    s += d * d;
  }
  return s / REG.n;
};

/** Gradient of the MSE. */
export const mseGrad = (w: number, b: number): [number, number] => {
  let gw = 0;
  let gb = 0;
  for (let i = 0; i < REG.n; i++) {
    const d = w * REG.xs[i] + b - REG.ys[i];
    gw += 2 * d * REG.xs[i];
    gb += 2 * d;
  }
  return [gw / REG.n, gb / REG.n];
};

/**
 * Where the ball starts: high up the wall of the ravine, so descent first runs fast down the slope and
 * then has to crawl along the narrow valley floor — the situation where step size and momentum matter.
 */
export const START = { w: 2.05, b: 3.5 };
