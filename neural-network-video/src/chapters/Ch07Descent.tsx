import { Canvas } from "../lib/canvas";
import { rgba } from "../lib/color";
import { FONT_SANS } from "../fonts";
import { arrow, circle, glow, line, polyline, rrect, text } from "../lib/draw";
import { clamp, ease, fmt, hash01, keyframes, lerp, seg, thousands } from "../lib/math";
import { chapterClock, useChapterClock } from "../lib/time";
import { C, FPS, RGB, RGB_DIM, RGB_NEG, RGB_POS, RGB_WHITE } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { Formula } from "../ui/Formula";
import { W_NODE, drawWNode } from "../visuals/carry";
import { LR, RUNS, Run, at } from "../visuals/descent";
import { drawLandscapeMarkers, drawParamAxes, drawSurface, restCam, toWorld } from "../visuals/landscape";
import { REG, START, mse, mseGrad } from "../visuals/regression";
import { Cam3, project } from "../visuals/view3d";

/**
 * 07 · 梯度下降 — Act A: on the terrain inherited from chapter 6 the gradient is drawn as a real arrow
 * lying on the surface, and the ball takes one real step of θ ← θ − η∇L. Act B: step after step, faster
 * and faster, down into the valley while the camera tilts to a contour map. Act C: three learning
 * rates on the same map — crawling, smooth, diverging — with their real loss curves. Act D: plain
 * gradient descent, momentum and Adam race; every path is an actual optimiser run on the loss
 * of chapter 6. Act E: two parameters are two directions; 13 002 parameters are 13 002 directions.
 * Carry in: the terrain with the ball. Carry out: the parameter point, which becomes the graph node "w".
 */
const CH = chapterById("descent");
const DUR = CH.dur / FPS;
const L_STAR = mse(REG.wStar, REG.bStar);

const VIOLET = "#b9a7ff";
const RGB_VIOLET: RGB = [185, 167, 255];

const GOOD = RUNS.good();

// ---------------------------------------------------------------------------------- timeline
const T = {
  gradIn: 1.6,
  descIn: 3.5,
  formula: 4.5,
  stepGrow: 5.8,
  hop: [6.9, 8.0] as const,
  tiltFrom: 15.2,
  tiltTo: 17.8,
  mapSlide: [17.9, 19.3] as const,
  // Act C
  runsC: [
    { t0: 18.9, t1: 20.8 },
    { t0: 21.0, t1: 22.9 },
    { t0: 23.1, t1: 25.0 },
    { t0: 25.3, t1: 27.3 },
  ],
  cSteps: 60,
  // Act D
  raceFrom: 29.9,
  raceTo: 35.9,
  dSteps: 200,
  // Act E
  axes: 37.3,
  burst: [38.2, 41.6] as const,
  retract: [43.3, 44.5] as const,
  glide: [44.4, 45.5] as const,
};

// ---------------------------------------------------------------------------------- cameras
const MAP_C: Cam3 = { yaw: 0, pitch: 0, scale: 210, cx: 640, cy: 338 };
const MAP_L: Cam3 = { yaw: 0, pitch: 0, scale: 206, cx: 336, cy: 340 };

const lerpCam = (a: Cam3, b: Cam3, e: number): Cam3 => ({
  yaw: lerp(a.yaw, b.yaw, e),
  pitch: lerp(a.pitch, b.pitch, e),
  scale: lerp(a.scale, b.scale, e),
  cx: lerp(a.cx, b.cx, e),
  cy: lerp(a.cy, b.cy, e),
});

const TILT_START_CAM = restCam(CH.from + T.tiltFrom * FPS);
function camAt(t: number, gf: number): Cam3 {
  if (t < T.tiltFrom) return restCam(gf);
  const e1 = seg(t, T.tiltFrom, T.tiltTo, ease.inOut);
  const e2 = seg(t, T.mapSlide[0], T.mapSlide[1], ease.inOut);
  return lerpCam(lerpCam(TILT_START_CAM, MAP_C, e1), MAP_L, e2);
}

// ---------------------------------------------------------------------------------- helpers
const hop = (run: Run, n: number): [number, number] => {
  const i = Math.floor(n);
  return at(run, i + ease.inOut(n - i));
};

