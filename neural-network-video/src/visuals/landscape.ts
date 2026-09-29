/**
 * The loss landscape L(w, b) of the regression problem, rendered as a shaded surface. With the camera
 * looking straight down it *is* a heat-map of the parameter plane, so a 2-D panel can tilt into terrain
 * without a cut (the same trick chapter 5 uses for the lift into 3-D).
 */
import { sequential } from "../lib/color";
import { arrow, circle, glow, line, polyline, text } from "../lib/draw";
import { clamp, lerp } from "../lib/math";
import { C, RGB_NEG } from "../theme";
import { chapterById } from "../timeline";
import { FPS } from "../theme";
import { REG, START, mse } from "./regression";
import { Cam3, V3, project } from "./view3d";

type Ctx = CanvasRenderingContext2D;

export const DOM = { w0: -1.2, w1: 2.4, b0: -0.8, b1: 4.4 };
/** Surface resolution (cells). Fine enough that the flat top-down view reads as a smooth heat-map. */
export const NW = 88;
export const NB = 76;
const L_REF = 26; // loss that maps to the top of the colour scale

/** Height mapping: ∝ L near the minimum (a true bowl), compressed far away. */
export const heightOf = (L: number) => 0.22 * Math.log(1 + Math.min(L, 60));
const Z_TOP = heightOf(L_REF);

/** Parameter → world coordinates in [-1, 1]² (+ height). */
export const toWorld = (w: number, b: number): V3 => [
  (2 * (w - DOM.w0)) / (DOM.w1 - DOM.w0) - 1,
  (2 * (b - DOM.b0)) / (DOM.b1 - DOM.b0) - 1,
  heightOf(mse(w, b)),
];

interface Grid {
  P: V3[];
  L: number[];
}
let grid: Grid | null = null;
function getGrid(): Grid {
  if (grid) return grid;
  const P: V3[] = [];
  const L: number[] = [];
  for (let j = 0; j <= NB; j++) {
    for (let i = 0; i <= NW; i++) {
      const w = lerp(DOM.w0, DOM.w1, i / NW);
      const b = lerp(DOM.b0, DOM.b1, j / NB);
      const loss = mse(w, b);
      P.push(toWorld(w, b));
      L.push(loss);
    }
  }
  grid = { P, L };
  return grid;
}

export interface SurfaceOpts {
  cam: Cam3;
  alpha?: number;
  /** Fraction (0–1) of the rows painted, scanning from the b-minimum up; drives the "try every value" sweep. */
  reveal?: number;
  /** Strength of the mesh lines (0 = a flat heat-map). */
  mesh?: number;
  /** Strength of the iso-loss contour lines drawn on the surface (default 0.55). */
  contours?: number;
}

/** Loss levels of the contour lines — geometric, so the ravine floor and the far walls both get lines. */
const LEVELS = [0.15, 0.3, 0.6, 1.2, 2.5, 5, 10, 20, 40];

