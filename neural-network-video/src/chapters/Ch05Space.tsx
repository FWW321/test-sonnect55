import { Canvas } from "../lib/canvas";
import { classField, rgba } from "../lib/color";
import { circle, heatmap, line, mathText, polyline, rrect, text } from "../lib/draw";
import { clamp, ease, fmt, keyframes, lerp, seg } from "../lib/math";
import { chapterClock } from "../lib/time";
import { C, FPS, RGB_NEG, RGB_POS } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { LEGEND, drawClassDot } from "../visuals/carry";
import { ARM_N, circlesData, circlesLift, spiralStages } from "../visuals/toyNets";
import { Cam3, V3, drawBox, drawPolygon, project, viewVector } from "../visuals/view3d";

/**
 * 05 · 折叠空间 — Act 1: two rings no straight line can split (the best line is found by brute force
 * and scores only ~60 %). Act 2: the trained 3-neuron layer lifts every point into 3-D, where one plane
 * separates the classes (plane and coordinates are the real network's). Act 3: two spirals pushed
 * through three real 2-neuron layers; the final straight line is carried back to the input
 * space as the spiral-shaped decision boundary.
 * Carry in: the two class markers from chapter 4. Carry out: the spiral picture with the trained field.
 */
const CH = chapterById("space");
const DUR = CH.dur / FPS;

const F = { x: 430, y: 112, w: 400, h: 400 };
const HALF = 1.15;
const SC = F.w / (2 * HALF);
const CX = F.x + F.w / 2;
const CY = F.y + F.h / 2;

// ---------------------------------------------------------------------------------- act 1 data
const circ = circlesData();
const lift = circlesLift();
const NC = circ.X.length;

function lineAcc(th: number, off: number) {
  const c = Math.cos(th);
  const s = Math.sin(th);
  let ok = 0;
  for (let i = 0; i < NC; i++) {
    const side = circ.X[i][0] * c + circ.X[i][1] * s - off;
    if ((side > 0 ? 1 : 0) === circ.y[i]) ok++;
  }
  return ok / NC;
}
const BEST = (() => {
  let best = { th: 0, off: 0, acc: 0 };
  for (let a = 0; a < 180; a++) {
    for (let o = -80; o <= 80; o += 2) {
      const th = (a / 180) * Math.PI * 2;
      const acc = lineAcc(th, o / 100);
      if (acc > best.acc) best = { th, off: o / 100, acc };
    }
  }
  return best;
})();

const T = {
  points: 1.2,
  lineIn: 4.0,
  settle: 11.6,
  cube: 15.4,
  lift: [18.8, 24.0],
  plane: 24.2,
  act3: 33.2,
  block: [
    [41.2, 44.2],
    [45.0, 48.0],
    [49.0, 52.0],
  ],
  cut: 52.4,
  unfold: [54.4, 57.4],
} as const;

// ---------------------------------------------------------------------------------- 3-D camera
/**
 * Yaw at which the separating plane is seen exactly edge-on (view vector ⟂ plane normal) for a given
 * pitch: the plane collapses to a line with the two classes on either side of it.
 */
const EDGE_PITCH = 0.72;
const EDGE_YAW = (() => {
  const [n0, n1, n2] = lift.plane.n;
  const R = Math.hypot(n0, n1);
  const phi = Math.atan2(n1, n0);
  const x = Math.max(-1, Math.min(1, (n2 / Math.tan(EDGE_PITCH)) / R));
  const cands = [Math.asin(x) - phi, Math.PI - Math.asin(x) - phi];
  const ref = 0.8; // pick the solution nearest the wandering view used during the lift
  let best = cands[0];
  let bd = 9;
  for (const c of cands) {
    const wrapped = c + Math.round((ref - c) / (2 * Math.PI)) * 2 * Math.PI;
    if (Math.abs(wrapped - ref) < bd) {
      bd = Math.abs(wrapped - ref);
      best = wrapped;
    }
  }
  return best;
})();

function cam3(t: number): Cam3 {
  return {
    yaw: keyframes(t, [[16.4, 0], [23.0, 0.8], [26.4, 0.8], [31.6, EDGE_YAW]], ease.inOutSine),
    pitch: keyframes(t, [[15.6, 0], [18.4, 0.95], [26.4, 0.95], [31.6, EDGE_PITCH]], ease.inOutSine),
    scale: keyframes(t, [[15.6, SC], [18.8, 150]], ease.inOutSine),
    cx: CX,
    cy: CY,
  };
}

