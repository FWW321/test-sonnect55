/** Convolution helpers and the tiny CNN's recorded kernels (src/data/cnn.json, made by scripts/train-cnn.ts). */
import raw from "../data/cnn.json";
import { clamp, lerp } from "../lib/math";

export const K = raw.K;
export const STEPS = raw.steps;
export const N_SNAP = raw.steps.length;
const SNAPS = raw.kernels.map((k) => Float64Array.from(k));
const BIASES = raw.biases.map((b) => Float64Array.from(b));

/** Kernel `ki` (9 weights, row-major) at fractional snapshot index `k`. */
export function kernelAt(k: number, ki: number): number[] {
  const kk = clamp(k, 0, N_SNAP - 1);
  const i = Math.floor(kk);
  const j = Math.min(N_SNAP - 1, i + 1);
  const f = kk - i;
  return Array.from({ length: 9 }, (_, n) => lerp(SNAPS[i][ki * 9 + n], SNAPS[j][ki * 9 + n], f));
}

/** Bias of kernel `ki` at fractional snapshot index `k`. */
export function biasAt(k: number, ki: number): number {
  const kk = clamp(k, 0, N_SNAP - 1);
  const i = Math.floor(kk);
  const j = Math.min(N_SNAP - 1, i + 1);
  return lerp(BIASES[i][ki], BIASES[j][ki], kk - i);
}

/** Loss / accuracy / step at fractional snapshot index. */
export function statAt(series: number[], k: number): number {
  const kk = clamp(k, 0, series.length - 1);
  const i = Math.floor(kk);
  const j = Math.min(series.length - 1, i + 1);
  return lerp(series[i], series[j], kk - i);
}
export const LOSS = raw.loss;
export const ACC = raw.acc;
export const STEP_OF = raw.steps;

/** Snapshot index of a training step (fractional). */
export function indexOfStep(step: number): number {
  const s = raw.steps;
  if (step <= s[0]) return 0;
  if (step >= s[s.length - 1]) return s.length - 1;
  let lo = 0;
  while (s[lo + 1] <= step) lo++;
  return lo + (step - s[lo]) / (s[lo + 1] - s[lo]);
}

export const SIDE = 26;

/** "Valid" 3×3 convolution of a 28×28 image: a 26×26 map (row-major). */
export function convolve(img: ArrayLike<number>, w: ArrayLike<number>, bias = 0, out = new Float32Array(SIDE * SIDE)): Float32Array {
  for (let r = 0; r < SIDE; r++) {
    for (let c = 0; c < SIDE; c++) {
      let s = bias;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += w[i * 3 + j] * img[(r + i) * 28 + c + j];
      out[r * SIDE + c] = s;
    }
  }
  return out;
}

/** Hand-designed kernels used to explain what a kernel *is*. */
export const HAND = {
  horizontal: { name: "横向边缘", w: [1, 1, 1, 0, 0, 0, -1, -1, -1].map((v) => v / 3) },
  vertical: { name: "竖向边缘", w: [1, 0, -1, 1, 0, -1, 1, 0, -1].map((v) => v / 3) },
  diagonal: { name: "斜向边缘", w: [0, 1, 1, -1, 0, 1, -1, -1, 0].map((v) => v / 3) },
  blur: { name: "模糊", w: Array.from({ length: 9 }, () => 1 / 9) },
};
