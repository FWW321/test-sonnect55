import { Canvas } from "../lib/canvas";
import { rgba } from "../lib/color";
import { circle, glow, pulse, text } from "../lib/draw";
import { clamp, ease, fmt, seg, thousands } from "../lib/math";
import { chapterClock, useChapterClock } from "../lib/time";
import { C, FPS, RGB, RGB_NEG, RGB_POS } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { Formula } from "../ui/Formula";
import { UpdateRule } from "../ui/UpdateRule";
import { W_NODE, drawWNode } from "../visuals/carry";
import { HARD, backData, bwdEnv, drawBackward } from "../visuals/backView";
import { FWD_DONE, OUT_YS, X_H1, X_H2, X_OUT, drawDigitNet } from "../visuals/digitNetView";
import { GNode, chip, drawGEdge, drawGNode, edgeEnds } from "../visuals/graph";

/**
 * 08 · 反向传播 — Act A: from the parameter dot of chapter 7 a tiny computation graph grows
 * (w·x + b → σ → loss) and the question is posed: ∂L/∂w = ? Act B: the forward pass, value by value.
 * Act C: the backward pass — each edge multiplies in its local slope; the running product is the gradient.
 * Act D: that product *is* the chain rule. Act E: a node with two outgoing paths — contributions add.
 * Act F: the same wave on the real digit network, with the true gradients of all 13 002 parameters.
 * Carry in: the node "w". Carry out: the update rule w ← w − η ∂L/∂w, centred.
 */
const CH = chapterById("backprop");
const DUR = CH.dur / FPS;

// ---------------------------------------------------------------------------------- the toy chain (real numbers)
const X0 = 1.5;
const W0 = 0.8;
const B0 = -0.3;
const Y0 = 1;
const sig = (z: number) => 1 / (1 + Math.exp(-z));
const chain = (w: number) => {
  const p = w * X0;
  const z = p + B0;
  const a = sig(z);
  return { p, z, a, L: (a - Y0) ** 2 };
};
const F = chain(W0);
const G = (() => {
  const dLda = 2 * (F.a - Y0);
  const dadz = F.a * (1 - F.a);
  const dLdz = dLda * dadz;
  return { dLda, dadz, dLdz, dLdp: dLdz, dLdw: dLdz * X0, dLdx: dLdz * W0, dLdb: dLdz };
})();
const CHECK = (chain(W0 + 0.001).L - F.L) / 0.001; // numerical slope: should agree with dLdw

const N: Record<string, GNode> = {
  w: { x: W_NODE.x, y: W_NODE.y, r: W_NODE.r, label: "w" },
  x: { x: 250, y: 452, r: 24, label: "x" },
  mul: { x: 420, y: 376, r: 26, label: "×", italic: false },
  add: { x: 590, y: 376, r: 26, label: "+", italic: false },
  b: { x: 590, y: 500, r: 24, label: "b" },
  sig: { x: 760, y: 376, r: 26, label: "σ" },
  loss: { x: 930, y: 376, r: 28, label: "L" },
  y: { x: 930, y: 500, r: 24, label: "y" },
};
const EDGES: [keyof typeof N, keyof typeof N][] = [
  ["w", "mul"],
  ["x", "mul"],
  ["mul", "add"],
  ["b", "add"],
  ["add", "sig"],
  ["sig", "loss"],
  ["y", "loss"],
];

// ---------------------------------------------------------------------------------- timeline
const T = {
  build: { x: 1.0, mul: 1.6, add: 2.4, b: 2.7, sig: 3.3, loss: 4.0, y: 4.2 } as Record<string, number>,
  question: 3.8,
  // forward pass
  fwdLeaf: 9.2,
  fwd: {
    mul: [9.8, 10.9],
    add: [12.0, 13.1],
    sig: [14.1, 15.0],
    loss: [15.9, 16.8],
  } as Record<string, [number, number]>,
  // backward pass
  bwd0: 20.2,
  bwd: {
    sig: [20.9, 21.9],
    add: [23.0, 24.0],
    mulB: [25.0, 25.8],
    leaf: [26.6, 27.8],
  } as Record<string, [number, number]>,
  chainRule: 32.4,
  eStart: 41.6,
  netStart: 51.2,
  bwdNet: 53.6,
  formulaOut: 63.6,
};