function pathTo(run: Run, n: number): [number, number][] {
  const i = Math.min(run.pts.length - 1, Math.floor(n));
  const out = run.pts.slice(0, i + 1);
  out.push(hop(run, n));
  return out;
}

/** A path lying on the surface, in parameter space → screen. */
function drawTrail(ctx: CanvasRenderingContext2D, cam: Cam3, pts: [number, number][], color: string, lw: number, alpha: number) {
  if (pts.length < 2) return;
  const flat: number[] = [];
  for (const [w, b] of pts) {
    const q = project(cam, toWorld(w, b));
    flat.push(q.x, q.y);
  }
  polyline(ctx, flat, { color, lw, alpha });
}

function runBall(ctx: CanvasRenderingContext2D, cam: Cam3, w: number, b: number, rgb: RGB, hex: string, alpha = 1, r = 6.5) {
  const s = project(cam, toWorld(w, b));
  glow(ctx, s.x, s.y, 24, rgb, 0.8 * alpha);
  circle(ctx, s.x, s.y, r, { fill: hex, stroke: "rgba(255,255,255,0.92)", lw: 1.5, alpha });
}

/** An arrow lying on the surface: leaves (w0, b0) in the parameter direction (dw, db) for `len` parameter units. */
function surfaceArrow(
  ctx: CanvasRenderingContext2D,
  cam: Cam3,
  w0: number,
  b0: number,
  dw: number,
  db: number,
  s0: number,
  s1: number,
  o: { color: string; lw: number; alpha: number; head?: number },
) {
  if (s1 - s0 < 0.01 || o.alpha < 0.01) return null;
  const n = 28;
  const dl = Math.hypot(dw, db) || 1;
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = lerp(s0, s1, i / n);
    const q = project(cam, toWorld(w0 + (dw / dl) * s, b0 + (db / dl) * s));
    pts.push(q.x, q.y);
  }
  // a dark underlay keeps the arrow legible on the bright far wall of the terrain
  polyline(ctx, pts.slice(0, 2 * n), { color: "rgba(7,9,13,0.8)", lw: o.lw + 3.4, alpha: o.alpha });
  polyline(ctx, pts.slice(0, 2 * n), { color: o.color, lw: o.lw, alpha: o.alpha });
  arrow(ctx, pts[2 * n - 2], pts[2 * n - 1], pts[2 * n], pts[2 * n + 1], { color: o.color, lw: o.lw, head: o.head ?? 12, alpha: o.alpha });
  return { x: pts[2 * n], y: pts[2 * n + 1] };
}

/** Text on a dark rounded plate, for labels that sit on top of the terrain. */
function tag(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, alpha: number, align: CanvasTextAlign = "left") {
  ctx.save();
  ctx.font = `italic 700 22px ${FONT_SANS}`;
  const w = ctx.measureText(s).width;
  ctx.restore();
  const x0 = align === "right" ? x - w : x;
  rrect(ctx, x0 - 8, y - 22, w + 16, 32, 8, { fill: "rgba(7,9,13,0.78)", stroke: "rgba(255,255,255,0.08)", lw: 1, alpha });
  text(ctx, s, x0, y, { size: 22, weight: 700, color, font: "sans", italic: true, alpha });
}

// ---------------------------------------------------------------------------------- the loss plot (Acts C, D)
const LP = { x: 772, y: 262, w: 420, h: 246 };
const YE0 = -1.2; // log10 of the bottom edge
const YE1 = 2.0; // … and of the top edge
const lyOf = (L: number) => {
  const v = clamp(Math.log10(Math.max(L, 1e-9)), YE0 - 0.4, YE1 + 0.4);
  return LP.y + LP.h - ((v - YE0) / (YE1 - YE0)) * LP.h;
};

