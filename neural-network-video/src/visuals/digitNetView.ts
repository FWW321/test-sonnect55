/**
 * The digit network as a picture: the 28×28 image, three columns of neurons, and the connections
 * between them, coloured by the *real* trained weights and lit by the *real* activations of a
 * forward pass (see visuals/data.ts).
 */
import { grey, rgba } from "../lib/color";
import { arrow, circle, glow, heatmap, line, pulse, rrect, text } from "../lib/draw";
import { clamp, ease, hash01, lerp, seg } from "../lib/math";
import { C, RGB, RGB_NEG, RGB_POS } from "../theme";
import { H1, drawSmallNeuron } from "./carry";
import { Forward, digitNet, forwardDigit } from "./data";

type Ctx = CanvasRenderingContext2D;

export const IMG = { x: 92, y: 218, s: 224 };
export const X_H1 = H1.x; // 520
export const X_H2 = 720;
export const X_OUT = 930;
export const H_YS = H1.ys;
export const OUT_YS = Array.from({ length: 10 }, (_, o) => 330 + (o - 4.5) * 36);
export const R_H = H1.r;
export const R_OUT = 12;

const pxPos = (i: number) => ({
  x: IMG.x + ((i % 28) + 0.5) * (IMG.s / 28),
  y: IMG.y + (Math.floor(i / 28) + 0.5) * (IMG.s / 28),
});

// ---------------------------------------------------------------------------------- data caches
interface PixEdge {
  j: number;
  i: number;
  c: number;
}
const pixEdgeCache = new Map<string, PixEdge[]>();
/** The 6 strongest (w·x) pixel contributions into each first-layer neuron. */
function pixelEdges(img: Float32Array, key: string): PixEdge[] {
  const hit = pixEdgeCache.get(key);
  if (hit) return hit;
  const L = digitNet().layers[0];
  const out: PixEdge[] = [];
  for (let j = 0; j < 16; j++) {
    const cs: PixEdge[] = [];
    for (let i = 0; i < 784; i++) {
      const c = L.W[j * 784 + i] * img[i];
      if (Math.abs(c) > 1e-4) cs.push({ j, i, c });
    }
    cs.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
    out.push(...cs.slice(0, 6));
  }
  pixEdgeCache.set(key, out);
  return out;
}

let wmax12 = 0;
let wmax23 = 0;
function weightScales() {
  if (wmax12) return;
  const n = digitNet();
  for (const w of n.layers[1].W) wmax12 = Math.max(wmax12, Math.abs(w));
  for (const w of n.layers[2].W) wmax23 = Math.max(wmax23, Math.abs(w));
}

const norm = (v: Float64Array) => {
  let m = 0;
  for (const x of v) m = Math.max(m, x);
  return m || 1;
};

// ---------------------------------------------------------------------------------- forward timing
export interface FwdEnv {
  e0: number;
  lit1: number;
  e1: number;
  lit2: number;
  e2: number;
  litO: number;
}
/** Envelopes of one forward pass starting at time t0 (seconds); `speed` compresses it. */
export function fwdEnv(t: number, t0: number, speed = 1): FwdEnv {
  const s = (a: number, b: number) => seg(t, t0 + a / speed, t0 + b / speed, ease.inOutSine);
  return {
    e0: s(0, 1.1),
    lit1: s(0.9, 1.4),
    e1: s(1.3, 2.3),
    lit2: s(2.2, 2.7),
    e2: s(2.6, 3.6),
    litO: s(3.5, 4.1),
  };
}
export const FWD_DONE: FwdEnv = { e0: 1, lit1: 1, e1: 1, lit2: 1, e2: 1, litO: 1 };
export const FWD_IDLE: FwdEnv = { e0: 0, lit1: 0, e1: 0, lit2: 0, e2: 0, litO: 0 };

export interface NetViewOpts {
  img: Float32Array;
  key: string;
  /** Reveal (0–1) of each part. */
  image?: number;
  h1?: number;
  h2?: number;
  out?: number;
  edgesIn?: number;
  edges12?: number;
  edges23?: number;
  fwd?: FwdEnv;
  /** Extra dimming factors for focus shots. */
  dimH2?: number;
  labels?: number;
  /** Draw pulses while a pass is running. */
  pulses?: boolean;
  t: number;
}

const colorOf = (c: number): RGB => (c >= 0 ? RGB_POS : RGB_NEG);

