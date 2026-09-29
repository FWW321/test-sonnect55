import { Canvas } from "../lib/canvas";
import { classField, rgba } from "../lib/color";
import { circle, heatmap, line, rrect, text } from "../lib/draw";
import { clamp, ease, fmt, keyframes, lerp, seg } from "../lib/math";
import { chapterClock, useChapterClock } from "../lib/time";
import { evaluate, Net, predictGrid } from "../nn/mlp";
import { C, FPS, RGB_NEG, RGB_POS } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { Formula } from "../ui/Formula";
import { LEGEND, drawClassDot } from "../visuals/carry";
import { TILT_END, drawLandscapeMarkers, drawLandscapeRest, drawParamAxes, drawSurface, restCam } from "../visuals/landscape";
import { Plot, drawAxes, drawCurve, px, py } from "../visuals/plot";
import { REG, START, mse } from "../visuals/regression";
import { EXT, SPACE_FRAME, contourSegments, spiralData, spiralNet } from "../visuals/toyNets";
import { Cam3 } from "../visuals/view3d";

/**
 * 06 · 损失 — Act A: the trained spiral classifier from chapter 5 is scrambled towards a random
 * network and the *real* loss and accuracy fall apart. Act B: cross-entropy is −ln p. Act C: mean-squared
 * error as literal squares. Act D: try every (w, b) and the loss becomes terrain — the same regression
 * problem, so the landscape is exact. Carry in: the spiral picture. Carry out: the terrain with the ball.
 */
const CH = chapterById("loss");
const DUR = CH.dur / FPS;
const F = SPACE_FRAME;

// ---------------------------------------------------------------------------------- Act A: scrambling
const trained = spiralNet();
const DS = spiralData();
const Yb = DS.y.map((v) => Float64Array.of(v));
const randomNet = (() => {
  // a random network of the same shape that is genuinely bad: loss ≈ 0.7–0.9, accuracy near chance
  for (let seed = 1; seed < 400; seed++) {
    const n = Net.init(trained.sizes, trained.acts, seed);
    const m = evaluate(n, DS.X, Yb, "bce");
    if (m.loss > 0.68 && m.loss < 0.95 && m.acc > 0.42 && m.acc < 0.6) return n;
  }
  return Net.init(trained.sizes, trained.acts, 1);
})();
const scratch = new Net(trained.sizes, trained.acts);
const scratchCache = scratch.makeCache();
const FIELD_N = 96;

function scramble(u: number) {
  for (let i = 0; i < scratch.params.length; i++) scratch.params[i] = lerp(trained.params[i], randomNet.params[i], u);
}

const sxF = (x: number) => F.x + ((x + EXT) / (2 * EXT)) * F.w;
const syF = (y: number) => F.y + F.h - ((y + EXT) / (2 * EXT)) * F.h;

function drawActA(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  const u = ease.inOut(clamp((t - 1.6) / 4.2));
  scramble(u);
  const m = evaluate(scratch, DS.X, Yb, "bce", scratchCache);

  ctx.save();
  ctx.globalAlpha *= alpha;
  rrect(ctx, F.x - 1, F.y - 1, F.w + 2, F.h + 2, 8, { stroke: "rgba(255,255,255,0.16)", lw: 1 });
  // field of the (scrambled) network
  const raw = predictGrid(scratch, -EXT, EXT, -EXT, EXT, FIELD_N, FIELD_N, scratchCache);
  const flip = new Float32Array(FIELD_N * FIELD_N);
  for (let j = 0; j < FIELD_N; j++) for (let i = 0; i < FIELD_N; i++) flip[j * FIELD_N + i] = raw[(FIELD_N - 1 - j) * FIELD_N + i];
  ctx.save();
  ctx.beginPath();
  ctx.rect(F.x, F.y, F.w, F.h);
  ctx.clip();
  heatmap(ctx, flip, FIELD_N, FIELD_N, F.x, F.y, F.w, F.h, (v) => classField(v, 0.36), { smooth: true });
  // decision boundary
  const segs = contourSegments(raw, FIELD_N, -EXT, EXT);
  ctx.beginPath();
  for (let i = 0; i < segs.length; i += 4) {
    ctx.moveTo(sxF(segs[i]), syF(segs[i + 1]));
    ctx.lineTo(sxF(segs[i + 2]), syF(segs[i + 3]));
  }
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
  // the data; misclassified points get a ring
  for (let i = 0; i < DS.X.length; i++) {
    const x = sxF(DS.X[i][0]);
    const y = syF(DS.X[i][1]);
    const out = scratch.forward(DS.X[i], scratchCache)[0];
    const wrong = (out > 0.5 ? 1 : 0) !== DS.y[i];
    circle(ctx, x, y, 3.4, { fill: DS.y[i] ? C.pos : C.neg });
    if (wrong && u > 0.02) circle(ctx, x, y, 7.2, { stroke: "rgba(255,255,255,0.9)", lw: 1.4, alpha: clamp(u * 3) });
  }
  ctx.restore();

  // the two numbers that matter
  const ro = seg(t, 1.2, 2.2, ease.out) * alpha;
  if (ro > 0.01) {
    text(ctx, "损失 L", 880, 262, { size: 17, weight: 500, color: C.dim, font: "cjk", alpha: ro });
    text(ctx, fmt(m.loss, 2), 880, 322, { size: 58, weight: 700, color: m.loss > 0.3 ? C.neg : C.text, font: "mono", alpha: ro });
    text(ctx, "正确率", 880, 366, { size: 17, weight: 500, color: C.dim, font: "cjk", alpha: ro });
    text(ctx, `${Math.round(m.acc * 100)}%`, 880, 402, { size: 30, weight: 600, color: m.acc < 0.9 ? C.neg : C.text, font: "mono", alpha: ro });
  }
}