function drawLossAxes(ctx: CanvasRenderingContext2D, xMax: number, ticks: number[], alpha: number) {
  if (alpha < 0.005) return;
  for (const [v, s] of [
    [0.1, "0.1"],
    [1, "1"],
    [10, "10"],
    [100, "100"],
  ] as [number, string][]) {
    const Y = lyOf(v);
    line(ctx, LP.x, Y, LP.x + LP.w, Y, { color: C.grid, lw: 1, alpha });
    text(ctx, s, LP.x - 10, Y + 4.5, { size: 12.5, color: C.faint, align: "right", font: "mono", alpha });
  }
  for (const v of ticks) {
    const X = LP.x + (v / xMax) * LP.w;
    line(ctx, X, LP.y, X, LP.y + LP.h, { color: C.grid, lw: 1, alpha });
    text(ctx, String(v), X, LP.y + LP.h + 19, { size: 12.5, color: C.faint, align: "center", font: "mono", alpha });
  }
  line(ctx, LP.x, LP.y, LP.x, LP.y + LP.h, { color: "rgba(255,255,255,0.45)", lw: 1.2, alpha });
  line(ctx, LP.x, LP.y + LP.h, LP.x + LP.w, LP.y + LP.h, { color: "rgba(255,255,255,0.45)", lw: 1.2, alpha });
  text(ctx, "损失 L（对数刻度）", LP.x, LP.y - 14, { size: 15, weight: 500, color: C.dim, font: "cjk", alpha });
  text(ctx, "步数", LP.x + LP.w, LP.y + LP.h + 42, { size: 15, weight: 500, color: C.dim, align: "right", font: "cjk", alpha });
  // the lowest the loss can go on this data
  line(ctx, LP.x, lyOf(L_STAR), LP.x + LP.w, lyOf(L_STAR), { color: rgba(RGB_POS, 0.5), lw: 1.1, dash: [4, 5], alpha });
  text(ctx, "最低损失", LP.x + 8, lyOf(L_STAR) - 7, { size: 12.5, weight: 500, color: rgba(RGB_POS, 0.85), align: "left", font: "cjk", alpha });
}

function drawLossCurve(ctx: CanvasRenderingContext2D, run: Run, n: number, xMax: number, color: string, lw: number, alpha: number, head = true, dash?: number[]) {
  if (n <= 0) return;
  const X = (s: number) => LP.x + (s / xMax) * LP.w;
  const last = Math.min(run.loss.length - 1, Math.floor(n));
  const pts: number[] = [];
  for (let i = 0; i <= last; i++) pts.push(X(i), lyOf(run.loss[i]));
  const j = Math.min(run.loss.length - 1, last + 1);
  const L = lerp(run.loss[last], run.loss[j], n - Math.floor(n));
  pts.push(X(Math.min(n, xMax)), lyOf(L));
  ctx.save();
  ctx.beginPath();
  ctx.rect(LP.x - 2, LP.y - 8, LP.w + 6, LP.h + 12);
  ctx.clip();
  polyline(ctx, pts, { color, lw, alpha, dash });
  if (head) circle(ctx, X(Math.min(n, xMax)), lyOf(L), 4, { fill: color, alpha });
  ctx.restore();
}

// ---------------------------------------------------------------------------------- Act A/B: the ball's step index
/** Fractional step index of the single-run descent (Acts A–B). */
function stepB(t: number): number {
  const hopE = ease.inOut(seg(t, T.hop[0], T.hop[1], ease.linear));
  if (t < 9.6) return hopE;
  return keyframes(
    t,
    [
      [9.6, 1],
      [10.7, 2],
      [11.6, 3],
      [12.3, 4],
      [12.9, 5],
      [13.6, 7],
      [14.3, 10],
      [15.0, 15],
      [15.8, 24],
      [16.7, 42],
      [17.7, 70],
      [19.2, 120],
    ],
    ease.linear,
  );
}

const RUNS_C = [
  { run: RUNS.small(), hex: C.dim as string, rgb: RGB_DIM, eta: LR.small, tag: "太小", win: [T.runsC[0].t0, T.runsC[0].t1], dashed: false },
  { run: RUNS.good(), hex: "#ffffff", rgb: RGB_WHITE, eta: LR.good, tag: "刚好", win: [T.runsC[1].t0, T.runsC[1].t1], dashed: false },
  { run: RUNS.osc(), hex: C.neg as string, rgb: RGB_NEG, eta: LR.osc, tag: "来回震荡", win: [T.runsC[2].t0, T.runsC[2].t1], dashed: false },
  { run: RUNS.large(), hex: C.neg as string, rgb: RGB_NEG, eta: LR.large, tag: "发散", win: [T.runsC[3].t0, T.runsC[3].t1], dashed: true },
];

