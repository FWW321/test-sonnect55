/**
 * The backward pass on the real digit network: the true gradient of the cross-entropy loss with
 * respect to all 13 002 parameters for one (deliberately hard) example, drawn as an orange wave that
 * runs from the output layer back to the pixels — the mirror image of chapter 4's forward pass.
 */
import { rgba } from "../lib/color";
import { glow, line, pulse } from "../lib/draw";
import { clamp, ease, hash01, seg } from "../lib/math";
import { renderDigit } from "../nn/digits";
import { RGB_NEG } from "../theme";

import { digitNet } from "./data";
import { H_YS, IMG, OUT_YS, R_H, R_OUT, X_H1, X_H2, X_OUT } from "./digitNetView";

type Ctx = CanvasRenderingContext2D;

const memo = <T,>(f: () => T) => {
  let v: T | undefined;
  return () => (v ??= f());
};

/** A '7' the network is genuinely unsure about — a real error signal, not a formality. */
export const HARD = memo(() => {
  const net = digitNet();
  const cache = net.makeCache();
  let best: { seed: number; loss: number; img: Float32Array; p: number } = { seed: 0, loss: -1, img: new Float32Array(0), p: 0 };
  for (let seed = 1; seed <= 500; seed++) {
    const img = renderDigit(7, seed * 7919);
    const out = net.forward(img, cache);
    const loss = -Math.log(Math.max(out[7], 1e-9));
    // uncertain, but still readable as a 7: loss in a moderate band, keep the largest
    if (loss > best.loss && loss < 1.3) best = { seed: seed * 7919, loss, img, p: out[7] };
  }
  return best;
});

export interface BackData {
  img: Float32Array;
  probs: Float64Array;
  /** Activations: a[0] pixels, a[1] H1, a[2] H2. */
  a: Float64Array[];
  /** dL/dz of H1, H2 and the output layer. */
  dz: Float64Array[];
  /** Per-edge |gradient| for the two dense layers, and per-neuron |dz| normalised to 0–1. */
  g12: Float64Array; // H1 → H2 (16×16, [o*16+i])
  g23: Float64Array; // H2 → out (10×16)
  n1: Float64Array;
  n2: Float64Array;
  nO: Float64Array;
  /** Per-layer parameter counts (weights + biases): the 13 002 in three pieces. */
  counts: { out: number; h2: number; h1: number };
  grad: Float64Array;
}

export const backData = memo<BackData>(() => {
  const net = digitNet();
  const { img } = HARD();
  const cache = net.makeCache();
  const probs = Float64Array.from(net.forward(img, cache));
  const dzLast = Float64Array.from(probs);
  dzLast[7] -= 1; // softmax + cross-entropy: prediction − target
  const grad = new Float64Array(net.params.length);
  net.backward(cache, dzLast, grad, 1);
  const a = cache.a.map((x) => Float64Array.from(x));
  const dz = cache.dz.map((x) => Float64Array.from(x));
  const norm = (v: Float64Array) => {
    let m = 1e-12;
    for (const x of v) m = Math.max(m, Math.abs(x));
    return Float64Array.from(v, (x) => Math.abs(x) / m);
  };
  const g12 = new Float64Array(256);
  const g23 = new Float64Array(160);
  let m12 = 1e-12;
  let m23 = 1e-12;
  for (let o = 0; o < 16; o++)
    for (let i = 0; i < 16; i++) {
      g12[o * 16 + i] = Math.abs(dz[1][o] * a[1][i]);
      m12 = Math.max(m12, g12[o * 16 + i]);
    }
  for (let o = 0; o < 10; o++)
    for (let i = 0; i < 16; i++) {
      g23[o * 16 + i] = Math.abs(dz[2][o] * a[2][i]);
      m23 = Math.max(m23, g23[o * 16 + i]);
    }
  for (let i = 0; i < g12.length; i++) g12[i] /= m12;
  for (let i = 0; i < g23.length; i++) g23[i] /= m23;
  const L = net.layers;
  return {
    img,
    probs,
    a,
    dz,
    g12,
    g23,
    n1: norm(dz[0]),
    n2: norm(dz[1]),
    nO: norm(dz[2]),
    counts: { out: L[2].W.length + L[2].b.length, h2: L[1].W.length + L[1].b.length, h1: L[0].W.length + L[0].b.length },
    grad,
  };
});

export interface BwdEnv {
  /** Output-layer error appears. */
  err: number;
  /** Pulses along H2 ← out. */
  e23: number;
  litH2: number;
  /** Pulses along H1 ← H2. */
  e12: number;
  litH1: number;
  /** Pulses along pixels ← H1. */
  e01: number;
  litPx: number;
}