const P = (t: number, [a, b]: [number, number]) => clamp((t - a) / (b - a));

// ---------------------------------------------------------------------------------- Acts A–D: the chain
function drawChain(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha < 0.003) return;
  const forward = (k: string) => {
    // forward light of an op node, on while the forward pass has reached it and until the backward pass takes over
    const w = T.fwd[k];
    if (!w) return 0;
    return seg(t, w[1], w[1] + 0.5, ease.out);
  };
  const litOut = 1 - seg(t, T.bwd0 - 0.2, T.bwd0 + 1.2, ease.inOutSine);
  const gradOf = (k: string) => {
    const win: Record<string, number> = { loss: T.bwd0 + 0.1, sig: T.bwd.sig[1], add: T.bwd.add[1], mul: T.bwd.mulB[1], b: T.bwd.mulB[1], w: T.bwd.leaf[1], x: T.bwd.leaf[1] };
    const t0 = win[k];
    return t0 === undefined ? 0 : seg(t, t0, t0 + 0.5, ease.out);
  };
  const appear = (k: string) => seg(t, T.build[k], T.build[k] + 0.8, ease.soft);

  // edges
  for (const [a, b] of EDGES) {
    const g = Math.min(appear(a as string) || 1, 1) * appear(b as string);
    drawGEdge(ctx, N[a], N[b], { alpha: alpha * clamp(g * 1.5), grow: seg(t, T.build[b as string] - 0.1, T.build[b as string] + 0.7, ease.soft) });
  }
  // nodes
  for (const k of Object.keys(N)) {
    const ap = k === "w" ? 1 : appear(k);
    if (ap < 0.003) continue;
    const lit = (k === "mul" || k === "add" || k === "sig" || k === "loss" ? forward(k) : k === "w" || k === "x" || k === "b" || k === "y" ? seg(t, T.fwdLeaf, T.fwdLeaf + 0.6) : 0) * litOut;
    const grad = gradOf(k) * (k === "loss" ? 1 : 1);
    if (k === "w") {
      // the carried node: identical to chapter 7's last frame until something lights it
      drawWNode(ctx, N.w.x, N.w.y, 1, alpha);
      const g = Math.max(grad, seg(t, 4.6, 5.4) * (1 - seg(t, 8.6, 9.2)) * (0.42 + 0.22 * Math.sin(t * 3.4)));
      if (lit > 0.02) {
        glow(ctx, N.w.x, N.w.y, N.w.r * (1.6 + lit), RGB_POS, (0.22 + 0.55 * lit) * alpha);
        circle(ctx, N.w.x, N.w.y, N.w.r * 0.96, { fill: rgba(RGB_POS, 0.06 + 0.28 * lit), alpha });
      }
      if (g > 0.02) {
        glow(ctx, N.w.x, N.w.y, N.w.r * (1.6 + g), RGB_NEG, (0.22 + 0.6 * g) * alpha);
        circle(ctx, N.w.x, N.w.y, N.w.r * 0.96, { fill: rgba(RGB_NEG, 0.06 + 0.3 * g), alpha });
      }
    } else {
      drawGNode(ctx, N[k], { alpha: alpha * clamp(ap * 1.6), scale: 0.8 + 0.2 * ap, lit, grad });
    }
  }

  // leaf values
  const val = (t0: number) => seg(t, t0, t0 + 0.6, ease.out) * alpha;
  const mono = { font: "mono" as const, weight: 600 };
  text(ctx, `w = ${fmt(W0, 1)}`, N.w.x - 46, N.w.y + 6, { size: 18, color: C.text, align: "right", alpha: val(T.fwdLeaf), ...mono });
  text(ctx, `x = ${fmt(X0, 1)}`, N.x.x - 40, N.x.y + 6, { size: 18, color: C.text, align: "right", alpha: val(T.fwdLeaf), ...mono });
  text(ctx, `b = ${fmt(B0, 1)}`, N.b.x, N.b.y + 46, { size: 18, color: C.text, align: "center", alpha: val(T.fwdLeaf + 0.3), ...mono });
  text(ctx, `y = ${fmt(Y0, 0)}`, N.y.x, N.y.y + 46, { size: 18, color: C.text, align: "center", alpha: val(T.fwdLeaf + 0.3), ...mono });
  // op values (above)
  const above = (k: string, s: string, t0: number, color: string = C.text) =>
    text(ctx, s, N[k].x, N[k].y - N[k].r - 16, { size: 18, color, align: "center", alpha: val(t0), ...mono });
  above("mul", `p = ${fmt(F.p, 2)}`, T.fwd.mul[1]);
  above("add", `z = ${fmt(F.z, 2)}`, T.fwd.add[1]);
  above("sig", `a = ${fmt(F.a, 3)}`, T.fwd.sig[1]);
  above("loss", `L = ${fmt(F.L, 3)}`, T.fwd.loss[1], C.neg);

  // forward pulses
  const fp = (a: keyof typeof N, b: keyof typeof N, win: [number, number], rgb: RGB = RGB_POS) => {
    const p = P(t, win);
    if (p <= 0 || p >= 1) return;
    const e = edgeEnds(N[a], N[b]);
    pulse(ctx, e.x1, e.y1, e.x2, e.y2, ease.inOutSine(p), rgb, 3.4, alpha);
  };
  fp("w", "mul", T.fwd.mul);
  fp("x", "mul", T.fwd.mul);
  fp("mul", "add", T.fwd.add);
  fp("b", "add", T.fwd.add);
  fp("add", "sig", T.fwd.sig);
  fp("sig", "loss", T.fwd.loss);
  fp("y", "loss", T.fwd.loss);

  // backward pulses, gradient labels and edge factors
  const bp = (a: keyof typeof N, b: keyof typeof N, win: [number, number]) => {
    const p = P(t, win);
    if (p <= 0 || p >= 1) return;
    const e = edgeEnds(N[a], N[b]);
    pulse(ctx, e.x2, e.y2, e.x1, e.y1, ease.inOutSine(p), RGB_NEG, 3.6, alpha);
  };
  bp("sig", "loss", T.bwd.sig);
  bp("add", "sig", T.bwd.add);
  bp("mul", "add", T.bwd.mulB);
  bp("b", "add", T.bwd.mulB);
  bp("w", "mul", T.bwd.leaf);
  bp("x", "mul", T.bwd.leaf);

  const factor = (a: keyof typeof N, b: keyof typeof N, s: string, win: [number, number], k = 0.5, lift = -22) => {
    const e = edgeEnds(N[a], N[b]);
    const A = seg(t, win[0] + (win[1] - win[0]) * 0.45, win[1], ease.out) * alpha;
    const hot = 1;
    chip(ctx, s, e.x1 + (e.x2 - e.x1) * k, e.y1 + (e.y2 - e.y1) * k + lift, C.neg, A * hot, 15);
  };
  factor("sig", "loss", `×(${fmt(G.dLda, 2)})`, T.bwd.sig);
  factor("add", "sig", `×${fmt(G.dadz, 2)}`, T.bwd.add);
  factor("mul", "add", "×1", T.bwd.mulB);
  factor("b", "add", "×1", T.bwd.mulB, 0.5, 0);
  factor("w", "mul", `×${fmt(X0, 1)}`, T.bwd.leaf, 0.5, -20);
  factor("x", "mul", `×${fmt(W0, 1)}`, T.bwd.leaf, 0.5, 20);

  // gradient read-outs below the nodes (orange)
  const grad = (k: string, tex: string, v: number, t0: number, dx = 0, dy = 0) => {
    const A = seg(t, t0, t0 + 0.6, ease.out) * alpha;
    if (A < 0.01) return;
    const n = N[k];
    text(ctx, tex, n.x + dx, n.y + n.r + 22 + dy, { size: 13.5, color: "rgba(255,138,61,0.75)", align: "center", alpha: A, font: "mono", weight: 500 });
    text(ctx, v === 1 ? "1" : fmt(v, 3), n.x + dx, n.y + n.r + 44 + dy, { size: 19, color: C.neg, align: "center", alpha: A, font: "mono", weight: 700 });
  };
  grad("loss", "∂L/∂L", 1, T.bwd0 + 0.3);
  grad("sig", "∂L/∂a", G.dLda, T.bwd.sig[1]);
  grad("add", "∂L/∂z", G.dLdz, T.bwd.add[1], -60, 0);
  grad("mul", "∂L/∂p", G.dLdp, T.bwd.mulB[1]);
  {
    const A = seg(t, T.bwd.mulB[1], T.bwd.mulB[1] + 0.6, ease.out) * alpha;
    if (A > 0.01) text(ctx, `∂L/∂b = ${fmt(G.dLdb, 3)}`, N.b.x + 40, N.b.y + 6, { size: 16, color: C.neg, align: "left", alpha: A, font: "mono", weight: 700 });
  }
  grad("x", "∂L/∂x", G.dLdx, T.bwd.leaf[1], 0, 18);
  // the one we asked about
  {
    const A = seg(t, T.bwd.leaf[1], T.bwd.leaf[1] + 0.7, ease.out) * alpha;
    if (A > 0.01) {
      text(ctx, "∂L/∂w", N.w.x, N.w.y + N.w.r + 26, { size: 15, color: "rgba(255,138,61,0.85)", align: "center", alpha: A, font: "mono", weight: 500 });
      text(ctx, fmt(G.dLdw, 3), N.w.x, N.w.y + N.w.r + 52, { size: 24, color: C.neg, align: "center", alpha: A, font: "mono", weight: 700 });
    }
  }
}