/** The ball has left the map: an arrow on the border, pointing where it went. */
function offMapMarker(ctx: CanvasRenderingContext2D, cam: Cam3, q: { x: number; y: number }, color: string, alpha: number) {
  const dx = q.x - cam.cx;
  const dy = q.y - cam.cy;
  const m = Math.max(Math.abs(dx), Math.abs(dy)) / (cam.scale - 14);
  if (m <= 1) return;
  const bx = cam.cx + dx / m;
  const by = cam.cy + dy / m;
  const ang = Math.atan2(dy, dx);
  glow(ctx, bx, by, 34, RGB_NEG, 0.6 * alpha);
  arrow(ctx, bx - Math.cos(ang) * 14, by - Math.sin(ang) * 14, bx + Math.cos(ang) * 30, by + Math.sin(ang) * 30, { color, lw: 3.4, head: 13, alpha });
  const right = dx >= 0;
  text(ctx, "飞出去了", bx + Math.cos(ang) * 46 + (right ? 4 : -4), by + Math.sin(ang) * 46 + 6, { size: 17, weight: 700, color, align: right ? "left" : "right", font: "cjk", alpha });
}

// ---------------------------------------------------------------------------------- the scene
const G0 = mseGrad(START.w, START.b);
const G0N = Math.hypot(G0[0], G0[1]);
const UP: [number, number] = [G0[0] / G0N, G0[1] / G0N];
const STEP1 = Math.hypot(GOOD.pts[1][0] - START.w, GOOD.pts[1][1] - START.b);

