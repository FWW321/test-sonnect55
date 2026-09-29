/**
 * Trains the tiny convolutional network of chapter 11 — 8 kernels of 3×3, ReLU, 2×2 max-pool, one dense
 * layer — on the film's procedural digits, and stores the *kernels over training* (not the whole net):
 * the film shows them turn from noise into stroke and edge detectors.
 * Run with `npm run train:cnn` (≈ 30 s). Output: src/data/cnn.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gaussian, mulberry32 } from "../src/lib/math";
import { renderDigit } from "../src/nn/digits";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const K = 8; // kernels
const S = 28;
const O = 26; // conv output side
const P = 13; // pooled side
const F = K * P * P; // 1352
const NC = 10;

// ------------------------------------------------------------------ data
const N_PER = 90;
const X: Float32Array[] = [];
const Yl: number[] = [];
for (let i = 0; i < N_PER; i++) for (let d = 0; d < 10; d++) {
  X.push(renderDigit(d, 500 + i * 31 + d * 7));
  Yl.push(d);
}
const TX: Float32Array[] = [];
const TY: number[] = [];
for (let i = 0; i < 30; i++) for (let d = 0; d < 10; d++) {
  TX.push(renderDigit(d, 90000 + i * 17 + d * 3));
  TY.push(d);
}

// ------------------------------------------------------------------ parameters
const rng = mulberry32(3);
const INIT = +(process.env.INIT ?? 0.08);
const W = Float64Array.from({ length: K * 9 }, () => gaussian(rng) * INIT);
const B = new Float64Array(K).fill(+(process.env.BIAS ?? 0.12));
const V = Float64Array.from({ length: NC * F }, () => gaussian(rng) * Math.sqrt(1 / F));
const C = new Float64Array(NC);
const params = [W, B, V, C];
const m = params.map((p) => new Float64Array(p.length));
const v = params.map((p) => new Float64Array(p.length));
let adamT = 0;

// scratch
const conv = new Float64Array(K * O * O);
const act = new Float64Array(K * O * O);
const pool = new Float64Array(F);
const arg = new Int32Array(F);
const logits = new Float64Array(NC);
const probs = new Float64Array(NC);

function forward(x: Float32Array) {
  for (let k = 0; k < K; k++) {
    for (let r = 0; r < O; r++) {
      for (let c = 0; c < O; c++) {
        let s = B[k];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += W[k * 9 + i * 3 + j] * x[(r + i) * S + c + j];
        conv[(k * O + r) * O + c] = s;
        act[(k * O + r) * O + c] = s > 0 ? s : 0;
      }
    }
    for (let r = 0; r < P; r++) {
      for (let c = 0; c < P; c++) {
        let best = -1;
        let bi = 0;
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          const idx = (k * O + 2 * r + i) * O + 2 * c + j;
          if (act[idx] > best) {
            best = act[idx];
            bi = idx;
          }
        }
        pool[(k * P + r) * P + c] = best;
        arg[(k * P + r) * P + c] = bi;
      }
    }
  }
  let mx = -1e9;
  for (let o = 0; o < NC; o++) {
    let s = C[o];
    for (let f = 0; f < F; f++) s += V[o * F + f] * pool[f];
    logits[o] = s;
    if (s > mx) mx = s;
  }
  let z = 0;
  for (let o = 0; o < NC; o++) z += probs[o] = Math.exp(logits[o] - mx);
  for (let o = 0; o < NC; o++) probs[o] /= z;
}

const gW = new Float64Array(W.length);
const gB = new Float64Array(B.length);
const gV = new Float64Array(V.length);
const gC = new Float64Array(C.length);
const dPool = new Float64Array(F);
const dConv = new Float64Array(K * O * O);

function backward(x: Float32Array, y: number, scale: number) {
  const dl = new Float64Array(NC);
  for (let o = 0; o < NC; o++) dl[o] = (probs[o] - (o === y ? 1 : 0)) * scale;
  dPool.fill(0);
  for (let o = 0; o < NC; o++) {
    gC[o] += dl[o];
    for (let f = 0; f < F; f++) {
      gV[o * F + f] += dl[o] * pool[f];
      dPool[f] += dl[o] * V[o * F + f];
    }
  }
  dConv.fill(0);
  for (let f = 0; f < F; f++) if (dPool[f] !== 0) dConv[arg[f]] += dPool[f];
  for (let k = 0; k < K; k++) {
    for (let r = 0; r < O; r++) {
      for (let c = 0; c < O; c++) {
        const idx = (k * O + r) * O + c;
        if (conv[idx] <= 0 || dConv[idx] === 0) continue;
        const g = dConv[idx];
        gB[k] += g;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) gW[k * 9 + i * 3 + j] += g * x[(r + i) * S + c + j];
      }
    }
  }
}

function adam(grads: Float64Array[], lr: number) {
  adamT++;
  const c1 = 1 - Math.pow(0.9, adamT);
  const c2 = 1 - Math.pow(0.999, adamT);
  params.forEach((p, k) => {
    for (let i = 0; i < p.length; i++) {
      const g = grads[k][i];
      m[k][i] = 0.9 * m[k][i] + 0.1 * g;
      v[k][i] = 0.999 * v[k][i] + 0.001 * g * g;
      p[i] -= (lr * (m[k][i] / c1)) / (Math.sqrt(v[k][i] / c2) + 1e-8);
    }
  });
}

function evalSet(xs: Float32Array[], ys: number[]) {
  let loss = 0;
  let ok = 0;
  for (let i = 0; i < xs.length; i++) {
    forward(xs[i]);
    loss -= Math.log(Math.max(probs[ys[i]], 1e-12));
    let am = 0;
    for (let o = 1; o < NC; o++) if (probs[o] > probs[am]) am = o;
    if (am === ys[i]) ok++;
  }
  return { loss: loss / xs.length, acc: ok / xs.length };
}

// ------------------------------------------------------------------ train
const STEPS = +(process.env.STEPS ?? 1200);
const LR = +(process.env.LR ?? 0.01);
const L2 = +(process.env.L2 ?? 0.001);
const BATCH = 32;
const wanted = new Set<number>([0]);
for (let s = 1; s < STEPS; s = Math.max(s + 1, Math.round(s * 1.13))) wanted.add(s);
wanted.add(STEPS);
const snaps: { step: number; kernels: number[]; bias: number[]; loss: number; acc: number; testAcc: number }[] = [];
const r4 = (a: ArrayLike<number>) => Array.from(a, (x) => +x.toFixed(4));
const order = Array.from({ length: X.length }, (_, i) => i);
const shuf = mulberry32(9);
const t0 = Date.now();
let cursor = order.length;

function snap(step: number) {
  const tr = evalSet(X, Yl);
  const te = evalSet(TX, TY);
  snaps.push({ step, kernels: r4(W), bias: r4(B), loss: +tr.loss.toFixed(4), acc: +tr.acc.toFixed(4), testAcc: +te.acc.toFixed(4) });
  console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] step ${step}: loss ${tr.loss.toFixed(3)} acc ${(tr.acc * 100).toFixed(1)}% test ${(te.acc * 100).toFixed(1)}%`);
}
snap(0);
for (let step = 1; step <= STEPS; step++) {
  gW.fill(0);
  gB.fill(0);
  gV.fill(0);
  gC.fill(0);
  for (let b = 0; b < BATCH; b++) {
    if (cursor >= order.length) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(shuf() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      cursor = 0;
    }
    const idx = order[cursor++];
    forward(X[idx]);
    backward(X[idx], Yl[idx], 1 / BATCH);
  }
  if (L2) for (let i = 0; i < W.length; i++) gW[i] += L2 * W[i];
  adam([gW, gB, gV, gC], LR);
  if (wanted.has(step)) snap(step);
}

const out = { K, kernelSize: 3, steps: snaps.map((s) => s.step), kernels: snaps.map((s) => s.kernels), biases: snaps.map((s) => s.bias), loss: snaps.map((s) => s.loss), acc: snaps.map((s) => s.acc), testAcc: snaps.map((s) => s.testAcc), bias: r4(B) };
const file = join(root, "src", "data", "cnn.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out));
// how many kernels are alive (respond to something) at the end
{
  const alive = new Array(K).fill(0);
  for (const x of TX.slice(0, 60)) {
    forward(x);
    for (let k = 0; k < K; k++) {
      let mx = 0;
      for (let i = 0; i < O * O; i++) mx = Math.max(mx, act[k * O * O + i]);
      if (mx > 0.15) alive[k]++;
    }
  }
  console.log("alive (of 60 images):", alive.join(" "));
}
console.log("wrote", file);