/** The running product at the top of the frame during the backward pass. */
function drawTicker(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  const f = (v: number) => (v < 0 ? `(${fmt(v, 3)})` : fmt(v, 3));
  const stages: { at: number; s: string }[] = [
    { at: T.bwd0 + 0.2, s: "∂L/∂L = 1" },
    { at: T.bwd.sig[1], s: `∂L/∂a = 1 × ${f(G.dLda)} = ${fmt(G.dLda, 3)}` },
    { at: T.bwd.add[1], s: `∂L/∂z = ${f(G.dLda)} × ${fmt(G.dadz, 3)} = ${fmt(G.dLdz, 3)}` },
    { at: T.bwd.mulB[1], s: `∂L/∂p = ${f(G.dLdz)} × 1 = ${fmt(G.dLdp, 3)}` },
    { at: T.bwd.leaf[1], s: `∂L/∂w = ${f(G.dLdp)} × ${fmt(X0, 1)} = ${fmt(G.dLdw, 3)}` },
  ];
  stages.forEach((st, k) => {
    const next = stages[k + 1]?.at ?? 1e9;
    const A = seg(t, st.at, st.at + 0.45, ease.out) * (1 - seg(t, next - 0.05, next + 0.35, ease.inOutSine)) * alpha;
    if (A > 0.01) text(ctx, st.s, 640, 156, { size: 30, weight: 700, color: C.text, align: "center", font: "mono", alpha: A });
  });
}

