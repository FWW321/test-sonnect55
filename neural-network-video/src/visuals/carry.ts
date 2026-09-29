/**
 * Objects that survive a chapter boundary. onetake's rule is that a transition must document
 * what carries over; this file is where two neighbouring chapters agree on the pose (position,
 * size, look) of the thing they both draw during their overlap.
 */
import { CanvasRenderingContext2DLike, NeuronStyle } from "./types";
import { RGB_POS } from "../theme";
import { grey, rgba } from "../lib/color";
import { arrow, circle, glow, line, rrect, text } from "../lib/draw";
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