/** Envelopes of one backward pass starting at t0; the layers are visited output-first. */
export function bwdEnv(t: number, t0: number, speed = 1): BwdEnv {
  const s = (a: number, b: number) => seg(t, t0 + a / speed, t0 + b / speed, ease.inOutSine);
  return {
    err: s(0, 0.9),
    e23: s(0.7, 1.9),
    litH2: s(1.7, 2.3),
    e12: s(2.1, 3.3),
    litH1: s(3.1, 3.7),
    e01: s(3.5, 4.9),
    litPx: s(4.7, 5.3),
  };
}
export const BWD_DONE: BwdEnv = { err: 1, e23: 1, litH2: 1, e12: 1, litH1: 1, e01: 1, litPx: 1 };

const pxPos = (i: number) => ({
  x: IMG.x + ((i % 28) + 0.5) * (IMG.s / 28),
  y: IMG.y + (Math.floor(i / 28) + 0.5) * (IMG.s / 28),
});

/** The brightest pixels, which carry the first-layer gradients (∂L/∂w = dz · pixel). */
const topPixels = memo(() => {
  const { img } = backData();
  const idx: number[] = [];
  for (let i = 0; i < 784; i++) if (img[i] > 0.55) idx.push(i);
  return idx.filter((_, k) => k % 3 === 0);
});

/** Orange overlay for the backward pass — draw after the base network view. */
export function drawBackward(ctx: Ctx, e: BwdEnv, alpha = 1) {
  if (alpha <= 0.003) return;
  const d = backData();
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha;
  const O = rgba(RGB_NEG, 1);

  // pixels ← H1 : gradient of a first-layer weight is (neuron's error) × (pixel value)
  if (e.e01 > 0.005) {
    const px = topPixels();
    for (let j = 0; j < 16; j++) {
      const m = d.n1[j];
      if (m < 0.12) continue;
      for (const i of px) {
        if (hash01(i * 16 + j, 21) > 0.16) continue;
        const p = pxPos(i);
        line(ctx, X_H1 - R_H - 2, H_YS[j], p.x, p.y, { color: O, lw: 0.6 + 0.8 * m, alpha: (0.05 + 0.28 * m * d.img[i]) * e.e01 });
        if (e.e01 < 1 && m > 0.35) {
          const jit = hash01(i * 16 + j, 5) * 0.3;
          pulse(ctx, X_H1 - R_H - 2, H_YS[j], p.x, p.y, clamp((e.e01 - jit) / (1 - jit)), RGB_NEG, 2, m);
        }
      }
    }
  }
  // H1 ← H2
  if (e.e12 > 0.005) {
    for (let o = 0; o < 16; o++)
      for (let i = 0; i < 16; i++) {
        const g = d.g12[o * 16 + i];
        line(ctx, X_H2 - R_H - 2, H_YS[o], X_H1 + R_H + 2, H_YS[i], { color: O, lw: 0.5 + 1.6 * g, alpha: (0.03 + 0.7 * g) * e.e12 });
        if (e.e12 < 1 && g > 0.16) {
          const jit = hash01(o * 16 + i, 9) * 0.3;
          pulse(ctx, X_H2 - R_H - 2, H_YS[o], X_H1 + R_H + 2, H_YS[i], clamp((e.e12 - jit) / (1 - jit)), RGB_NEG, 2.2, g);
        }
      }
  }
  // H2 ← out
  if (e.e23 > 0.005) {
    for (let o = 0; o < 10; o++)
      for (let i = 0; i < 16; i++) {
        const g = d.g23[o * 16 + i];
        line(ctx, X_OUT - R_OUT - 2, OUT_YS[o], X_H2 + R_H + 2, H_YS[i], { color: O, lw: 0.5 + 1.6 * g, alpha: (0.03 + 0.7 * g) * e.e23 });
        if (e.e23 < 1 && g > 0.16) {
          const jit = hash01(o * 16 + i, 13) * 0.3;
          pulse(ctx, X_OUT - R_OUT - 2, OUT_YS[o], X_H2 + R_H + 2, H_YS[i], clamp((e.e23 - jit) / (1 - jit)), RGB_NEG, 2.3, g);
        }
      }
  }
  // neurons carrying an error signal glow orange
  for (let j = 0; j < 16; j++) {
    const m1 = d.n1[j] * e.litH1;
    const m2 = d.n2[j] * e.litH2;
    if (m1 > 0.05) glow(ctx, X_H1, H_YS[j], R_H * (1.8 + 1.6 * m1), RGB_NEG, 0.15 + 0.6 * m1);
    if (m2 > 0.05) glow(ctx, X_H2, H_YS[j], R_H * (1.8 + 1.6 * m2), RGB_NEG, 0.15 + 0.6 * m2);
  }
  for (let o = 0; o < 10; o++) {
    const m = d.nO[o] * e.err;
    if (m > 0.05) glow(ctx, X_OUT, OUT_YS[o], R_OUT * (1.8 + 1.8 * m), RGB_NEG, 0.2 + 0.7 * m);
  }
  ctx.globalAlpha = a0;
}