// ---------------------------------------------------------------------------------- Act E: two paths
const D: Record<string, GNode> = {
  h: { x: 330, y: 376, r: 26, label: "h" },
  u: { x: 590, y: 282, r: 26, label: "u" },
  v: { x: 590, y: 470, r: 26, label: "v" },
  L: { x: 850, y: 376, r: 28, label: "L" },
};
const DE: [keyof typeof D, keyof typeof D][] = [
  ["h", "u"],
  ["h", "v"],
  ["u", "L"],
  ["v", "L"],
];
const H0 = 0.5;
const DV = { u: 3 * H0, v: H0 * H0, L: 3 * H0 * H0 * H0 };
const DG = { u: DV.v, v: DV.u, hu: DV.v * 3, hv: DV.u * (2 * H0), h: DV.v * 3 + DV.u * (2 * H0) };
const TE = { fwd1: [1.5, 2.4] as [number, number], fwd2: [2.8, 3.7] as [number, number], back0: 4.0, back1: [4.4, 5.3] as [number, number], back2: [5.9, 7.0] as [number, number], sum: 7.3 };

function drawDiamond(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha < 0.003) return;
  const s = t - T.eStart;
  const ap = seg(s, 0, 0.9, ease.soft);
  for (const [a, b] of DE) drawGEdge(ctx, D[a], D[b], { alpha: alpha * ap, grow: ap });
  const lit = (k: string) => {
    const w = k === "h" ? [0.6, 1.2] : k === "u" || k === "v" ? TE.fwd1 : TE.fwd2;
    return seg(s, w[1], w[1] + 0.5, ease.out) * (1 - seg(s, TE.back0 - 0.2, TE.back0 + 1, ease.inOutSine));
  };
  const gr = (k: string) => {
    const t0 = k === "L" ? TE.back0 : k === "u" || k === "v" ? TE.back1[1] : TE.sum;
    return seg(s, t0, t0 + 0.5, ease.out);
  };
  for (const k of Object.keys(D)) drawGNode(ctx, D[k], { alpha: alpha * ap, scale: 0.85 + 0.15 * ap, lit: lit(k), grad: gr(k) });

  const mono = { font: "mono" as const, weight: 600 };
  const val = (t0: number) => seg(s, t0, t0 + 0.6, ease.out) * alpha;
  text(ctx, `h = ${fmt(H0, 1)}`, D.h.x - 44, D.h.y + 6, { size: 18, color: C.text, align: "right", alpha: val(0.8), ...mono });
  text(ctx, `u = 3h = ${fmt(DV.u, 2)}`, D.u.x, D.u.y - D.u.r - 16, { size: 18, color: C.text, align: "center", alpha: val(TE.fwd1[1]), ...mono });
  text(ctx, `v = h² = ${fmt(DV.v, 2)}`, D.v.x, D.v.y + D.v.r + 30, { size: 18, color: C.text, align: "center", alpha: val(TE.fwd1[1]), ...mono });
  text(ctx, `L = u·v = ${fmt(DV.L, 3)}`, D.L.x, D.L.y - D.L.r - 16, { size: 18, color: C.neg, align: "center", alpha: val(TE.fwd2[1]), ...mono });

  const fp = (a: keyof typeof D, b: keyof typeof D, win: [number, number]) => {
    const p = P(s, win);
    if (p <= 0 || p >= 1) return;
    const e = edgeEnds(D[a], D[b]);
    pulse(ctx, e.x1, e.y1, e.x2, e.y2, ease.inOutSine(p), RGB_POS, 3.4, alpha);
  };
  fp("h", "u", TE.fwd1);
  fp("h", "v", TE.fwd1);
  fp("u", "L", TE.fwd2);
  fp("v", "L", TE.fwd2);
  const bp = (a: keyof typeof D, b: keyof typeof D, win: [number, number]) => {
    const p = P(s, win);
    if (p <= 0 || p >= 1) return;
    const e = edgeEnds(D[a], D[b]);
    pulse(ctx, e.x2, e.y2, e.x1, e.y1, ease.inOutSine(p), RGB_NEG, 3.6, alpha);
  };
  bp("u", "L", TE.back1);
  bp("v", "L", TE.back1);
  bp("h", "u", TE.back2);
  bp("h", "v", TE.back2);

  const fac = (a: keyof typeof D, b: keyof typeof D, str: string, win: [number, number], lift: number, k = 0.5) => {
    const e = edgeEnds(D[a], D[b]);
    const A = seg(s, win[0] + (win[1] - win[0]) * 0.45, win[1], ease.out) * alpha;
    chip(ctx, str, e.x1 + (e.x2 - e.x1) * k, e.y1 + (e.y2 - e.y1) * k + lift, C.neg, A, 15);
  };
  fac("u", "L", `×${fmt(DG.u, 2)}`, TE.back1, -22);
  fac("v", "L", `×${fmt(DG.v, 2)}`, TE.back1, 24);
  fac("h", "u", "×3", TE.back2, -22);
  fac("h", "v", `×${fmt(2 * H0, 1)}`, TE.back2, 24);

  // read-outs
  const gtext = (k: string, tex: string, v: number, t0: number, dy: number, dx = 0) => {
    const A = seg(s, t0, t0 + 0.6, ease.out) * alpha;
    if (A < 0.01) return;
    text(ctx, tex, D[k].x + dx, D[k].y + dy, { size: 13.5, color: "rgba(255,138,61,0.75)", align: "center", alpha: A, font: "mono", weight: 500 });
    text(ctx, v === 1 ? "1" : fmt(v, 2), D[k].x + dx, D[k].y + dy + 22, { size: 19, color: C.neg, align: "center", alpha: A, font: "mono", weight: 700 });
  };
  gtext("L", "∂L/∂L", 1, TE.back0 + 0.2, D.L.r + 22);
  gtext("u", "∂L/∂u", DG.u, TE.back1[1], -D.u.r - 62, 0);
  gtext("v", "∂L/∂v", DG.v, TE.back1[1], D.v.r + 52, 0);
  // the two contributions meet at h
  const m = seg(s, TE.back2[1] - 0.3, TE.back2[1] + 0.5, ease.out) * alpha;
  if (m > 0.01) {
    const merge = seg(s, TE.back2[1] + 0.2, TE.sum, ease.inOut);
    chip(ctx, fmt(DG.hu, 2), D.h.x - 120 + 70 * merge, D.h.y - 78 + 46 * merge, C.neg, m * (1 - 0.6 * merge), 16);
    chip(ctx, fmt(DG.hv, 2), D.h.x - 120 + 70 * merge, D.h.y + 78 - 46 * merge, C.neg, m * (1 - 0.6 * merge), 16);
  }
  const sm = seg(s, TE.sum, TE.sum + 0.6, ease.out) * alpha;
  if (sm > 0.01) {
    text(ctx, "∂L/∂h", D.h.x, D.h.y + D.h.r + 26, { size: 14, color: "rgba(255,138,61,0.8)", align: "center", alpha: sm, font: "mono", weight: 500 });
    text(ctx, `${fmt(DG.hu, 2)} + ${fmt(DG.hv, 2)} = ${fmt(DG.h, 2)}`, D.h.x, D.h.y + D.h.r + 52, { size: 20, color: C.neg, align: "center", alpha: sm, font: "mono", weight: 700 });
    text(ctx, `验证：L = 3h³ ，∂L/∂h = 9h² = ${fmt(9 * H0 * H0, 2)}`, 640, 566, { size: 17, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: seg(s, TE.sum + 0.8, TE.sum + 1.5, ease.out) * alpha });
  }
}