// ---------------------------------------------------------------------------------- Act B: −ln p
const QP: Plot = { x: 170, y: 150, w: 520, h: 300, x0: 0, x1: 1, y0: 0, y1: 4.2 };
const EXAMPLES = [
  { p: 0.95, note: "有把握，而且答对了", t: 9.2 },
  { p: 0.5, note: "拿不准", t: 11.0 },
  { p: 0.03, note: "很有把握——但答错了", t: 12.8 },
];

function drawActB(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  const p = QP;
  drawAxes(ctx, p, { alpha, ticksX: [0, 0.25, 0.5, 0.75, 1], ticksY: [0, 1, 2, 3, 4], labelX: "p", labelY: "损失", grid: true });
  const cur = seg(t, 8.4, 9.8, ease.inOut);
  drawCurve(ctx, p, (x) => -Math.log(Math.max(x, 1e-4)), { color: C.text, lw: 2.8, alpha, progress: cur, samples: 240 });
  text(ctx, "p = 网络给正确答案的概率", p.x, p.y + p.h + 60, { size: 17, weight: 500, color: C.dim, font: "cjk", alpha: alpha * cur });

  let shown = -1;
  EXAMPLES.forEach((e, i) => {
    if (t >= e.t) shown = i;
  });
  EXAMPLES.forEach((e, i) => {
    const a = seg(t, e.t, e.t + 0.8, ease.out) * alpha;
    if (a <= 0.005) return;
    const L = -Math.log(e.p);
    const X = px(p, e.p);
    const Y = py(p, L);
    const bad = L > 2;
    const col = bad ? RGB_NEG : RGB_POS;
    const now = i === shown ? 1 : 0.5;
    line(ctx, X, p.y + p.h, X, Y, { color: rgba(col, 0.55), lw: 1.3, dash: [3, 4], alpha: a * now });
    line(ctx, p.x, Y, X, Y, { color: rgba(col, 0.55), lw: 1.3, dash: [3, 4], alpha: a * now });
    circle(ctx, X, Y, bad ? 7.5 : 6, { fill: bad ? C.neg : C.pos, stroke: "rgba(255,255,255,0.85)", lw: 1.4, alpha: a * now });
    text(ctx, fmt(L, 2), p.x - 10, Y + 5, { size: 14, weight: 600, color: bad ? C.neg : C.pos, align: "right", font: "mono", alpha: a * now });
  });

  // the current example, spelled out on the right
  if (shown >= 0) {
    const e = EXAMPLES[shown];
    const a = seg(t, e.t + 0.1, e.t + 0.9, ease.out) * alpha;
    const L = -Math.log(e.p);
    const bad = L > 2;
    const x0 = 770;
    text(ctx, e.note, x0, 200, { size: 22, weight: 700, color: bad ? C.neg : C.text, font: "cjk", alpha: a });
    // p vs 1-p bar
    rrect(ctx, x0, 226, 360 * e.p, 16, 4, { fill: C.pos, alpha: a * 0.9 });
    rrect(ctx, x0 + 360 * e.p, 226, 360 * (1 - e.p), 16, 4, { fill: C.neg, alpha: a * 0.9 });
    text(ctx, `p = ${e.p.toFixed(2)}`, x0, 270, { size: 19, weight: 600, color: C.pos, font: "mono", alpha: a });
    text(ctx, `损失 = −ln p = ${fmt(L, 2)}`, x0, 312, { size: 26, weight: 700, color: bad ? C.neg : C.text, font: "mono", alpha: a });
  }
}

// ---------------------------------------------------------------------------------- Act C: squares
const RP: Plot = { x: 110, y: 130, w: 403.2, h: 345.6, x0: 0, x1: 5.6, y0: -0.2, y1: 4.6 }; // 72 px per unit both ways
const RSC = RP.w / (RP.x1 - RP.x0);