/** Filled, lit quads sorted back to front. */
export function drawSurface(ctx: Ctx, o: SurfaceOpts) {
  const { P, L } = getGrid();
  const cam = o.cam;
  const pr = P.map((p) => project(cam, p));
  const rows = Math.max(0, Math.min(NB, Math.floor((o.reveal ?? 1) * NB + 1e-9)));
  const quads: { i: number; j: number; d: number }[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < NW; i++) {
      const a = j * (NW + 1) + i;
      quads.push({ i, j, d: (pr[a].depth + pr[a + 1].depth + pr[a + NW + 1].depth + pr[a + NW + 2].depth) / 4 });
    }
  }
  quads.sort((p, q) => p.d - q.d);
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * (o.alpha ?? 1);
  const mesh = o.mesh ?? 0;
  const contourA = o.contours ?? 0.55;
  const light: V3 = [-0.45, 0.35, 0.82];
  for (const { i, j } of quads) {
    const a = j * (NW + 1) + i;
    const b = a + 1;
    const c = a + NW + 2;
    const d = a + NW + 1;
    const meanL = (L[a] + L[b] + L[c] + L[d]) / 4;
    // normal from the two diagonals of the quad
    const u: V3 = [P[c][0] - P[a][0], P[c][1] - P[a][1], P[c][2] - P[a][2]];
    const v: V3 = [P[d][0] - P[b][0], P[d][1] - P[b][1], P[d][2] - P[b][2]];
    let nx = u[1] * v[2] - u[2] * v[1];
    let ny = u[2] * v[0] - u[0] * v[2];
    let nz = u[0] * v[1] - u[1] * v[0];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const lit = Math.abs(nx * light[0] + ny * light[1] + nz * light[2]);
    const shade = lerp(1, 0.55 + 0.55 * lit, clamp(mesh * 1.4));
    const col = sequential(clamp(heightOf(meanL) / Z_TOP) * 0.92);
    ctx.beginPath();
    ctx.moveTo(pr[a].x, pr[a].y);
    ctx.lineTo(pr[b].x, pr[b].y);
    ctx.lineTo(pr[c].x, pr[c].y);
    ctx.lineTo(pr[d].x, pr[d].y);
    ctx.closePath();
    ctx.fillStyle = `rgb(${Math.round(col[0] * shade)},${Math.round(col[1] * shade)},${Math.round(col[2] * shade)})`;
    ctx.fill();
    // a hairline in the fill colour hides the anti-aliasing seams between neighbours
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    // mesh lines on every second cell, so the wireframe keeps the same spacing at the finer resolution
    if (mesh > 0.02 && (i % 2 === 0 || j % 2 === 0)) {
      ctx.beginPath();
      if (i % 2 === 0) {
        ctx.moveTo(pr[a].x, pr[a].y);
        ctx.lineTo(pr[d].x, pr[d].y);
      }
      if (j % 2 === 0) {
        ctx.moveTo(pr[a].x, pr[a].y);
        ctx.lineTo(pr[b].x, pr[b].y);
      }
      ctx.strokeStyle = `rgba(7,9,13,${0.34 * mesh})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    // iso-loss contours of this quad — drawn inside the depth-sorted loop so nearer quads still hide them
    if (contourA > 0.01) {
      const ids = [a, b, c, d];
      ctx.beginPath();
      for (const lev of LEVELS) {
        const pts: number[] = [];
        for (let e = 0; e < 4; e++) {
          const i0 = ids[e];
          const i1 = ids[(e + 1) % 4];
          const v0 = L[i0] - lev;
          const v1 = L[i1] - lev;
          if (v0 > 0 !== v1 > 0) {
            const tt = v0 / (v0 - v1);
            pts.push(pr[i0].x + (pr[i1].x - pr[i0].x) * tt, pr[i0].y + (pr[i1].y - pr[i0].y) * tt);
          }
        }
        if (pts.length === 4) {
          ctx.moveTo(pts[0], pts[1]);
          ctx.lineTo(pts[2], pts[3]);
        }
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * contourA})`;
      ctx.lineWidth = 1.05;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = a0;
}

/** A marker sitting on the surface at parameters (w, b): glow, disc, and a drop line to the floor. */
export function drawBall(ctx: Ctx, cam: Cam3, w: number, b: number, o: { alpha?: number; r?: number; drop?: boolean; color?: string } = {}) {
  const p = toWorld(w, b);
  const s = project(cam, p);
  const f = project(cam, [p[0], p[1], 0]);
  const a = o.alpha ?? 1;
  if (o.drop !== false && Math.abs(s.y - f.y) > 2) {
    line(ctx, s.x, s.y, f.x, f.y, { color: "rgba(255,255,255,0.35)", lw: 1, dash: [3, 4], alpha: a });
    circle(ctx, f.x, f.y, 2.6, { fill: "rgba(255,255,255,0.5)", alpha: a });
  }
  glow(ctx, s.x, s.y, 26, RGB_NEG, 0.85 * a);
  circle(ctx, s.x, s.y, o.r ?? 7, { fill: o.color ?? C.neg, stroke: "rgba(255,255,255,0.9)", lw: 1.6, alpha: a });
}

/** A path of (w, b) points drawn on the surface. */
export function drawPath(ctx: Ctx, cam: Cam3, pts: [number, number][], o: { color?: string; lw?: number; alpha?: number; dots?: boolean } = {}) {
  if (pts.length < 2) return;
  const flat: number[] = [];
  for (const [w, b] of pts) {
    const q = project(cam, toWorld(w, b));
    flat.push(q.x, q.y);
  }
  polyline(ctx, flat, { color: o.color ?? "#ffffff", lw: o.lw ?? 2.2, alpha: o.alpha ?? 1 });
  if (o.dots) for (let i = 0; i < flat.length; i += 2) circle(ctx, flat[i], flat[i + 1], 2.6, { fill: o.color ?? "#ffffff", alpha: o.alpha ?? 1 });
}

/**
 * The parameter plane's footprint: a faint floor outline plus the two axes, each an arrow running
 * along one floor edge just outside the terrain, so "w" and "b" always sit next to the thing they measure.
 */
export function drawParamAxes(ctx: Ctx, cam: Cam3, alpha = 1) {
  if (alpha < 0.005) return;
  const at = (x: number, y: number) => project(cam, [x, y, 0]);
  const a = at(-1, -1);
  const b = at(1, -1);
  const d = at(1, 1);
  const e = at(-1, 1);
  polyline(ctx, [a.x, a.y, b.x, b.y, d.x, d.y, e.x, e.y], { close: true, color: "rgba(255,255,255,0.14)", lw: 1, alpha });
  const ccx = (a.x + b.x + d.x + e.x) / 4;
  const ccy = (a.y + b.y + d.y + e.y) / 4;
  const axis = (P: { x: number; y: number }, Q: { x: number; y: number }, label: string) => {
    const mx = (P.x + Q.x) / 2;
    const my = (P.y + Q.y) / 2;
    const len = Math.hypot(Q.x - P.x, Q.y - P.y) || 1;
    const ux = (Q.x - P.x) / len;
    const uy = (Q.y - P.y) / len;
    let nx = -uy;
    let ny = ux;
    if (nx * (mx - ccx) + ny * (my - ccy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const half = Math.min(60, len * 0.28);
    const off = 22;
    const x0 = mx - ux * half + nx * off;
    const y0 = my - uy * half + ny * off;
    const x1 = mx + ux * half + nx * off;
    const y1 = my + uy * half + ny * off;
    arrow(ctx, x0, y0, x1, y1, { color: "rgba(154,164,181,0.85)", lw: 1.5, head: 8, alpha });
    text(ctx, label, x1 + ux * 16 + nx * 3, y1 + uy * 16 + ny * 3 + 6, { size: 19, weight: 500, color: C.dim, align: "center", font: "sans", italic: true, alpha });
  };
  axis(a, b, "w");
  axis(a, e, "b");
}

// ------------------------------------------------------------------------------------------
// Ch.6 → Ch.7: the resting view of the landscape, with the starting ball and the minimum marked.
// Both chapters draw it through drawLandscapeRest, so the hand-off frame is one and the same picture.
// ------------------------------------------------------------------------------------------
const LOSS = chapterById("loss");
/** Master frame at which chapter 6's tilt into 3-D ends and the resting camera takes over. */
export const TILT_END = LOSS.from + 31.4 * FPS;

export function restCam(gf: number): Cam3 {
  const drift = Math.max(0, (gf - TILT_END) / FPS);
  return { yaw: 0.52 + 0.02 * drift, pitch: 0.74, scale: 172, cx: 640, cy: 392 };
}

/** The ball at the starting parameters and the marked minimum — drawn on top of any surface. */
export function drawLandscapeMarkers(
  ctx: Ctx,
  cam: Cam3,
  o: { ball?: [number, number] | null; alpha?: number; minimum?: number; ballAlpha?: number } = {},
) {
  const a = o.alpha ?? 1;
  const m = o.minimum ?? 1;
  if (m > 0.01) {
    const q = project(cam, toWorld(REG.wStar, REG.bStar));
    circle(ctx, q.x, q.y, 5.5, { stroke: "#ffffff", lw: 2, alpha: a * m });
    line(ctx, q.x - 9, q.y, q.x + 9, q.y, { color: "#ffffff", lw: 1.6, alpha: a * m });
    line(ctx, q.x, q.y - 9, q.x, q.y + 9, { color: "#ffffff", lw: 1.6, alpha: a * m });
    text(ctx, "最低点", q.x + 16, q.y + 30, { size: 18, weight: 700, color: "#ffffff", font: "cjk", alpha: a * m });
  }
  const ball = o.ball === undefined ? [START.w, START.b] : o.ball;
  if (ball) drawBall(ctx, cam, ball[0], ball[1], { alpha: a * (o.ballAlpha ?? 1) });
}

/** The 3-D terrain in its resting pose (chapter 6 after the tilt, chapter 7 before its own moves). */
export function drawLandscapeRest(
  ctx: Ctx,
  gf: number,
  o: { cam?: Cam3; ball?: [number, number] | null; alpha?: number; minimum?: number } = {},
) {
  const cam = o.cam ?? restCam(gf);
  const a = o.alpha ?? 1;
  drawSurface(ctx, { cam, alpha: a, mesh: 0.95 });
  drawParamAxes(ctx, cam, a);
  drawLandscapeMarkers(ctx, cam, { ball: o.ball, alpha: a, minimum: o.minimum });
}