function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  if (t < 0 || t >= DUR + 0.001) return;

  const cam = camAt(t, gf);
  const tilt = seg(t, T.tiltFrom, T.tiltTo, ease.inOut);
  const terrainA = 1 - seg(t, 36.7, 37.7, ease.inOutSine);
  const inActs = t < 37.7;

  if (inActs && terrainA > 0.003) {
    drawSurface(ctx, { cam, alpha: terrainA, mesh: 0.95 * (1 - tilt), contours: lerp(0.55, 0.9, tilt) });
    drawParamAxes(ctx, cam, terrainA);
  }

  // ---- Acts A + B: a single ball
  const singleA = terrainA * (1 - seg(t, 19.0, 19.8, ease.inOutSine));
  if (singleA > 0.003 && inActs) {
    const n = stepB(t);
    const [bw, bb] = t < T.hop[0] ? [START.w, START.b] : hop(GOOD, n);
    // minimum marker
    drawLandscapeMarkers(ctx, cam, { ball: null, alpha: singleA, minimum: 1 });
    // trail
    if (t >= T.hop[0]) {
      const trail = pathTo(GOOD, n);
      drawTrail(ctx, cam, trail, "rgba(255,255,255,0.92)", 2.2, singleA);
      const up = Math.min(14, Math.floor(n));
      for (let i = 0; i <= up; i++) {
        const q = project(cam, toWorld(GOOD.pts[i][0], GOOD.pts[i][1]));
        circle(ctx, q.x, q.y, i === 0 ? 4 : 3.1, { fill: "#ffffff", alpha: singleA * (i === 0 ? 0.85 : 0.75) });
      }
    }
    // the two arrows of Act A
    const gIn = seg(t, T.gradIn, T.gradIn + 1.0, ease.soft);
    const gOut = 1 - seg(t, 6.6, 7.4, ease.inOutSine);
    const aUp = gIn * gOut * singleA;
    const startPos = [START.w, START.b];
    if (aUp > 0.01) {
      const tip = surfaceArrow(ctx, cam, startPos[0], startPos[1], UP[0], UP[1], 0.07, 0.07 + 0.5 * gIn, { color: C.neg, lw: 3.2, alpha: aUp });
      if (tip) tag(ctx, "∇L", tip.x + 10, tip.y - 2, C.neg, aUp);
    }
    const dIn = seg(t, T.descIn, T.descIn + 0.9, ease.soft);
    const dGrow = seg(t, T.stepGrow, T.stepGrow + 1.0, ease.inOut);
    const dOut = 1 - seg(t, T.hop[0] + 0.5, T.hop[1] + 0.2, ease.inOutSine);
    const aDown = dIn * dOut * singleA;
    if (aDown > 0.01) {
      const len = lerp(0.5, STEP1, dGrow) * dIn;
      const tip = surfaceArrow(ctx, cam, startPos[0], startPos[1], -UP[0], -UP[1], 0.07, Math.max(0.09, len), { color: "#ffffff", lw: 3, alpha: aDown });
      if (tip) {
        const label = dGrow > 0.5 ? "−η∇L" : "−∇L";
        tag(ctx, label, tip.x - 10, tip.y + 34, "#ffffff", aDown, "right");
      }
    }
    // the ball
    {
      const s = project(cam, toWorld(bw, bb));
      const f = project(cam, [toWorld(bw, bb)[0], toWorld(bw, bb)[1], 0]);
      if (Math.abs(s.y - f.y) > 2) {
        line(ctx, s.x, s.y, f.x, f.y, { color: "rgba(255,255,255,0.35)", lw: 1, dash: [3, 4], alpha: singleA });
        circle(ctx, f.x, f.y, 2.6, { fill: "rgba(255,255,255,0.5)", alpha: singleA });
      }
      glow(ctx, s.x, s.y, 26, RGB_NEG, 0.85 * singleA);
      circle(ctx, s.x, s.y, 7, { fill: C.neg, stroke: "rgba(255,255,255,0.9)", lw: 1.6, alpha: singleA });
    }
    // HUD — right of the terrain, so the update rule stays readable on the left
    const hud = seg(t, 8.6, 9.6, ease.out) * (1 - seg(t, 17.4, 18.2, ease.inOutSine)) * singleA;
    if (hud > 0.01) {
      // numbers come from the whole frame's time, not from the motion-blur sub-sample, so digits never ghost
      const nH = stepB((Math.round(gf) - CH.from) / FPS);
      const [hw, hb] = hop(GOOD, nH);
      const L = mse(hw, hb);
      const X = 968;
      text(ctx, "步数", X, 262, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha: hud });
      text(ctx, String(Math.floor(nH + 1e-6)), X, 306, { size: 40, weight: 700, font: "mono", alpha: hud });
      text(ctx, "损失 L", X, 358, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha: hud });
      text(ctx, L >= 100 ? String(Math.round(L)) : fmt(L, 2), X, 402, { size: 40, weight: 700, font: "mono", color: L > 1.5 ? C.neg : C.text, alpha: hud });
    }
  }

  // ---- Act C: four learning rates
  const cA = seg(t, T.mapSlide[0] + 0.3, T.mapSlide[1], ease.out) * (1 - seg(t, 28.3, 29.0, ease.inOutSine));
  if (cA > 0.003 && inActs) {
    drawLandscapeMarkers(ctx, cam, { ball: null, alpha: terrainA, minimum: 1 });
    drawLossAxes(ctx, T.cSteps, [0, 20, 40, 60], cA);
    text(ctx, `同样走 ${T.cSteps} 步，只改变步长 η`, cam.cx - cam.scale, cam.cy - cam.scale - 16, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha: cA });
    RUNS_C.forEach((d, k) => {
      if (t < d.win[0] - 0.25) return;
      const p = seg(t, d.win[0], d.win[1], ease.linear);
      // the diverging run is shown slowly for its first swings, then races off
      const n = d.dashed
        ? keyframes(t, [[d.win[0], 0], [d.win[0] + 1.9, 5], [d.win[1], T.cSteps]], ease.linear)
        : T.cSteps * ease.inOutSine(p);
      const active = p < 1;
      const fade = active ? 1 : 0.4; // finished runs recede
      const rowA = seg(t, d.win[0] - 0.25, d.win[0] + 0.35, ease.out) * cA;
      // legend row
      const Y = 126 + k * 28;
      circle(ctx, LP.x + 6, Y - 5, 5, { fill: d.hex, alpha: rowA });
      text(ctx, `η = ${d.eta}`, LP.x + 24, Y, { size: 16, weight: 600, color: C.text, font: "mono", alpha: rowA });
      text(ctx, d.tag, LP.x + 138, Y, { size: 16, weight: 700, color: d.hex, font: "cjk", alpha: rowA });
      const done = seg(t, d.win[1], d.win[1] + 0.5, ease.out) * cA;
      if (done > 0.01) {
        const L = d.run.loss[T.cSteps];
        const shown = L >= 1000 ? L.toExponential(1).replace("e+", "e") : fmt(L, 2);
        text(ctx, `L = ${shown}`, LP.x + 232, Y, { size: 15, weight: 500, color: C.dim, font: "mono", alpha: done * 0.95 });
      }
      // loss curve
      drawLossCurve(ctx, d.run, n, T.cSteps, d.hex, d.dashed ? 2.4 : 2.6, cA * (active ? 1 : 0.85), active, d.dashed ? [7, 5] : undefined);
      // trail + ball, kept inside the map
      const mr = { x: cam.cx - cam.scale, y: cam.cy - cam.scale, s: cam.scale * 2 };
      ctx.save();
      ctx.beginPath();
      ctx.rect(mr.x, mr.y, mr.s, mr.s);
      ctx.clip();
      const shownN = d.dashed ? Math.min(n, 5) : n; // once it is flying, more segments would only smear
      drawTrail(ctx, cam, pathTo(d.run, shownN), d.hex, active ? 2.4 : 1.8, cA * fade);
      ctx.restore();
      if (active) {
        const [bw, bb] = hop(d.run, n);
        const q = project(cam, toWorld(bw, bb));
        const inside = Math.abs(q.x - cam.cx) < cam.scale - 4 && Math.abs(q.y - cam.cy) < cam.scale - 4;
        if (inside) runBall(ctx, cam, bw, bb, d.rgb, d.hex, cA);
        else if (d.dashed) offMapMarker(ctx, cam, q, d.hex, cA);
      }
    });
  }

  // ---- Act D: SGD vs momentum vs Adam
  const dA = seg(t, 28.9, 29.7, ease.out) * (1 - seg(t, 36.5, 37.4, ease.inOutSine));
  if (dA > 0.003 && inActs) {
    drawLandscapeMarkers(ctx, cam, { ball: null, alpha: terrainA, minimum: 1 });
    drawLossAxes(ctx, T.dSteps, [0, 50, 100, 150, 200], dA);
    const defs = [
      { run: RUNS.sgd(), hex: "#ffffff", rgb: RGB_WHITE, name: "梯度下降", sub: `η = ${LR.good}` },
      { run: RUNS.momentum(), hex: C.pos, rgb: RGB_POS, name: "动量", sub: "β = 0.8" },
      { run: RUNS.adam(), hex: VIOLET, rgb: RGB_VIOLET, name: "Adam", sub: "自适应步长" },
    ];
    const p = seg(t, T.raceFrom, T.raceTo, ease.inOutSine);
    const n = T.dSteps * p;
    defs.forEach((d, k) => {
      const Y = 132 + k * 30;
      circle(ctx, LP.x + 6, Y - 5, 5, { fill: d.hex, alpha: dA });
      text(ctx, d.name, LP.x + 24, Y, { size: 17, weight: 700, color: d.hex, font: "cjk", alpha: dA });
      text(ctx, d.sub, LP.x + 150, Y, { size: 15, weight: 500, color: C.dim, font: "cjk", alpha: dA });
      drawLossCurve(ctx, d.run, n, T.dSteps, d.hex, 2.6, dA);
    });
    ctx.save();
    ctx.beginPath();
    ctx.rect(cam.cx - cam.scale, cam.cy - cam.scale, cam.scale * 2, cam.scale * 2);
    ctx.clip();
    defs.forEach((d) => drawTrail(ctx, cam, pathTo(d.run, n), d.hex, 2.2, dA * 0.9));
    // momentum's velocity: the last step, stretched — the "inertia" the caption talks about
    {
      const run = RUNS.momentum();
      const i = Math.min(run.pts.length - 2, Math.floor(n));
      const [w0, b0] = hop(run, n);
      const vw = run.pts[i + 1][0] - run.pts[i][0];
      const vb = run.pts[i + 1][1] - run.pts[i][1];
      const a = project(cam, toWorld(w0, b0));
      const b = project(cam, toWorld(w0 + vw * 2.2, b0 + vb * 2.2));
      if (Math.hypot(b.x - a.x, b.y - a.y) > 8 && p < 0.98) arrow(ctx, a.x, a.y, b.x, b.y, { color: C.pos, lw: 2, head: 8, alpha: dA * 0.9 });
    }
    defs.forEach((d) => {
      const [bw, bb] = hop(d.run, n);
      runBall(ctx, cam, bw, bb, d.rgb, d.hex, dA, 6);
    });
    ctx.restore();
  }

  // ---- Act E: 2 directions → 13 002 directions
  drawActE(ctx, t);
}

