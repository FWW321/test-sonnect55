/** A tiny 2-D plotting toolkit on top of Canvas 2D — axes, curves, points in data coordinates. */
import { C, RGB, RGB_POS } from "../theme";
import { circle, glow, line, polyline, text } from "../lib/draw";

type Ctx = CanvasRenderingContext2D;

export interface Plot {
  /** Pixel rectangle of the plotting area. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Data window. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const px = (p: Plot, v: number) => p.x + ((v - p.x0) / (p.x1 - p.x0)) * p.w;
export const py = (p: Plot, v: number) => p.y + p.h - ((v - p.y0) / (p.y1 - p.y0)) * p.h;

export interface AxesOpts {
  alpha?: number;
  ticksX?: number[];
  ticksY?: number[];
  labelX?: string;
  labelY?: string;
  grid?: boolean;
  /** Font scale (1 = 13 px ticks). */
  fs?: number;
  /** Draw the x-axis at y = 0 (true) or along the bottom edge (false). */
  crossAtZero?: boolean;
  frame?: boolean;
}

export function drawAxes(ctx: Ctx, p: Plot, o: AxesOpts = {}) {
  const a = o.alpha ?? 1;
  const fs = o.fs ?? 1;
  const xAxisY = o.crossAtZero && p.y0 < 0 && p.y1 > 0 ? py(p, 0) : p.y + p.h;
  const yAxisX = o.crossAtZero && p.x0 < 0 && p.x1 > 0 ? px(p, 0) : p.x;
  if (o.frame) {
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.globalAlpha *= a;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
    ctx.globalAlpha /= a || 1;
  }
  for (const t of o.ticksX ?? []) {
    const X = px(p, t);
    if (o.grid) line(ctx, X, p.y, X, p.y + p.h, { color: C.grid, lw: 1, alpha: a });
    line(ctx, X, xAxisY - 3, X, xAxisY + 3, { color: "rgba(255,255,255,0.4)", lw: 1, alpha: a });
    text(ctx, String(t).replace("-", "−"), X, xAxisY + 18 * fs, { size: 12.5 * fs, color: C.faint, align: "center", font: "mono", alpha: a });
  }
  for (const t of o.ticksY ?? []) {
    const Y = py(p, t);
    if (o.grid) line(ctx, p.x, Y, p.x + p.w, Y, { color: C.grid, lw: 1, alpha: a });
    line(ctx, yAxisX - 3, Y, yAxisX + 3, Y, { color: "rgba(255,255,255,0.4)", lw: 1, alpha: a });
    text(ctx, String(t).replace("-", "−"), yAxisX - 9 * fs, Y + 4.5 * fs, { size: 12.5 * fs, color: C.faint, align: "right", font: "mono", alpha: a });
  }
  line(ctx, p.x, xAxisY, p.x + p.w, xAxisY, { color: "rgba(255,255,255,0.45)", lw: 1.2, alpha: a });
  line(ctx, yAxisX, p.y, yAxisX, p.y + p.h, { color: "rgba(255,255,255,0.45)", lw: 1.2, alpha: a });
  if (o.labelX) text(ctx, o.labelX, p.x + p.w, xAxisY + 34 * fs, { size: 15 * fs, color: C.dim, align: "right", font: "sans", italic: true, alpha: a });
  if (o.labelY) text(ctx, o.labelY, yAxisX + 8 * fs, p.y - 8 * fs, { size: 15 * fs, color: C.dim, align: "left", font: "sans", italic: true, alpha: a });
}

export interface CurveOpts {
  color?: string;
  lw?: number;
  alpha?: number;
  /** Draw only the first fraction of the domain (draw-on animation), 0–1. */
  progress?: number;
  samples?: number;
  dash?: number[];
}

/** Plot y = f(x) across the data window. */
export function drawCurve(ctx: Ctx, p: Plot, f: (x: number) => number, o: CurveOpts = {}) {
  const n = o.samples ?? 160;
  const prog = o.progress ?? 1;
  const pts: number[] = [];
  const m = Math.max(2, Math.round(n * prog));
  for (let i = 0; i <= m; i++) {
    const x = p.x0 + ((p.x1 - p.x0) * (i / n));
    if (x > p.x0 + (p.x1 - p.x0) * prog + 1e-9) break;
    const y = f(x);
    pts.push(px(p, x), Math.max(p.y - 40, Math.min(p.y + p.h + 40, py(p, y))));
  }
  polyline(ctx, pts, { color: o.color ?? C.text, lw: o.lw ?? 2.5, alpha: o.alpha, dash: o.dash });
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Win {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface FnPlotOpts {
  alpha?: number;
  /** 0–1 draw-on of the curve. */
  progress?: number;
  /** Operating point on the curve (z); null hides it. */
  dotZ?: number | null;
  color?: string;
  lw?: number;
  ticksY?: number[];
  stepX?: number;
  labelX?: string;
  labelY?: string;
  dotColor?: RGB;
}

/**
 * The film's standard function plot (activation curves): axes + grid + curve + operating point with
 * guide lines. Used by the neuron, activation and backprop chapters, and by the carry between them.
 */
export function drawFunctionPlot(ctx: Ctx, r: Rect, win: Win, fn: (x: number) => number, o: FnPlotOpts = {}): Plot {
  const p: Plot = { ...r, ...win };
  const a = o.alpha ?? 1;
  const fs = Math.max(0.62, Math.min(1, r.w / 540 + 0.18));
  const step = o.stepX ?? 3;
  const ticksX: number[] = [];
  for (let v = Math.ceil(win.x0 / step - 1e-9) * step; v <= win.x1 + 1e-9; v += step) ticksX.push(Math.round(v * 100) / 100);
  drawAxes(ctx, p, {
    alpha: a,
    ticksX,
    ticksY: o.ticksY ?? [0, 0.5, 1],
    labelX: o.labelX ?? "z",
    labelY: o.labelY ?? "a",
    fs,
    grid: true,
  });
  drawCurve(ctx, p, fn, { color: o.color ?? C.text, lw: o.lw ?? 2.6, alpha: a, progress: o.progress ?? 1 });
  if (o.dotZ !== null && o.dotZ !== undefined && (o.progress ?? 1) > 0.995) {
    const X = px(p, o.dotZ);
    const Y = py(p, fn(o.dotZ));
    const dc = o.dotColor ?? RGB_POS;
    line(ctx, X, p.y + p.h, X, Y, { color: `rgba(${dc[0]},${dc[1]},${dc[2]},0.55)`, lw: 1.2, dash: [3, 4], alpha: a });
    line(ctx, p.x, Y, X, Y, { color: `rgba(${dc[0]},${dc[1]},${dc[2]},0.55)`, lw: 1.2, dash: [3, 4], alpha: a });
    glow(ctx, X, Y, 20 * fs + 6, dc, 0.75 * a);
    circle(ctx, X, Y, 4.6 * fs + 1, { fill: `rgb(${dc[0]},${dc[1]},${dc[2]})`, alpha: a });
  }
  return p;
}
