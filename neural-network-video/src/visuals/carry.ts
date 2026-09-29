/**
 * Objects that survive a chapter boundary. onetake's rule is that a transition must document
 * what carries over; this file is where two neighbouring chapters agree on the pose (position,
 * size, look) of the thing they both draw during their overlap.
 */
import { CanvasRenderingContext2DLike, NeuronStyle } from "./types";
import { RGB_NEG, RGB_POS } from "../theme";
import { grey, mixRGB, rgba } from "../lib/color";
import { arrow, circle, glow, line, rrect, text } from "../lib/draw";
import { ease, lerp, seg } from "../lib/math";
import { FPS } from "../theme";
import { chapterById } from "../timeline";
import { sigmoid } from "./activations";
import { FnPlotOpts, Plot, Rect, Win, drawFunctionPlot } from "./plot";
import { C } from "../theme";
import { clamp } from "../lib/math";
import { heroImage } from "./data";

type Ctx = CanvasRenderingContext2DLike;

/** Ch.1 → Ch.2: three pixels become the three inputs of one neuron. */
export const HERO = {
  neuron: { x: 700, y: 330, r: 58 },
  inputs: [
    { x: 330, y: 196 },
    { x: 330, y: 330 },
    { x: 330, y: 464 },
  ],
  inputSize: 46,
  outX: 880,
} as const;