// ---------------------------------------------------------------------------------- Act F: the real network
function drawRealNet(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha < 0.003) return;
  const d = backData();
  const s = t - T.netStart;
  const reveal = seg(s, 0, 1.2, ease.soft);
  ctx.save();
  ctx.globalAlpha *= alpha * reveal;
  const env = bwdEnv(t, T.bwdNet);
  drawDigitNet(ctx, { img: HARD().img, key: "hard", fwd: FWD_DONE, pulses: false, t, edgeDim: 1 - 0.72 * env.err });
  ctx.restore();
  drawBackward(ctx, env, alpha * reveal);

  // the error at the output: prediction − answer
  const err = seg(t, T.bwdNet - 0.6, T.bwdNet + 0.3, ease.out) * alpha;
  if (err > 0.01) {
    text(ctx, `P(7) = ${fmt(d.probs[7], 2)}`, X_OUT + 60, OUT_YS[7] + 6, { size: 15, weight: 600, color: C.neg, font: "mono", alpha: err });
    text(ctx, "正确答案", X_OUT + 60, OUT_YS[7] + 26, { size: 13, weight: 500, color: C.dim, font: "cjk", alpha: err });
  }
  // gradient counts, layer by layer
  const cnt = (x: number, label: string, n: number, t0: number) => {
    const A = seg(t, t0, t0 + 0.6, ease.out) * alpha;
    if (A < 0.01) return;
    text(ctx, thousands(n), x, 568, { size: 24, weight: 700, color: C.neg, align: "center", font: "mono", alpha: A });
    text(ctx, label, x, 590, { size: 13, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: A });
  };
  cnt(X_OUT + 6, "个梯度", d.counts.out, T.bwdNet + 1.9);
  cnt(X_H2, "个梯度", d.counts.h2, T.bwdNet + 3.3);
  cnt(X_H1, "个梯度", d.counts.h1, T.bwdNet + 4.9);
  // the total
  const tot = seg(t, T.bwdNet + 5.6, T.bwdNet + 6.6, ease.out) * alpha;
  if (tot > 0.01) {
    const n = d.counts.out + d.counts.h2 + d.counts.h1;
    const k = ease.inOutSine(seg(t, T.bwdNet + 5.6, T.bwdNet + 7.2, ease.linear));
    text(ctx, thousands(n * k), 1128, 292, { size: 44, weight: 700, color: C.neg, align: "center", font: "mono", alpha: tot });
    text(ctx, "个梯度", 1128, 324, { size: 17, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: tot });
    text(ctx, "一次前向 + 一次反向", 1128, 350, { size: 14, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: tot });
  }
}