// ---------------------------------------------------------------------------------- Act E
const N_DIR = 13002;
const CX = 640;
const CY = 322;
const GOLD = 2.399963229728653;
const BURST = (() => {
  const ang = new Float32Array(N_DIR);
  const len = new Float32Array(N_DIR);
  for (let i = 0; i < N_DIR; i++) {
    // first two are the w and b axes; the rest fan out on a golden-angle spiral with jitter
    ang[i] = i === 0 ? 0 : i === 1 ? Math.PI / 2 : (i * GOLD + (hash01(i, 3) - 0.5) * 0.9) % Math.PI;
    len[i] = 96 + 156 * Math.pow(hash01(i, 11), 0.7);
  }
  return { ang, len };
})();

function drawActE(ctx: CanvasRenderingContext2D, t: number) {
  if (t < T.axes - 0.2) return;
  const axisA = seg(t, T.axes, T.axes + 0.7, ease.out);
  const nCount = Math.round(2 * Math.pow(N_DIR / 2, seg(t, T.burst[0], T.burst[1], ease.inOut)));
  const retract = seg(t, T.retract[0], T.retract[1], ease.in);
  const glide = seg(t, T.glide[0], T.glide[1], ease.inOut);
  const shrink = 1 - retract;

  // the two axes, before the crowd arrives
  const axR = 215 * shrink;
  if (nCount <= 2 && axisA > 0.01 && axR > 4) {
    for (const [dx, dy, label] of [
      [1, 0, "w"],
      [0, -1, "b"],
    ] as [number, number, string][]) {
      arrow(ctx, CX - dx * axR, CY - dy * axR, CX + dx * axR, CY + dy * axR, { color: "rgba(255,255,255,0.75)", lw: 1.8, head: 10, alpha: axisA });
      text(ctx, label, CX + dx * (axR + 16) + (dx ? 0 : 14), CY + dy * (axR + 16) + (dy ? 0 : 6), { size: 24, weight: 500, font: "sans", italic: true, color: C.text, alpha: axisA });
    }
  }
  // the crowd of directions: diameters through the centre
  if (nCount > 2 && shrink > 0.01) {
    // per-line opacity ∝ 1/N (× the shrinking area), so the glow keeps its brightness instead of clipping to white
    const lineA = clamp(0.24 * (2776 / nCount), 0.035, 0.5) * shrink * shrink;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // positive directions cyan, negative orange — dense enough in the core to add up to white
    for (let half = 0; half < 2; half++) {
      ctx.beginPath();
      for (let i = half; i < Math.min(nCount, N_DIR); i += 2) {
        const a = BURST.ang[i];
        const L = BURST.len[i] * shrink;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        ctx.moveTo(CX - ca * L, CY - sa * L);
        ctx.lineTo(CX + ca * L, CY + sa * L);
      }
      ctx.strokeStyle = half === 0 ? `rgba(90,205,245,${lineA * 1.15})` : `rgba(255,150,80,${lineA * 1.15})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    // the first few stay bright: they are the ones we could still draw one by one
    ctx.beginPath();
    for (let i = 0; i < Math.min(nCount, 24); i++) {
      const a = BURST.ang[i];
      const L = BURST.len[i] * shrink;
      ctx.moveTo(CX - Math.cos(a) * L, CY - Math.sin(a) * L);
      ctx.lineTo(CX + Math.cos(a) * L, CY + Math.sin(a) * L);
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.45 * shrink})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
  // the counter sits on a dark disc so the number stays legible
  const discR = lerp(0, 88, shrink);
  const numA = (nCount > 2 ? 1 : 0) * (1 - seg(t, T.retract[0], T.retract[0] + 0.5, ease.out));
  if (discR > 1 && nCount > 2) {
    circle(ctx, CX, CY, discR, { fill: "#07090d" });
    circle(ctx, CX, CY, discR, { stroke: "rgba(255,255,255,0.22)", lw: 1 });
  }
  if (numA > 0.01) {
    text(ctx, thousands(nCount), CX, CY + 10, { size: 38, weight: 700, font: "mono", align: "center", alpha: numA });
    text(ctx, "个方向", CX, CY + 38, { size: 16, weight: 500, color: C.dim, font: "cjk", align: "center", alpha: numA });
  } else if (nCount <= 2 && axisA > 0.01) {
    text(ctx, "2 个参数 = 2 个方向", CX, CY + 262, { size: 18, weight: 500, color: C.dim, font: "cjk", align: "center", alpha: axisA * shrink });
  }
  // what is left: one point in a 13 002-dimensional space → the graph node
  const ballA = seg(t, T.retract[0] + 0.5, T.retract[1], ease.out);
  if (ballA > 0.01) {
    const x = lerp(CX, W_NODE.x, glide);
    const y = lerp(CY, W_NODE.y, glide);
    drawWNode(ctx, x, y, seg(t, T.glide[0] + 0.35, T.glide[1], ease.linear), ballA);
  }
}

// ---------------------------------------------------------------------------------- DOM overlay
const MONO = '"JetBrains Mono", monospace';

const Overlay: React.FC = () => {
  const { t } = useChapterClock();
  const a = seg(t, T.formula, T.formula + 0.9, ease.out) * (1 - seg(t, 17.4, 18.2, ease.inOutSine));
  if (a < 0.01) return null;
  const gradOn = seg(t, T.formula + 0.6, T.formula + 1.2) * (1 - seg(t, T.stepGrow - 0.2, T.stepGrow + 0.3));
  const etaOn = seg(t, T.stepGrow, T.stepGrow + 0.5) * (1 - seg(t, T.hop[1] + 0.4, T.hop[1] + 1.0));
  return (
    <div style={{ position: "absolute", left: 64, top: 186, opacity: a }}>
      <div style={{ fontSize: 16, fontWeight: 500, color: C.dim, marginBottom: 10 }}>参数更新规则</div>
      <Formula
        tex={String.raw`\htmlClass{th}{\theta}\leftarrow\htmlClass{th}{\theta}-\htmlClass{eta}{\eta}\,\htmlClass{grad}{\nabla L(\theta)}`}
        size={34}
        terms={{
          th: { o: 1 },
          eta: { c: etaOn > 0.5 ? C.pos : undefined, o: 1 },
          grad: { c: gradOn > 0.5 ? C.neg : undefined, o: 1 },
        }}
      />
      <div style={{ marginTop: 16, fontSize: 16, lineHeight: 1.95, color: C.dim }}>
        <div style={{ opacity: seg(t, T.formula + 0.8, T.formula + 1.5, ease.out) }}>
          <span style={{ color: C.neg, fontFamily: MONO, fontWeight: 600 }}>∇L</span>　梯度：最陡的上坡方向
        </div>
        <div style={{ opacity: seg(t, T.stepGrow + 0.2, T.stepGrow + 0.9, ease.out) }}>
          <span style={{ color: C.pos, fontFamily: MONO, fontWeight: 600 }}>η</span>　学习率：一步迈多大
        </div>
      </div>
    </div>
  );
};

export const Ch07Descent: React.FC = () => {
  const { t } = useChapterClock();
  const moving = (t > T.tiltFrom && t < T.mapSlide[1]) || (t > T.retract[0] && t < T.glide[1]);
  return (
    <>
      <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} blur={moving ? { samples: 4, shutter: 0.7 } : undefined} />
      <Overlay />
      <ChapterCard />
      <Captions />
    </>
  );
};

