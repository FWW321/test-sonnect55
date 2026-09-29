/**
 * The live-training run shared by chapters 9 and 10: one 2-16-16-1 network trained by full-batch Adam on
 * noisy spirals (src/data/toys.json, made by scripts/train-toys.ts). Snapshots follow a geometric step
 * schedule; the film plays them back and interpolates the weights between neighbours, so every frame
 * shows a network that really existed (to within an invisible sliver of interpolation).
 */
import raw from "../data/toys.json";
import { clamp, lerp } from "../lib/math";
import { Dataset } from "../nn/datasets";
import { Act, Net, predictGrid } from "../nn/mlp";
import { TOY } from "../nn/toys";
import { EXT } from "./toyNets";

const memo = <T,>(f: () => T) => {
  let v: T | undefined;
  return () => (v ??= f());
};

export interface RunData {
  sizes: number[];
  steps: number[];
  trainLoss: number[];
  trainAcc: number[];
  testLoss: number[];
  testAcc: number[];
  snaps: Float64Array[];
  train: Dataset;
  test: Dataset;
  /** Number of snapshots. */
  K: number;
}

export const run = memo<RunData>(() => {
  const r = raw.run;
  const train = TOY.spiralsTrain();
  const test = TOY.spiralsTest();
  if (Math.abs(TOY.check(train.X) - r.checkTrain) > 1e-4 || Math.abs(TOY.check(test.X) - r.checkTest) > 1e-4) {
    throw new Error('toys.json is stale for "run" — run `npm run train:toys`');
  }
  return {
    sizes: r.sizes,
    steps: r.steps,
    trainLoss: r.trainLoss,
    trainAcc: r.trainAcc,
    testLoss: r.testLoss,
    testAcc: r.testAcc,
    snaps: r.snaps.map((s) => Float64Array.from(s)),
    train,
    test,
    K: r.steps.length,
  };
});

const scratch = memo(() => new Net(raw.run.sizes, raw.run.acts as Act[]));
const scratchCache = memo(() => scratch().makeCache());

/** The network at fractional snapshot index k (weights interpolated linearly between snapshots). */
export function runNetAt(k: number): Net {
  const R = run();
  const kk = clamp(k, 0, R.K - 1);
  const i = Math.floor(kk);
  const j = Math.min(R.K - 1, i + 1);
  const f = kk - i;
  const net = scratch();
  const a = R.snaps[i];
  const b = R.snaps[j];
  for (let p = 0; p < net.params.length; p++) net.params[p] = a[p] + (b[p] - a[p]) * f;
  return net;
}

/** P(class 1) over the square [-EXT, EXT]² on an n×n grid (row 0 = bottom). */
export function runField(k: number, n: number): Float32Array {
  return predictGrid(runNetAt(k), -EXT, EXT, -EXT, EXT, n, n, scratchCache());
}

/** Fractional snapshot index → training step (linear between recorded steps). */
export function stepAt(k: number): number {
  const R = run();
  return sampleAt(R.steps, k);
}

/** A per-snapshot series evaluated at fractional index k. */
export function sampleAt(series: number[], k: number): number {
  const kk = clamp(k, 0, series.length - 1);
  const i = Math.floor(kk);
  const j = Math.min(series.length - 1, i + 1);
  return lerp(series[i], series[j], kk - i);
}

/** Training step → fractional snapshot index. */
export function indexOfStep(step: number): number {
  const R = run();
  const s = R.steps;
  if (step <= s[0]) return 0;
  if (step >= s[s.length - 1]) return s.length - 1;
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid] <= step) lo = mid;
    else hi = mid;
  }
  return lo + (step - s[lo]) / (s[hi] - s[lo]);
}