export function drawDigitNet(ctx: Ctx, o: NetViewOpts): Forward {
  const f = forwardDigit(o.img, o.key);
  weightScales();
  const net = digitNet();
  const fw = o.fwd ?? FWD_IDLE;
  const a1 = f.a[1];
  const a2 = f.a[2];
  const n1 = norm(a1);
  const n2 = norm(a2);
  const showImg = o.image ?? 1;
  const sh1 = o.h1 ?? 1;
  const sh2 = o.h2 ?? 1;
  const shO = o.out ?? 1;
  const eIn = o.edgesIn ?? 1;
  const e12 = o.edges12 ?? 1;
  const e23 = o.edges23 ?? 1;
  const dim2 = o.dimH2 ?? 1;
  const pulses = o.pulses !== false;

  // ------------------------------------------------ input → H1 edges (top pixel contributions)
  if (eIn * sh1 * showImg > 0.005) {
    const pe = pixelEdges(o.img, o.key);
    const cmax = pe.reduce((m, e) => Math.max(m, Math.abs(e.c)), 0) || 1;
    for (const e of pe) {
      const p = pxPos(e.i);
      const strength = Math.abs(e.c) / cmax;
      const active = fw.lit1 > 0 ? 0.6 * fw.lit1 : 0;
      const alpha = (0.09 + 0.24 * strength + active * strength) * eIn * sh1 * showImg;
      line(ctx, p.x, p.y, X_H1 - R_H - 2, H_YS[e.j], { color: rgba(colorOf(e.c), 1), lw: 0.6 + strength * 0.9, alpha });
      if (pulses && fw.e0 > 0 && fw.e0 < 1 && strength > 0.28) {
        const jitter = hash01(e.i * 16 + e.j, 4) * 0.25;
        pulse(ctx, p.x, p.y, X_H1 - R_H - 2, H_YS[e.j], clamp((fw.e0 - jitter) / (1 - jitter)), colorOf(e.c), 2.1, strength);
      }
    }
  }

  // ------------------------------------------------ H1 → H2
  if (e12 * sh2 * sh1 > 0.005) {
    const L = net.layers[1];
    for (let oo = 0; oo < 16; oo++) {
      for (let i = 0; i < 16; i++) {
        const w = L.W[oo * 16 + i];
        const c = w * (a1[i] / n1);
        const s = Math.abs(w) / wmax12;
        const path = fw.lit2 > 0 ? Math.min(1, Math.abs(c) * 2.6) * fw.lit2 : 0;
        const alpha = (0.07 + 0.2 * s + 0.6 * path) * e12 * sh2 * sh1 * dim2;
        line(ctx, X_H1 + R_H + 2, H_YS[i], X_H2 - R_H - 2, H_YS[oo], { color: rgba(colorOf(w), 1), lw: 0.5 + s * 1.2 + path * 0.8, alpha });
        if (pulses && fw.e1 > 0 && fw.e1 < 1 && Math.abs(c) > 0.18) {
          const jitter = hash01(oo * 16 + i, 6) * 0.25;
          pulse(ctx, X_H1 + R_H + 2, H_YS[i], X_H2 - R_H - 2, H_YS[oo], clamp((fw.e1 - jitter) / (1 - jitter)), colorOf(c), 2.2, Math.min(1, Math.abs(c) * 2.5) * dim2);
        }
      }
    }
  }

  // ------------------------------------------------ H2 → out
  if (e23 * shO * sh2 > 0.005) {
    const L = net.layers[2];
    for (let oo = 0; oo < 10; oo++) {
      for (let i = 0; i < 16; i++) {
        const w = L.W[oo * 16 + i];
        const c = w * (a2[i] / n2);
        const s = Math.abs(w) / wmax23;
        const path = fw.litO > 0 ? Math.min(1, Math.abs(c) * 1.6) * fw.litO : 0;
        const alpha = (0.07 + 0.2 * s + 0.6 * path) * e23 * shO * sh2 * dim2;
        line(ctx, X_H2 + R_H + 2, H_YS[i], X_OUT - R_OUT - 2, OUT_YS[oo], { color: rgba(colorOf(w), 1), lw: 0.5 + s * 1.2 + path * 0.8, alpha });
        if (pulses && fw.e2 > 0 && fw.e2 < 1 && Math.abs(c) > 0.3) {
          const jitter = hash01(oo * 16 + i, 8) * 0.25;
          pulse(ctx, X_H2 + R_H + 2, H_YS[i], X_OUT - R_OUT - 2, OUT_YS[oo], clamp((fw.e2 - jitter) / (1 - jitter)), colorOf(c), 2.3, Math.min(1, Math.abs(c) * 1.8) * dim2);
        }
      }
    }
  }

  // ------------------------------------------------ nodes
  if (showImg > 0.005) {
    ctx.save();
    ctx.globalAlpha *= showImg;
    heatmap(ctx, o.img, 28, 28, IMG.x, IMG.y, IMG.s, IMG.s, grey);
    rrect(ctx, IMG.x - 1, IMG.y - 1, IMG.s + 2, IMG.s + 2, 3, { stroke: "rgba(255,255,255,0.25)", lw: 1 });
    ctx.restore();
  }
  for (let j = 0; j < 16; j++) {
    drawSmallNeuron(ctx, X_H1, H_YS[j], R_H, (a1[j] / n1) * fw.lit1, sh1);
    drawSmallNeuron(ctx, X_H2, H_YS[j], R_H, (a2[j] / n2) * fw.lit2, sh2 * dim2);
  }
  for (let d = 0; d < 10; d++) {
    const p = f.probs[d];
    drawSmallNeuron(ctx, X_OUT, OUT_YS[d], R_OUT, p * fw.litO, shO);
    if (shO > 0.01) {
      const win = f.pred === d && fw.litO > 0.5;
      text(ctx, String(d), X_OUT + 26, OUT_YS[d] + 6.5, {
        size: 19,
        weight: win ? 700 : 500,
        color: win ? C.pos : C.dim,
        font: "mono",
        alpha: shO * (win ? 1 : 0.8),
      });
    }
  }

  // ------------------------------------------------ column headers
  const lab = (o.labels ?? 1) * 0.9;
  if (lab > 0.01) {
    const y = 104;
    text(ctx, "输入 28×28", IMG.x + IMG.s / 2, IMG.y - 16, { size: 16, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: lab * showImg });
    text(ctx, "隐藏层 1", X_H1, y, { size: 16, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: lab * sh1 });
    text(ctx, "隐藏层 2", X_H2, y, { size: 16, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: lab * sh2 * dim2 });
    text(ctx, "输出", X_OUT + 10, y, { size: 16, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: lab * shO * Math.max(dim2, 0.5) });
  }
  void arrow;
  void circle;
  void glow;
  void lerp;
  return f;
}