const sx2 = (x: number) => CX + x * SC;
const sy2 = (y: number) => CY - y * SC;

function drawLegend(ctx: CanvasRenderingContext2D, a: number) {
  drawClassDot(ctx, LEGEND.A.x, LEGEND.A.y, LEGEND.r, "A", 1);
  drawClassDot(ctx, LEGEND.B.x, LEGEND.B.y, LEGEND.r, "B", 1);
  text(ctx, "类别 A", LEGEND.A.x + 20, LEGEND.A.y + 6, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha: a });
  text(ctx, "类别 B", LEGEND.B.x + 20, LEGEND.B.y + 6, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha: a });
}

// ---------------------------------------------------------------------------------- act 1 / 2
function drawRingsAndLift(ctx: CanvasRenderingContext2D, t: number) {
  const cam = cam3(t);
  const u = ease.inOut(clamp((t - T.lift[0]) / (T.lift[1] - T.lift[0])));
  const fade23 = 1 - seg(t, 32.2, 33.4, ease.inOutSine);
  if (fade23 <= 0.003) return;

  // ----- act 1 furniture: the plane frame, candidate lines, tint, readout
  const a1 = seg(t, 0.9, 1.9, ease.out) * (1 - seg(t, T.cube, T.cube + 1.0, ease.inOutSine));
  if (a1 > 0.003) {
    rrect(ctx, F.x - 1, F.y - 1, F.w + 2, F.h + 2, 8, { stroke: "rgba(255,255,255,0.16)", lw: 1, alpha: a1 });
    line(ctx, F.x, CY, F.x + F.w, CY, { color: "rgba(255,255,255,0.1)", lw: 1, alpha: a1 });
    line(ctx, CX, F.y, CX, F.y + F.h, { color: "rgba(255,255,255,0.1)", lw: 1, alpha: a1 });
    text(ctx, "输入空间", F.x, F.y - 14, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha: a1 });

    const la = seg(t, T.lineIn, T.lineIn + 0.8, ease.out);
    if (la > 0.005) {
      const settle = seg(t, T.settle - 1.6, T.settle, ease.inOutSine);
      const th0 = keyframes(t, [[T.lineIn, 0.3], [6.4, 1.5], [8.8, 2.9], [10.4, 4.4]], ease.inOutSine);
      const of0 = keyframes(t, [[T.lineIn, 0.35], [6.4, -0.35], [8.8, 0.3], [10.4, -0.2]], ease.inOutSine);
      const th = lerp(th0, BEST.th, settle);
      const off = lerp(of0, BEST.off, settle);
      const nx = Math.cos(th);
      const ny = Math.sin(th);
      const dx = -ny;
      const dy = nx;
      const P = (a: number, b: number): [number, number] => [sx2(nx * off + dx * a + nx * b), sy2(ny * off + dy * a + ny * b)];
      ctx.save();
      ctx.beginPath();
      ctx.rect(F.x, F.y, F.w, F.h);
      ctx.clip();
      const pos = [P(3, 3), P(-3, 3), P(-3, 0), P(3, 0)].flat();
      const neg = [P(3, 0), P(-3, 0), P(-3, -3), P(3, -3)].flat();
      polyline(ctx, pos, { close: true, fill: rgba(RGB_POS, 0.08 * la), alpha: 1 });
      polyline(ctx, neg, { close: true, fill: rgba(RGB_NEG, 0.08 * la), alpha: 1 });
      const [x1, y1] = P(-3, 0);
      const [x2, y2] = P(3, 0);
      line(ctx, x1, y1, x2, y2, { color: C.text, lw: 2.2, alpha: la, cap: "round" });
      ctx.restore();
      const acc = lineAcc(th, off);
      const done = seg(t, T.settle, T.settle + 0.6, ease.out);
      text(ctx, "这条直线的正确率", 880, 268, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha: la * a1 * (1 - done) });
      text(ctx, `${Math.round(acc * 100)}%`, 880, 318, { size: 50, weight: 700, color: C.text, font: "mono", alpha: la * a1 * (1 - done) });
      text(ctx, "试遍所有直线，最好的也只有", 880, 268, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha: a1 * done });
      text(ctx, `${Math.round(BEST.acc * 100)}%`, 880, 318, { size: 50, weight: 700, color: C.neg, font: "mono", alpha: a1 * done });
      text(ctx, "（乱猜 = 50%）", 880, 348, { size: 15, weight: 500, color: C.faint, font: "cjk", alpha: a1 * done });
    }
  }

  // ----- act 2 furniture: the hidden-space cube and the separating plane
  const ca = seg(t, T.cube, T.cube + 1.2, ease.out) * fade23;
  if (ca > 0.003) {
    drawBox(ctx, cam, 0.95, "rgba(255,255,255,0.18)", 1, ca);
    text(ctx, "第一层：3 个 ReLU 神经元 = 3 个新坐标", F.x - 10, F.y - 14, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha: ca * seg(t, 17.2, 18.4, ease.out) });
  }
  const pa = seg(t, T.plane, T.plane + 1.4, ease.out) * fade23;

  // ----- points (drawn in 3-D at every moment; top-down with u = 0 it *is* the 2-D picture)
  const n = lift.plane.n;
  const c0: V3 = [n[0] * lift.plane.d, n[1] * lift.plane.d, n[2] * lift.plane.d];
  const vv = viewVector(cam);
  const camSide = (vv[0] * n[0] + vv[1] * n[1] + vv[2] * n[2]) >= 0 ? 1 : -1;
  const back: { x: number; y: number; d: number; cls: number; a: number }[] = [];
  const front: typeof back = [];
  for (let i = 0; i < NC; i++) {
    const P: V3 = [
      lerp(lift.xy[i][0], lift.h[i][0], u),
      lerp(lift.xy[i][1], lift.h[i][1], u),
      lerp(0, lift.h[i][2], u),
    ];
    const q = project(cam, P);
    const a = seg(t, T.points + (i / NC) * 1.6, T.points + (i / NC) * 1.6 + 0.5, ease.out) * fade23;
    // which side of the separating plane (only meaningful once it is shown)
    const dist = (lift.h[i][0] - c0[0]) * n[0] + (lift.h[i][1] - c0[1]) * n[1] + (lift.h[i][2] - c0[2]) * n[2];
    const isFront = u > 0.98 && pa > 0.01 ? dist * camSide > 0 : true;
    (isFront ? front : back).push({ x: q.x, y: q.y, d: q.depth, cls: circ.y[i], a });
  }
  const paint = (arr: typeof back) => {
    arr.sort((p, q) => p.d - q.d);
    for (const p of arr) {
      const r = 3.3 + clamp(p.d * 0.9, -1.2, 1.4) * u;
      circle(ctx, p.x, p.y, r, { fill: p.cls ? C.pos : C.neg, alpha: p.a });
    }
  };
  paint(back);
  if (pa > 0.003) {
    // plane patch through the real separating plane
    const e1: V3 = Math.abs(n[2]) < 0.9 ? normalize(cross(n, [0, 0, 1])) : normalize(cross(n, [1, 0, 0]));
    const e2 = cross(n, e1);
    const R = 1.0;
    const corner = (a: number, b: number): V3 => [c0[0] + e1[0] * a + e2[0] * b, c0[1] + e1[1] * a + e2[1] * b, c0[2] + e1[2] * a + e2[2] * b];
    drawPolygon(ctx, cam, [corner(-R, -R), corner(R, -R), corner(R, R), corner(-R, R)], `rgba(255,255,255,${0.1 * pa})`, `rgba(255,255,255,${0.55 * pa})`, 1.4, 1);
  }
  paint(front);
  text(ctx, "一个平面", 900, 330, { size: 22, weight: 700, color: C.text, font: "cjk", alpha: pa * seg(t, T.plane + 0.6, T.plane + 1.6, ease.out) });
  text(ctx, "就把两类分开了", 900, 362, { size: 17, weight: 500, color: C.dim, font: "cjk", alpha: pa * seg(t, T.plane + 1.0, T.plane + 2.0, ease.out) });
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// ---------------------------------------------------------------------------------- act 3
let fieldFlipped: Float32Array | null = null;
const flipped = () => {
  if (!fieldFlipped) {
    const S = spiralStages();
    const n = S.fieldN;
    fieldFlipped = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) fieldFlipped[j * n + i] = S.field[(n - 1 - j) * n + i];
  }
  return fieldFlipped;
};

