/** Computation-graph furniture for the backpropagation chapter: nodes, trimmed edges, factor chips. */
import { rgba } from "../lib/color";
import { arrow, circle, glow, rrect, text } from "../lib/draw";
import { clamp } from "../lib/math";
import { C, RGB_NEG, RGB_POS } from "../theme";

type Ctx = CanvasRenderingContext2D;

export interface GNode {
  x: number;
  y: number;
  r: number;
  label: string;
  /** Italic serif-less letter (variables) vs upright symbol (operations). */
  italic?: boolean;
}

export interface GNodeOpts {
  alpha?: number;
  /** Forward light (cyan), 0–1. */
  lit?: number;
  /** Backward light (orange), 0–1. */
  grad?: number;
  scale?: number;
  /** Skip the label (used when the caller draws the node itself). */
  noLabel?: boolean;
}

export function drawGNode(ctx: Ctx, n: GNode, o: GNodeOpts = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0.003) return;
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha;
  const r = n.r * (o.scale ?? 1);
  const lit = clamp(o.lit ?? 0);
  const grad = clamp(o.grad ?? 0);
  if (lit > 0.02) glow(ctx, n.x, n.y, r * (1.6 + lit), RGB_POS, 0.22 + 0.55 * lit);
  if (grad > 0.02) glow(ctx, n.x, n.y, r * (1.6 + grad), RGB_NEG, 0.22 + 0.6 * grad);
  circle(ctx, n.x, n.y, r, { fill: "#0c1118" });
  if (lit > 0.01) circle(ctx, n.x, n.y, r * 0.96, { fill: rgba(RGB_POS, 0.1 + 0.5 * lit) });
  if (grad > 0.01) circle(ctx, n.x, n.y, r * 0.96, { fill: rgba(RGB_NEG, 0.1 + 0.55 * grad) });
  circle(ctx, n.x, n.y, r, { stroke: `rgba(255,255,255,${0.5 + 0.35 * Math.max(lit, grad)})`, lw: 2 });
  if (!o.noLabel) {
    const italic = n.italic ?? true;
    text(ctx, n.label, n.x, n.y + r * (italic ? 0.34 : 0.32), { size: r * (italic ? 0.95 : 1.0), weight: 500, color: C.text, align: "center", font: "sans", italic });
  }
  ctx.globalAlpha = a0;
}

export interface EdgeEnds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ux: number;
  uy: number;
}

/** Endpoints of the edge a → b, trimmed to the rims of the two discs. */
export function edgeEnds(a: GNode, b: GNode, gap = 5): EdgeEnds {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  return { x1: a.x + ux * (a.r + gap), y1: a.y + uy * (a.r + gap), x2: b.x - ux * (b.r + gap), y2: b.y - uy * (b.r + gap), ux, uy };
}

export function drawGEdge(ctx: Ctx, a: GNode, b: GNode, o: { alpha?: number; color?: string; lw?: number; grow?: number } = {}) {
  const e = edgeEnds(a, b);
  const g = clamp(o.grow ?? 1);
  if (g <= 0.005) return;
  arrow(ctx, e.x1, e.y1, e.x1 + (e.x2 - e.x1) * g, e.y1 + (e.y2 - e.y1) * g, {
    color: o.color ?? "rgba(255,255,255,0.34)",
    lw: o.lw ?? 1.6,
    head: 8,
    alpha: (o.alpha ?? 1) * clamp(g * 2),
  });
}

/** A small factor on an edge ("×0.21"), on a dark plate so it stays legible over wires. */
export function chip(ctx: Ctx, s: string, x: number, y: number, color: string, alpha: number, size = 16) {
  if (alpha <= 0.005) return;
  ctx.save();
  ctx.font = `600 ${size}px "JetBrains Mono", monospace`;
  const w = ctx.measureText(s).width;
  ctx.restore();
  rrect(ctx, x - w / 2 - 8, y - size * 0.86, w + 16, size * 1.5, 7, { fill: "rgba(7,9,13,0.9)", stroke: rgba(color === C.neg ? RGB_NEG : RGB_POS, 0.55), lw: 1, alpha });
  text(ctx, s, x, y + size * 0.28, { size, weight: 600, color, align: "center", font: "mono", alpha });
}