/** The three hero pixels: real pixel values from the hero '7', close to 0.9 / 0.1 / 0.8. */
export const heroInputCells = (() => {
  const img = heroImage();
  const targets = [0.92, 0.12, 0.8];
  return targets.map((t) => {
    let best = 0;
    let bd = 9;
    for (let i = 0; i < img.length; i++) {
      const r = Math.floor(i / 28);
      const c = i % 28;
      // stay in the digit's core, away from the frame
      if (r < 5 || r > 23 || c < 5 || c > 23) continue;
      const d = Math.abs(img[i] - t);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return { index: best, value: img[best] };
  });
})();

export const heroInputValues = heroInputCells.map((c) => +c.value.toFixed(2));

export function drawInputNode(ctx: Ctx, x: number, y: number, v: number, size: number = HERO.inputSize, alpha = 1, label?: string) {
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  rrect(ctx, x - size / 2, y - size / 2, size, size, 8, { fill: rgba(grey(v)), stroke: "rgba(255,255,255,0.22)", lw: 1 });
  if (label) text(ctx, label, x, y + size / 2 + 22, { size: 16, weight: 500, color: C.dim, align: "center", font: "mono" });
  ctx.globalAlpha = a;
}

/** Neutral wires input → neuron, exactly as chapter 1 leaves them and chapter 2 picks them up. */
export function drawHeroEdges(ctx: Ctx, alpha = 1) {
  if (alpha <= 0) return;
  for (const p of HERO.inputs) {
    line(ctx, p.x + HERO.inputSize / 2 + 2, p.y, HERO.neuron.x - HERO.neuron.r - 2, HERO.neuron.y, {
      color: "rgba(255,255,255,0.3)",
      lw: 1.5,
      alpha,
    });
  }
}

/** The output wire leaving the neuron. */
export function drawHeroOutput(ctx: Ctx, alpha = 1) {
  if (alpha <= 0) return;
  arrow(ctx, HERO.neuron.x + HERO.neuron.r + 2, HERO.neuron.y, HERO.outX, HERO.neuron.y, {
    color: "rgba(255,255,255,0.3)",
    lw: 1.5,
    alpha,
  });
}

/**
 * The neuron glyph. `act` ∈ [0,1] is how strongly it fires: it fills with cyan light and — above
 * ~0.5 — emits a halo. `curve` draws the tiny activation function inside.
 */
export function drawNeuron(ctx: Ctx, x: number, y: number, r: number, st: NeuronStyle = {}) {
  const act = clamp(st.act ?? 0);
  const alpha = st.alpha ?? 1;
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha;
  if (act > 0.02) glow(ctx, x, y, r * (1.5 + act * 1.1), RGB_POS, 0.28 + 0.5 * act);
  circle(ctx, x, y, r, { fill: "#0c1118" });
  if (act > 0) circle(ctx, x, y, r * 0.96, { fill: rgba(RGB_POS, 0.1 + 0.62 * act) });
  circle(ctx, x, y, r, { stroke: act > 0.02 ? rgba([190, 235, 250], 0.55 + 0.4 * act) : "rgba(255,255,255,0.38)", lw: 2 });
  if (st.glyph !== false) {
    // Σ | f  — the two things a neuron does
    line(ctx, x, y - r * 0.5, x, y + r * 0.5, { color: "rgba(255,255,255,0.18)", lw: 1 });
    text(ctx, "Σ", x - r * 0.34, y + r * 0.2, { size: r * 0.62, weight: 500, color: C.dim, align: "center", font: "sans", alpha: 0.85 });
    text(ctx, st.fLabel ?? "f", x + r * 0.34, y + r * 0.2, { size: r * 0.6, weight: 500, color: C.dim, align: "center", font: "sans", italic: true, alpha: 0.85 });
  }
  ctx.globalAlpha = a0;
}

// ------------------------------------------------------------------------------------------
// Ch.2 → Ch.3: the activation-function panel. A small inset next to the neuron grows into the
// full-size plot that chapter 3 is built around.
//
// Ownership rule for every carried object: the outgoing chapter draws it until its nominal end
// (t < dur), the incoming chapter from its nominal start (t ≥ 0) — so on the hand-off frame the
// object is drawn exactly once and anti-aliased edges never double up.
// ------------------------------------------------------------------------------------------
export const PLOT_MINI: Rect = { x: 948, y: 256, w: 220, h: 156 };
export const PLOT_BIG: Rect = { x: 372, y: 116, w: 540, h: 380 };
export const SIG_WIN: Win = { x0: -6, x1: 6, y0: -0.06, y1: 1.06 };

/** Frame window (master frames) in which the panel travels from inset to full size. */
const NEURON = chapterById("neuron");
export const PLOT_TRAVEL = [NEURON.from + 51.4 * FPS, NEURON.from + 55.4 * FPS] as const;

export function activationPlotRect(gf: number): Rect {
  const e = seg(gf, PLOT_TRAVEL[0], PLOT_TRAVEL[1], ease.inOut);
  return {
    x: lerp(PLOT_MINI.x, PLOT_BIG.x, e),
    y: lerp(PLOT_MINI.y, PLOT_BIG.y, e),
    w: lerp(PLOT_MINI.w, PLOT_BIG.w, e),
    h: lerp(PLOT_MINI.h, PLOT_BIG.h, e),
  };
}

export interface CarriedPlotOpts extends FnPlotOpts {
  /** The operating point (z, σ(z)). */
  z: number;
}

export function drawCarriedActivationPlot(ctx: Ctx, gf: number, o: CarriedPlotOpts): Plot {
  return drawFunctionPlot(ctx, activationPlotRect(gf), SIG_WIN, sigmoid, { ...o, dotZ: o.z });
}

// ------------------------------------------------------------------------------------------
// Ch.3 → Ch.4: the row of ReLU neurons becomes the first hidden layer of the digit network.
// ------------------------------------------------------------------------------------------
export const H1 = {
  x: 520,
  r: 9.5,
  ys: Array.from({ length: 16 }, (_, i) => 132 + i * 26.4),
} as const;

/** A small layer neuron: dark disc, ring, cyan fill by activation (0–1). */
export function drawSmallNeuron(ctx: Ctx, x: number, y: number, r: number, act = 0, alpha = 1) {
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha;
  const v = clamp(act);
  if (v > 0.25) glow(ctx, x, y, r * (1.8 + v * 1.4), RGB_POS, 0.16 + 0.5 * v);
  circle(ctx, x, y, r, { fill: "#0c1118" });
  if (v > 0.01) circle(ctx, x, y, r * 0.92, { fill: rgba([76 + 130 * v * v, 201 + 40 * v * v, 240 + 12 * v * v], 0.12 + 0.88 * v) });
  circle(ctx, x, y, r, { stroke: v > 0.04 ? rgba([200, 238, 252], 0.5 + 0.45 * v) : "rgba(255,255,255,0.34)", lw: 1.4 });
  ctx.globalAlpha = a0;
}

// ------------------------------------------------------------------------------------------
// Ch.4 → Ch.5: two output neurons become the two class markers ("A" orange, "B" cyan).
// ------------------------------------------------------------------------------------------
export const LEGEND = {
  A: { x: 1042, y: 92 },
  B: { x: 1042, y: 124 },
  r: 8,
} as const;

/** A filled class marker (orange = class A, cyan = class B). */
export function drawClassDot(ctx: Ctx, x: number, y: number, r: number, cls: "A" | "B", alpha = 1) {
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha;
  const col = cls === "A" ? RGB_NEG : RGB_POS;
  glow(ctx, x, y, r * 2.6, col, 0.4);
  circle(ctx, x, y, r, { fill: rgba(col, 1) });
  circle(ctx, x, y, r, { stroke: "rgba(255,255,255,0.55)", lw: 1.2 });
  ctx.globalAlpha = a0;
}

// ------------------------------------------------------------------------------------------
// Ch.7 → Ch.8: the point θ that gradient descent has been moving becomes the first node of a
// computation graph — the orange "current parameters" ball swells into a labelled node "w".
// ------------------------------------------------------------------------------------------
export const W_NODE = { x: 250, y: 300, r: 30 } as const;

/**
 * The weight node. k ∈ [0,1] morphs the orange ball of chapter 7 (k = 0: 7 px, orange, haloed)
 * into the graph node of chapter 8 (k = 1: dark disc, white ring, italic "w", faint orange halo —
 * the parameter whose gradient the backward pass will deliver).
 */
export function drawWNode(ctx: Ctx, x: number, y: number, k: number, alpha = 1) {
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha;
  const e = ease.inOut(clamp(k));
  const r = lerp(7, W_NODE.r, e);
  glow(ctx, x, y, lerp(26, W_NODE.r * 1.9, e), RGB_NEG, lerp(0.85, 0.3, e));
  circle(ctx, x, y, r, { fill: rgba(mixRGB(RGB_NEG, [12, 17, 24], e)) });
  circle(ctx, x, y, r, { stroke: `rgba(255,255,255,${lerp(0.9, 0.85, e)})`, lw: lerp(1.6, 2, e) });
  const la = clamp((e - 0.45) / 0.55);
  if (la > 0.01) text(ctx, "w", x, y + r * 0.34, { size: r * 0.95, weight: 500, color: C.text, align: "center", font: "sans", italic: true, alpha: la });
  ctx.globalAlpha = a0;
}

// ------------------------------------------------------------------------------------------
// Ch.10 → Ch.11: a 3×3 window of real pixels — the thing a convolution looks through.
// ------------------------------------------------------------------------------------------
export const WIN3 = { cx: 640, cy: 322, cell: 56 } as const;

/** The 3×3 patch of the hero '7' that straddles the top bar: a horizontal edge, clearly visible. */
export const WIN_PATCH = (() => {
  const img = heroImage();
  let best = { r: 8, c: 8, score: -1 };
  for (let r = 3; r < 20; r++) {
    for (let c = 3; c < 22; c++) {
      // bright row above, dark row below, and a soft middle: the classic edge
      const row = (rr: number) => (img[(r + rr) * 28 + c] + img[(r + rr) * 28 + c + 1] + img[(r + rr) * 28 + c + 2]) / 3;
      const score = row(0) - row(2) - Math.abs(row(1) - 0.5) * 0.5;
      if (score > best.score) best = { r, c, score };
    }
  }
  const values: number[] = [];
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) values.push(+img[(best.r + dr) * 28 + best.c + dc].toFixed(2));
  return { r: best.r, c: best.c, values };
})();