const STAGE_LABELS = ["输入", "第 1 层", "第 2 层", "第 3 层"];

function drawSpirals(ctx: CanvasRenderingContext2D, t: number) {
  const S = spiralStages();
  const a3 = seg(t, T.act3, T.act3 + 1.4, ease.out);
  if (a3 <= 0.003) return;

  // where are we between stages?
  const unfold = t >= 54.2;
  const eU = seg(t, T.unfold[0], T.unfold[1], ease.inOut);
  let kA: number;
  let kB: number;
  let e: number;
  if (unfold) {
    kA = 3;
    kB = 0;
    e = eU;
  } else {
    const sf = keyframes(
      t,
      [[40.4, 0], [41.2, 0], [44.2, 1], [45.0, 1], [48.0, 2], [49.0, 2], [52.0, 3]],
      ease.inOutSine,
    );
    kA = Math.min(2, Math.floor(sf));
    kB = kA + 1;
    e = sf - kA;
  }
  const VA = S.view[kA];
  const VB = S.view[kB];
  const V = { x0: lerp(VA.x0, VB.x0, e), x1: lerp(VA.x1, VB.x1, e), y0: lerp(VA.y0, VB.y0, e), y1: lerp(VA.y1, VB.y1, e) };
  const sx = (x: number) => F.x + ((x - V.x0) / (V.x1 - V.x0)) * F.w;
  const sy = (y: number) => F.y + F.h - ((y - V.y0) / (V.y1 - V.y0)) * F.h;
  const at = (arr: Float64Array[], i: number): [number, number] => [lerp(arr[kA][i], arr[kB][i], e), lerp(arr[kA][i + 1], arr[kB][i + 1], e)];

  ctx.save();
  ctx.globalAlpha *= a3;
  rrect(ctx, F.x - 1, F.y - 1, F.w + 2, F.h + 2, 8, { stroke: "rgba(255,255,255,0.16)", lw: 1 });

  // background: half-plane of the final line (act 3 climax), then the true field once unfolded
  const cutA = seg(t, T.cut, T.cut + 1.2, ease.out) * (1 - seg(t, T.unfold[0], T.unfold[0] + 0.7, ease.inOutSine));
  if (cutA > 0.005) {
    const n = 64;
    const vals = new Float32Array(n * n);
    const [la, lb, lc] = S.line;
    const V3w = S.view[3];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = V3w.x0 + ((V3w.x1 - V3w.x0) * (i + 0.5)) / n;
        const y = V3w.y1 - ((V3w.y1 - V3w.y0) * (j + 0.5)) / n;
        vals[j * n + i] = la * x + lb * y + lc > 0 ? 1 : 0;
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(F.x, F.y, F.w, F.h);
    ctx.clip();
    heatmap(ctx, vals, n, n, F.x, F.y, F.w, F.h, (v) => classField(v, 0.34), { alpha: cutA * 0.9 });
    ctx.restore();
  }
  const fieldA = seg(t, 55.4, 57.4, ease.inOut);
  if (fieldA > 0.005) {
    const n = S.fieldN;
    const flip = flipped();
    const sxA = sx(-1.15);
    const sxB = sx(1.15);
    const syA = sy(1.15);
    const syB = sy(-1.15);
    ctx.save();
    ctx.beginPath();
    ctx.rect(F.x, F.y, F.w, F.h);
    ctx.clip();
    heatmap(ctx, flip, n, n, sxA, syA, sxB - sxA, syB - syA, (v) => classField(v, 0.36), { smooth: true, alpha: fieldA });
    ctx.restore();
  }

  // grid lines: strong while the space is still recognisable, faint later; gone before the hand-off
  const stageF = unfold ? 3 * (1 - eU) : kA + e;
  const gridA = (1 - seg(t, 56.2, 57.4, ease.inOutSine)) * lerp(1, 0.22, clamp(stageF / 2.2));
  if (gridA > 0.005) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(F.x, F.y, F.w, F.h);
    ctx.clip();
    for (const gl of S.gridLines) {
      const pts: number[] = [];
      for (let k = 0; k < gl.count; k++) {
        const [gx, gy] = at(S.grid, 2 * (gl.start + k));
        pts.push(sx(gx), sy(gy));
      }
      polyline(ctx, pts, { color: gl.axis ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.22)", lw: gl.axis ? 1.5 : 1, alpha: gridA });
    }
    ctx.restore();
  }

  // the two spiral arms as smooth curves — this is what is being folded
  const armA = seg(t, T.act3 + 0.8, T.act3 + 2.0, ease.out) * (1 - seg(t, 56.4, 57.4, ease.inOutSine));
  if (armA > 0.005) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(F.x, F.y, F.w, F.h);
    ctx.clip();
    for (let c = 0; c < 2; c++) {
      const pts: number[] = [];
      for (let i = 0; i < ARM_N; i++) {
        const [ax, ay] = at(S.arms, 2 * (c * ARM_N + i));
        pts.push(sx(ax), sy(ay));
      }
      polyline(ctx, pts, { color: c ? "rgba(76,201,240,0.85)" : "rgba(255,138,61,0.85)", lw: 2.4, alpha: armA });
    }
    ctx.restore();
  }

  // the last neuron's decision boundary is a straight line in the last 2-D space …
  const lineA = seg(t, T.cut, T.cut + 1.0, ease.out) * (1 - seg(t, T.unfold[0], T.unfold[0] + 0.8, ease.inOutSine));
  if (lineA > 0.005) {
    const [la, lb, lc] = S.line;
    const W3 = S.view[3];
    // intersect a·x + b·y + c = 0 with the window
    const pts: [number, number][] = [];
    for (const x of [W3.x0, W3.x1]) {
      const y = -(la * x + lc) / lb;
      if (y >= W3.y0 && y <= W3.y1) pts.push([x, y]);
    }
    for (const y of [W3.y0, W3.y1]) {
      const x = -(lb * y + lc) / la;
      if (x >= W3.x0 && x <= W3.x1) pts.push([x, y]);
    }
    if (pts.length >= 2) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(F.x, F.y, F.w, F.h);
      ctx.clip();
      line(ctx, sx(pts[0][0]), sy(pts[0][1]), sx(pts[1][0]), sy(pts[1][1]), { color: "rgba(255,255,255,0.95)", lw: 2.6, cap: "round", alpha: lineA });
      ctx.restore();
    }
  }
  // … and the curve it becomes once the space is unfolded back to the input
  const curveA = seg(t, 56.0, 57.4, ease.inOut);
  if (curveA > 0.005) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(F.x, F.y, F.w, F.h);
    ctx.clip();
    ctx.beginPath();
    const C0 = S.contour[0];
    for (let i = 0; i < C0.length; i += 4) {
      ctx.moveTo(sx(C0[i]), sy(C0[i + 1]));
      ctx.lineTo(sx(C0[i + 2]), sy(C0[i + 3]));
    }
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.globalAlpha *= curveA;
    ctx.stroke();
    ctx.restore();
  }

  // the data
  ctx.save();
  ctx.beginPath();
  ctx.rect(F.x - 6, F.y - 6, F.w + 12, F.h + 12);
  ctx.clip();
  for (let i = 0; i < S.cls.length; i++) {
    const [px, py] = at(S.points, 2 * i);
    const pa = seg(t, T.act3 + 0.2 + (i / S.cls.length) * 1.4, T.act3 + 0.7 + (i / S.cls.length) * 1.4, ease.out);
    circle(ctx, sx(px), sy(py), 3.4, { fill: S.cls[i] ? C.pos : C.neg, alpha: pa });
  }
  ctx.restore();
  ctx.restore();

  // stage ribbon
  const rib = seg(t, 40.0, 41.0, ease.out) * (1 - seg(t, 57.0, 57.6, ease.in));
  if (rib > 0.005) {
    const active = unfold ? Math.round(3 * (1 - eU)) : Math.round(kA + e);
    STAGE_LABELS.forEach((s, i) => {
      const x = 470 + i * 96;
      const on = i === active;
      text(ctx, s, x, F.y - 14, { size: 16, weight: on ? 700 : 500, color: on ? C.text : C.faint, align: "center", font: "cjk", alpha: rib });
      if (i < 3) text(ctx, "›", x + 48, F.y - 14, { size: 16, color: C.faint, align: "center", font: "sans", alpha: rib });
    });
    text(ctx, "每一层：2 个神经元 = 2 个新坐标", CX, F.y + F.h + 32, { size: 15.5, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: rib * seg(t, 41.4, 42.4, ease.out) });
  }
  const bA = seg(t, T.cut, T.cut + 1.0, ease.out);
  if (bA > 0.01 && !unfold) text(ctx, "一条直线", F.x + F.w + 20, F.y + 30, { size: 18, weight: 600, color: C.text, font: "cjk", alpha: bA * (1 - seg(t, T.unfold[0], T.unfold[0] + 0.8)) });
  void fmt;
}

function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  if (t < 0 || t >= DUR + 0.001) return;
  drawLegend(ctx, seg(t, 0.6, 1.6, ease.out));
  if (t < 33.6) drawRingsAndLift(ctx, t);
  if (t > 32.8) drawSpirals(ctx, t);
}

export const Ch05Space: React.FC = () => (
  <>
    <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} />
    <ChapterCard />
    <Captions />
  </>
);

void mathText;