// ---------------------------------------------------------------------------------- scene
function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  if (t < 0 || t >= DUR + 0.001) return;

  // Acts A–D live on the chain; it dissolves into the diamond
  const chainA = 1 - seg(t, 40.6, 41.6, ease.inOutSine);
  const dim = 1 - 0.55 * seg(t, T.chainRule - 0.4, T.chainRule + 0.6, ease.inOutSine) * (1 - seg(t, 40.6, 41.4));
  drawChain(ctx, t, chainA * dim);
  drawTicker(ctx, t, chainA * (1 - seg(t, 30.6, 31.4, ease.inOutSine)));
  drawInterp(ctx, t, chainA);

  // chain-rule replay pulses over the dimmed chain
  const cr = T.chainRule;
  const rp = (a: keyof typeof N, b: keyof typeof N, win: [number, number]) => {
    const p = P(t, win);
    if (p <= 0 || p >= 1) return;
    const e = edgeEnds(N[a], N[b]);
    pulse(ctx, e.x2, e.y2, e.x1, e.y1, ease.inOutSine(p), RGB_NEG, 3.8, chainA);
  };
  rp("sig", "loss", [cr + 0.6, cr + 1.6]);
  rp("add", "sig", [cr + 2.0, cr + 3.0]);
  rp("mul", "add", [cr + 3.4, cr + 4.2]);
  rp("w", "mul", [cr + 4.6, cr + 5.6]);

  drawDiamond(ctx, t, seg(t, T.eStart, T.eStart + 0.6, ease.linear) * (1 - seg(t, 50.2, 51.2, ease.inOutSine)));

  // Act F: the real network fades out to leave the rule
  const netA = seg(t, T.netStart, T.netStart + 0.2, ease.linear) * (1 - 0.86 * seg(t, T.formulaOut - 0.4, T.formulaOut + 0.8, ease.inOutSine)) * (1 - seg(t, DUR - 1.4, DUR - 0.3, ease.inOutSine));
  drawRealNet(ctx, t, netA);
}