/** The window, drawn as nine grey cells with a bright frame. `numbers` prints each pixel value on its cell. */
export function drawWin3(ctx: Ctx, cx: number, cy: number, cell: number, alpha = 1, numbers = false) {
  if (alpha <= 0.003) return;
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha;
  for (let i = 0; i < 9; i++) {
    const x = cx + ((i % 3) - 1.5) * cell;
    const y = cy + (Math.floor(i / 3) - 1.5) * cell;
    const v = WIN_PATCH.values[i];
    rrect(ctx, x + 1.5, y + 1.5, cell - 3, cell - 3, 5, { fill: rgba(grey(v)), stroke: "rgba(255,255,255,0.18)", lw: 1 });
    if (numbers) text(ctx, v.toFixed(1), x + cell / 2, y + cell / 2 + 5.5, { size: cell * 0.3, weight: 600, color: v > 0.55 ? "#0b0e14" : C.text, align: "center", font: "mono" });
  }
  rrect(ctx, cx - cell * 1.5 - 4, cy - cell * 1.5 - 4, cell * 3 + 8, cell * 3 + 8, 9, { stroke: "rgba(255,255,255,0.9)", lw: 2.2 });
  ctx.globalAlpha = a0;
}

// ------------------------------------------------------------------------------------------
// Ch.11 → Ch.12: the row of feature maps reflows into a row of word tokens.
// ------------------------------------------------------------------------------------------
export const TOKENS = ["猫", "坐", "在", "垫子", "上", "因为", "它", "累了"];
export const TOKEN_ROW = { y: 296, h: 58, gap: 14 } as const;

/** Chip rectangles of the token row, centred on the stage. */
export function tokenRects(): { x: number; y: number; w: number; h: number; label: string }[] {
  const widths = TOKENS.map((t) => 36 * Array.from(t).length + 26);
  const total = widths.reduce((a, b) => a + b, 0) + TOKEN_ROW.gap * (TOKENS.length - 1);
  let x = 640 - total / 2;
  return TOKENS.map((label, i) => {
    const r = { x, y: TOKEN_ROW.y, w: widths[i], h: TOKEN_ROW.h, label };
    x += widths[i] + TOKEN_ROW.gap;
    return r;
  });
}

/** A token chip: rounded plate with the word on it. */
export function drawTokenChip(ctx: Ctx, r: { x: number; y: number; w: number; h: number; label: string }, alpha = 1, o: { fill?: string; stroke?: string; labelAlpha?: number } = {}) {
  if (alpha <= 0.003) return;
  rrect(ctx, r.x, r.y, r.w, r.h, 14, { fill: o.fill ?? "#0e1218", stroke: o.stroke ?? "rgba(255,255,255,0.3)", lw: 1.5, alpha });
  text(ctx, r.label, r.x + r.w / 2, r.y + r.h / 2 + 8, { size: 24, weight: 600, color: C.text, align: "center", font: "cjk", alpha: alpha * (o.labelAlpha ?? 1) });
}
