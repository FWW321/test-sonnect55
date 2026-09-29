/** The 2-D decision field of the training run: heat-map, boundary and data points in a square frame. */
import { classField } from "../lib/color";
import { circle, heatmap, line, rrect } from "../lib/draw";
import { EXT, contourSegments } from "./toyNets";
import { run, runField, runNetAt } from "./run";
import { C } from "../theme";

type Ctx = CanvasRenderingContext2D;

export interface FieldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the trained field sits in chapters 9 and 10 (the carry between them). */
export const FIELD9: FieldRect = { x: 96, y: 142, w: 400, h: 400 };

/** The loss chart of chapters 9–10: DOM box of remocn's line chart, and the plotting area inside it. */
export const CHART9 = { x: 580, y: 176, w: 620, h: 372, svgW: 560, svgH: 340, pad: 60 };
export const CHART9_INNER = {
  x0: CHART9.x + (CHART9.w - CHART9.svgW) / 2 + CHART9.pad,
  x1: CHART9.x + (CHART9.w + CHART9.svgW) / 2 - CHART9.pad,
  y0: CHART9.y + (CHART9.h - CHART9.svgH) / 2 + CHART9.pad,
  y1: CHART9.y + (CHART9.h + CHART9.svgH) / 2 - CHART9.pad,
};

const N = 96;
const flip = new Float32Array(N * N);

export interface FieldOpts {
  alpha?: number;
  /** "train" dots, "both" adds the held-out points as hollow rings, "none" for the bare field. */
  points?: "train" | "both" | "none";
  strength?: number;
  pointAlpha?: number;
  /** Boundary line opacity (0 hides it). */
  boundary?: number;
  /** Extra opacity of the held-out rings (default 1). */
  testAlpha?: number;
  /** Cross out held-out points the network gets wrong (opacity 0–1). */
  wrong?: number;
}

export function drawRunField(ctx: Ctx, F: FieldRect, k: number, o: FieldOpts = {}) {
  const a = o.alpha ?? 1;
  if (a <= 0.003) return;
  const R = run();
  const sx = (x: number) => F.x + ((x + EXT) / (2 * EXT)) * F.w;
  const sy = (y: number) => F.y + F.h - ((y + EXT) / (2 * EXT)) * F.h;
  ctx.save();
  ctx.globalAlpha *= a;
  rrect(ctx, F.x - 1, F.y - 1, F.w + 2, F.h + 2, 8, { stroke: "rgba(255,255,255,0.16)", lw: 1 });
  const raw = runField(k, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) flip[j * N + i] = raw[(N - 1 - j) * N + i];
  ctx.save();
  ctx.beginPath();
  ctx.rect(F.x, F.y, F.w, F.h);
  ctx.clip();
  heatmap(ctx, flip, N, N, F.x, F.y, F.w, F.h, (v) => classField(v, o.strength ?? 0.36), { smooth: true });
  const bA = o.boundary ?? 1;
  if (bA > 0.01) {
    const segs = contourSegments(raw, N, -EXT, EXT);
    ctx.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      ctx.moveTo(sx(segs[i]), sy(segs[i + 1]));
      ctx.lineTo(sx(segs[i + 2]), sy(segs[i + 3]));
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.95 * bA})`;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.restore();
  const pts = o.points ?? "train";
  const pa = o.pointAlpha ?? 1;
  if (pts !== "none") {
    if (pts === "both") {
      for (let i = 0; i < R.test.X.length; i++) {
        circle(ctx, sx(R.test.X[i][0]), sy(R.test.X[i][1]), 3.6, { stroke: R.test.y[i] ? C.pos : C.neg, lw: 1.3, alpha: 0.85 * pa * (o.testAlpha ?? 1) });
      }
    }
    for (let i = 0; i < R.train.X.length; i++) {
      circle(ctx, sx(R.train.X[i][0]), sy(R.train.X[i][1]), 3.3, { fill: R.train.y[i] ? C.pos : C.neg, stroke: "rgba(7,9,13,0.55)", lw: 0.8, alpha: pa });
    }
  }
  const wA = o.wrong ?? 0;
  if (pts === "both" && wA > 0.01) {
    const net = runNetAt(k);
    const cache = net.makeCache();
    for (let i = 0; i < R.test.X.length; i++) {
      const p = net.forward(R.test.X[i], cache)[0];
      if (p > 0.5 !== R.test.y[i] > 0.5) {
        const x = sx(R.test.X[i][0]);
        const y = sy(R.test.X[i][1]);
        line(ctx, x - 4.6, y - 4.6, x + 4.6, y + 4.6, { color: "#ffffff", lw: 1.7, alpha: wA });
        line(ctx, x - 4.6, y + 4.6, x + 4.6, y - 4.6, { color: "#ffffff", lw: 1.7, alpha: wA });
      }
    }
  }
  ctx.restore();
}