/** What the number means, and a numerical check that it is right. */
function drawInterp(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  const a = seg(t, 28.6, 29.4, ease.out) * (1 - seg(t, 31.0, 31.8, ease.inOutSine)) * alpha;
  if (a > 0.01) {
    text(ctx, "斜率为负：把 w 稍微调大，损失就会下降", 640, 236, { size: 22, weight: 600, color: C.text, align: "center", font: "cjk", alpha: a });
  }
  const b = seg(t, 29.8, 30.6, ease.out) * (1 - seg(t, 31.0, 31.8, ease.inOutSine)) * alpha;
  if (b > 0.01) {
    text(ctx, `数值验证：w 增大 0.001，L 实际变化 ${fmt(CHECK * 0.001, 6)}（≈ ${fmt(G.dLdw, 3)} × 0.001）`, 640, 270, {
      size: 16,
      weight: 500,
      color: C.dim,
      align: "center",
      font: "cjk",
      alpha: b,
    });
  }
}

// ---------------------------------------------------------------------------------- DOM overlay (maths)
const Overlay: React.FC = () => {
  const { t } = useChapterClock();

  // Act A — the question
  const q = seg(t, T.question, T.question + 0.9, ease.out) * (1 - seg(t, 8.4, 9.2, ease.inOutSine));
  // Act B — how each value is computed, above its node
  const tape = (t0: number) => seg(t, t0, t0 + 0.7, ease.out) * (1 - seg(t, 19.6, 20.4, ease.inOutSine));
  // Act D — the chain rule
  const cr = T.chainRule;
  const fa = seg(t, cr - 0.2, cr + 0.6, ease.out) * (1 - seg(t, 40.2, 41.2, ease.inOutSine));
  const lit = (t0: number) => seg(t, t0, t0 + 0.4, ease.out);
  const o = (t0: number) => 0.32 + 0.68 * lit(t0);
  const col = (t0: number) => (lit(t0) > 0.5 ? C.neg : undefined);
  const terms = {
    t1: { o: o(cr + 0.6), c: col(cr + 0.6) },
    t2: { o: o(cr + 2.0), c: col(cr + 2.0) },
    t3: { o: o(cr + 3.4), c: col(cr + 3.4) },
    t4: { o: o(cr + 4.6), c: col(cr + 4.6) },
    res: { o: lit(cr + 6.2), c: C.neg },
  };
  // Act F end — the update rule (carried into chapter 9)
  const rule = seg(t, T.formulaOut, T.formulaOut + 1.2, ease.out);

  return (
    <>
      {q > 0.01 && (
        <div style={{ position: "absolute", left: 0, width: 1280, top: 92, display: "flex", justifyContent: "center", opacity: q }}>
          <Formula tex={String.raw`\dfrac{\partial L}{\partial \htmlClass{w}{w}}=\;?`} size={54} terms={{ w: { c: C.neg } }} />
        </div>
      )}
      {[
        { x: N.mul.x, tex: String.raw`p=w\,x`, t0: T.fwd.mul[1] },
        { x: N.add.x, tex: String.raw`z=p+b`, t0: T.fwd.add[1] },
        { x: N.sig.x, tex: String.raw`a=\sigma(z)`, t0: T.fwd.sig[1] },
        { x: N.loss.x, tex: String.raw`L=(a-y)^2`, t0: T.fwd.loss[1] },
      ].map((f) => {
        const a = tape(f.t0 - 0.3) * (1 - seg(t, 40.2, 41.0));
        return (
          a > 0.01 && (
            <div key={f.tex} style={{ position: "absolute", left: f.x, top: 258, transform: "translateX(-50%)", opacity: a }}>
              <Formula tex={f.tex} size={28} color={C.dim} />
            </div>
          )
        );
      })}
      {fa > 0.01 && (
        <div style={{ position: "absolute", left: 0, width: 1280, top: 86, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: fa }}>
          <Formula
            tex={String.raw`\dfrac{\partial L}{\partial w}=\htmlClass{t1}{\dfrac{\partial L}{\partial a}}\cdot\htmlClass{t2}{\dfrac{\partial a}{\partial z}}\cdot\htmlClass{t3}{\dfrac{\partial z}{\partial p}}\cdot\htmlClass{t4}{\dfrac{\partial p}{\partial w}}`}
            size={40}
            terms={terms}
          />
          <Formula
            tex={String.raw`=\htmlClass{t1}{(${fmt(G.dLda, 3).replace("−", "-")})}\times\htmlClass{t2}{${fmt(G.dadz, 3)}}\times\htmlClass{t3}{1}\times\htmlClass{t4}{${fmt(X0, 1)}}\htmlClass{res}{=${fmt(G.dLdw, 3).replace("−", "-")}}`}
            size={36}
            terms={terms}
          />
        </div>
      )}
      {rule > 0.01 && <UpdateRule opacity={rule} />}
    </>
  );
};

export const Ch08Backprop: React.FC = () => (
  <>
    <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} />
    <Overlay />
    <ChapterCard />
    <Captions />
  </>
);