// A visibly wrong — but not absurd — line for the squares scene (residuals ≲ 2, so the squares stay on screen).
const C_START = { w: 0.05, b: 2.55 };
function paramsC(t: number): [number, number] {
  const k: [number, number][] = [[16.6, 0], [21.6, 1]];
  const e = keyframes(t, k, ease.inOut);
  return [lerp(C_START.w, REG.wStar, e), lerp(C_START.b, REG.bStar, e)];
}

function drawRegression(ctx: CanvasRenderingContext2D, t: number, alpha: number, w: number, b: number, squaresA: number) {
  const p = RP;
  rrect(ctx, p.x - 30, p.y - 22, p.w + 46, p.h + 74, 12, { stroke: "rgba(255,255,255,0.08)", lw: 1, alpha });
  drawAxes(ctx, p, { alpha, ticksX: [0, 1, 2, 3, 4, 5], ticksY: [0, 1, 2, 3, 4], labelX: "x", labelY: "y", grid: true });
  // squares first (behind the line and points)
  for (let i = 0; i < REG.n; i++) {
    const x = REG.xs[i];
    const y = REG.ys[i];
    const yh = w * x + b;
    const d = yh - y;
    const side = Math.abs(d) * RSC;
    const X = px(p, x);
    const yTop = Math.min(py(p, y), py(p, yh));
    const a = squaresA * seg(t, 16.0 + i * 0.06, 16.7 + i * 0.06, ease.out);
    if (a > 0.005 && side > 0.5) {
      rrect(ctx, X, yTop, side, side, 1.5, { fill: rgba(RGB_NEG, 0.16), stroke: rgba(RGB_NEG, 0.85), lw: 1.1, alpha: alpha * a });
      line(ctx, X, py(p, y), X, py(p, yh), { color: C.neg, lw: 1.6, alpha: alpha * a });
    }
  }
  // the model
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x, p.y - 20, p.w, p.h + 20);
  ctx.clip();
  line(ctx, px(p, p.x0), py(p, w * p.x0 + b), px(p, p.x1), py(p, w * p.x1 + b), { color: C.text, lw: 2.8, alpha, cap: "round" });
  ctx.restore();
  for (let i = 0; i < REG.n; i++) {
    const a = seg(t, 15.6 + i * 0.05, 16.2 + i * 0.05, ease.out) * alpha;
    circle(ctx, px(p, REG.xs[i]), py(p, REG.ys[i]), 5.2, { fill: C.pos, stroke: "rgba(255,255,255,0.7)", lw: 1, alpha: a });
  }
  text(ctx, `w = ${w < 0 ? "−" : ""}${fmt(Math.abs(w), 2)}`, p.x + 4, p.y + p.h + 44, { size: 18, weight: 600, color: C.text, font: "mono", alpha });
  text(ctx, `b = ${b < 0 ? "−" : ""}${fmt(Math.abs(b), 2)}`, p.x + 150, p.y + p.h + 44, { size: 18, weight: 600, color: C.text, font: "mono", alpha });
}

// ---------------------------------------------------------------------------------- Act D: terrain
const PANEL_CAM: Cam3 = { yaw: 0, pitch: 0, scale: 170, cx: 902, cy: 300 };

function camD(t: number, gf: number): Cam3 {
  if (t >= 31.4) return restCam(gf);
  const e = seg(t, 28.6, 31.4, ease.inOut);
  const rest = restCam(TILT_END);
  return {
    yaw: lerp(PANEL_CAM.yaw, rest.yaw, e),
    pitch: lerp(PANEL_CAM.pitch, rest.pitch, e),
    scale: lerp(PANEL_CAM.scale, rest.scale, e),
    cx: lerp(PANEL_CAM.cx, rest.cx, e),
    cy: lerp(PANEL_CAM.cy, rest.cy, e),
  };
}

