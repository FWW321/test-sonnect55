/**
 * Real optimiser trajectories on the regression landscape. For this problem the Hessian of the MSE has
 * eigenvalues ≈ 20 (across the ravine) and ≈ 0.38 (along it), so plain gradient descent is stable only for
 * step sizes below 2/20 = 0.1 — and is painfully slow along the valley floor. Everything the film shows in
 * chapter 7 (crawling, smooth, diverging; SGD vs momentum vs Adam) is computed here, not drawn by hand.
 */
import { mse, mseGrad, START } from "./regression";

export interface Run {
  pts: [number, number][];
  loss: number[];
}

const finite = (w: number, b: number) => Number.isFinite(w) && Number.isFinite(b) && Math.abs(w) < 1e5 && Math.abs(b) < 1e5;

export function runGD(lr: number, steps: number): Run {
  let w = START.w;
  let b = START.b;
  const pts: [number, number][] = [[w, b]];
  const loss = [mse(w, b)];
  for (let i = 0; i < steps; i++) {
    const [gw, gb] = mseGrad(w, b);
    w -= lr * gw;
    b -= lr * gb;
    if (!finite(w, b)) break;
    pts.push([w, b]);
    loss.push(mse(w, b));
  }
  return { pts, loss };
}

export function runMomentum(lr: number, beta: number, steps: number): Run {
  let w = START.w;
  let b = START.b;
  let vw = 0;
  let vb = 0;
  const pts: [number, number][] = [[w, b]];
  const loss = [mse(w, b)];
  for (let i = 0; i < steps; i++) {
    const [gw, gb] = mseGrad(w, b);
    vw = beta * vw - lr * gw;
    vb = beta * vb - lr * gb;
    w += vw;
    b += vb;
    if (!finite(w, b)) break;
    pts.push([w, b]);
    loss.push(mse(w, b));
  }
  return { pts, loss };
}

export function runAdam(lr: number, steps: number, b1 = 0.9, b2 = 0.999, eps = 1e-8): Run {
  let w = START.w;
  let b = START.b;
  let mw = 0, mb = 0, vw = 0, vb = 0;
  const pts: [number, number][] = [[w, b]];
  const loss = [mse(w, b)];
  for (let i = 1; i <= steps; i++) {
    const [gw, gb] = mseGrad(w, b);
    mw = b1 * mw + (1 - b1) * gw;
    mb = b1 * mb + (1 - b1) * gb;
    vw = b2 * vw + (1 - b2) * gw * gw;
    vb = b2 * vb + (1 - b2) * gb * gb;
    const c1 = 1 - Math.pow(b1, i);
    const c2 = 1 - Math.pow(b2, i);
    w -= (lr * (mw / c1)) / (Math.sqrt(vw / c2) + eps);
    b -= (lr * (mb / c1)) / (Math.sqrt(vb / c2) + eps);
    pts.push([w, b]);
    loss.push(mse(w, b));
  }
  return { pts, loss };
}

const memo = <T,>(f: () => T) => {
  let v: T | undefined;
  return () => (v ??= f());
};

/** Step sizes of the "learning rate" scene. */
export const LR = { small: 0.004, good: 0.03, osc: 0.08, large: 0.108 };
export const RUNS = {
  small: memo(() => runGD(LR.small, 400)),
  good: memo(() => runGD(LR.good, 400)),
  /** Just under the stability limit 2/λmax ≈ 0.106: overshoots the valley every step, but the swings shrink. */
  osc: memo(() => runGD(LR.osc, 400)),
  /** Just over it: every swing is 1.07× the last — divergence. */
  large: memo(() => runGD(LR.large, 60)),
  /** The race: plain gradient descent (the same run as `good`), momentum, Adam. */
  sgd: memo(() => runGD(LR.good, 400)),
  momentum: memo(() => runMomentum(0.03, 0.8, 400)),
  adam: memo(() => runAdam(0.3, 400)),
};

/** Position along a run at fractional step n (linear between recorded steps). */
export function at(run: Run, n: number): [number, number] {
  const i = Math.max(0, Math.min(run.pts.length - 1, Math.floor(n)));
  const j = Math.min(run.pts.length - 1, i + 1);
  const f = Math.max(0, Math.min(1, n - i));
  return [run.pts[i][0] + (run.pts[j][0] - run.pts[i][0]) * f, run.pts[i][1] + (run.pts[j][1] - run.pts[i][1]) * f];
}