function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  if (t < 0 || t >= DUR + 0.001) return;

  // ---- Act A (and the legend it inherits from chapter 5)
  const aA = 1 - seg(t, 6.4, 7.8, ease.inOutSine);
  if (aA > 0.003) {
    drawActA(ctx, t, aA);
    drawClassDot(ctx, LEGEND.A.x, LEGEND.A.y, LEGEND.r, "A", aA);
    drawClassDot(ctx, LEGEND.B.x, LEGEND.B.y, LEGEND.r, "B", aA);
    text(ctx, "类别 A", LEGEND.A.x + 20, LEGEND.A.y + 6, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha: aA });
    text(ctx, "类别 B", LEGEND.B.x + 20, LEGEND.B.y + 6, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha: aA });
  }

  // ---- Act B
  const aB = seg(t, 7.6, 8.6, ease.out) * (1 - seg(t, 14.4, 15.4, ease.inOutSine));
  if (aB > 0.003) drawActB(ctx, t, aB);

  // ---- Act C and D share the regression panel on the left
  const inC = seg(t, 15.2, 16.0, ease.out) * (1 - seg(t, 28.6, 30.2, ease.inOutSine));
  if (inC > 0.003) {
    let w: number;
    let b: number;
    const scanT = seg(t, 24.6, 28.4, ease.linear);
    if (t < 23.6) [w, b] = paramsC(t);
    else if (t < 28.5) {
      const r = scanT * 38;
      const j = Math.min(37, Math.floor(r));
      const i = (r - j) * 44;
      w = lerp(-1.2, 2.4, i / 44);
      b = lerp(-0.8, 4.4, (j + 0.5) / 38);
      // ease from the fitted line into the first scan position
      const k = seg(t, 23.6, 24.6, ease.inOut);
      const [w0, b0] = paramsC(23.6);
      w = lerp(w0, w, k);
      b = lerp(b0, b, k);
    } else {
      w = START.w;
      b = START.b;
    }
    const sqA = 1 - seg(t, 22.6, 23.6, ease.inOutSine);
    drawRegression(ctx, t, inC, w, b, sqA);
  }

  // ---- terrain
  const dA = seg(t, 23.4, 24.6, ease.out);
  if (dA > 0.003) {
    const cam = camD(t, gf);
    const reveal = seg(t, 24.6, 28.4, ease.linear);
    const tilt = seg(t, 28.6, 31.4, ease.inOut);
    if (t < 31.4) {
      drawSurface(ctx, { cam, alpha: dA, reveal, mesh: tilt });
      drawParamAxes(ctx, cam, dA * seg(t, 24.6, 25.4, ease.out));
      // scan cursor on the parameter plane
      if (reveal > 0 && reveal < 1) {
        const r = reveal * 38;
        const j = Math.min(37, Math.floor(r));
        const i = (r - j) * 44;
        const sw = lerp(-1.2, 2.4, i / 44);
        const sb = lerp(-0.8, 4.4, (j + 0.5) / 38);
        const X = cam.cx + cam.scale * (2 * (sw + 1.2) / 3.6 - 1);
        const Y = cam.cy - cam.scale * (2 * (sb + 0.8) / 5.2 - 1);
        circle(ctx, X, Y, 5.5, { fill: "#ffffff", alpha: dA });
        line(ctx, cam.cx - cam.scale, Y, cam.cx + cam.scale, Y, { color: "rgba(255,255,255,0.35)", lw: 1, alpha: dA });
      }
      // ball + minimum arrive with the tilt
      const ballA = seg(t, 29.4, 30.6, ease.out);
      const minA = seg(t, 30.8, 31.4, ease.out);
      if (ballA > 0.003 || minA > 0.003) {
        drawLandscapeMarkers(ctx, cam, { alpha: dA, ball: ballA > 0.003 ? [START.w, START.b] : null, ballAlpha: ballA, minimum: minA });
      }
    } else {
      drawLandscapeRest(ctx, gf, {});
    }
  }
  void mse;
}

const Overlay: React.FC = () => {
  const c = useChapterClock();
  const t = c.t;
  const b = seg(t, 8.6, 9.6, ease.out) * (1 - seg(t, 14.4, 15.4, ease.inOutSine));
  const cc = seg(t, 16.8, 18.0, ease.out) * (1 - seg(t, 23.0, 24.0, ease.inOutSine));
  return (
    <>
      {b > 0.01 && (
        <div style={{ position: "absolute", left: 770, top: 348, opacity: b }}>
          <Formula tex={String.raw`L=-\ln p`} size={36} />
        </div>
      )}
      {cc > 0.01 && <RegressionReadout t={t} alpha={cc} />}
    </>
  );
};

const RegressionReadout: React.FC<{ t: number; alpha: number }> = ({ t, alpha }) => {
  const [w, b] = paramsC(t);
  const L = mse(w, b);
  return (
    <div style={{ position: "absolute", left: 700, top: 176, width: 520, opacity: alpha }}>
      <div style={{ fontSize: 17, fontWeight: 500, color: C.dim }}>均方误差 L</div>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 62, fontWeight: 700, color: L > 0.5 ? C.neg : C.text, lineHeight: 1.15 }}>
        {fmt(L, 2)}
      </div>
      <div style={{ marginTop: 12 }}>
        <Formula tex={String.raw`L=\dfrac{1}{n}\sum_{i=1}^{n}\left(\hat y_i-y_i\right)^2`} size={30} />
      </div>
      <div style={{ marginTop: 14, fontSize: 17, fontWeight: 500, color: C.dim }}>橙色方块的面积 = 每个点的（差距）²</div>
    </div>
  );
};

export const Ch06Loss: React.FC = () => (
  <>
    <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} />
    <Overlay />
    <ChapterCard />
    <Captions />
  </>
);
