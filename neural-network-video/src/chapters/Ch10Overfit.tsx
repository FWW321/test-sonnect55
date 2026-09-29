import { Canvas } from "../lib/canvas";
import { rgba } from "../lib/color";
import { circle, line, polyline, rrect, text } from "../lib/draw";
import { ease, fmt, lerp, seg, thousands } from "../lib/math";
import { chapterClock } from "../lib/time";
import { C, FPS, RGB_POS } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { WIN3, drawWin3 } from "../visuals/carry";
import { CHART9_INNER as IN, FIELD9, drawRunField } from "../visuals/fieldView";
import { CH9_STEP, indexOfStep, remedies, run, sampleAt, stepAt } from "../visuals/run";

/**
 * 10 · 过拟合 — the training run of chapter 9 simply carries on. Its loss on the training data keeps
 * falling towards zero while the field grows islands around individual noisy points; held-out points
 * (never used for training) reveal that the loss on them turned round long ago. Then the three classic
 * remedies, each with its real, offline-computed test loss. Carry in: the field and the loss chart.
 * Carry out: a 3×3 window of pixels, which chapter 11 slides across an image.
 */
const CH = chapterById("overfit");
const DUR = CH.dur / FPS;
const R = run();
const K0 = indexOfStep(CH9_STEP);
const KEND = R.K - 1;
const IBEST = remedies.earlyStop.index;
const BEST_STEP = remedies.earlyStop.step;

const lg = (v: number) => Math.log10(Math.max(v, 1e-3));
const TRAIN_LOG = R.trainLoss.map(lg);
const TEST_LOG = R.testLoss.map(lg);
// running minimum of the training loss (the chart's lower edge follows it down)
const TRAIN_MIN = (() => {
  const out: number[] = [];
  let m = 1e9;
  for (const v of TRAIN_LOG) out.push((m = Math.min(m, v)));
  return out;
})();
const LMAX9 = Math.max(...TRAIN_LOG.slice(0, Math.ceil(K0) + 1));

const T = {
  grow: [1.5, 9.0] as const,
  test: 9.2,
  wipe: [9.6, 12.8] as const,
  best: 13.6,
  bars: [17.0, 18.0] as const,
  rewind: [23.4, 25.4] as const,
  bar: [18.4, 20.6, 22.8, 24.4],
  plotsOut: [25.8, 26.7] as const,
  win: 26.5,
};

/** Fractional snapshot index that training has reached, and the one currently *shown* (after the rewind). */
const kRun = (t: number) => lerp(K0, KEND, Math.pow(seg(t, T.grow[0], T.grow[1], ease.linear), 0.8));
const kShown = (t: number) => lerp(kRun(t), IBEST, seg(t, T.rewind[0], T.rewind[1], ease.inOut));

// ---------------------------------------------------------------------------------- chart
function drawChart(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha < 0.004) return;
  const kp = kRun(t);
  const kc = kShown(t);
  const testShow = seg(t, T.test, T.test + 0.8, ease.out);
  const xMax = Math.max(K0, kp);
  const yTop = lerp(LMAX9, 0.16, seg(t, T.test - 0.2, T.test + 1.0, ease.inOutSine));
  const yBot = Math.min(sampleAt(TRAIN_MIN, kp), -1.2) - 0.02;
  const X = (k: number) => IN.x0 + (k / xMax) * (IN.x1 - IN.x0);
  const Y = (l: number) => IN.y1 - ((l - yBot) / (yTop - yBot)) * (IN.y1 - IN.y0);

  ctx.save();
  ctx.globalAlpha *= alpha;
  // grid + axes, as in chapter 9
  for (let i = 0; i <= 4; i++) {
    const y = IN.y0 + (i / 4) * (IN.y1 - IN.y0);
    const x = IN.x0 + (i / 4) * (IN.x1 - IN.x0);
    line(ctx, IN.x0, y, IN.x1, y, { color: "rgba(255,255,255,0.09)", lw: 1 });
    line(ctx, x, IN.y0, x, IN.y1, { color: "rgba(255,255,255,0.09)", lw: 1 });
  }
  line(ctx, IN.x0, IN.y0, IN.x0, IN.y1, { color: "rgba(255,255,255,0.14)", lw: 2 });
  line(ctx, IN.x0, IN.y1, IN.x1, IN.y1, { color: "rgba(255,255,255,0.14)", lw: 2 });
  // tick labels
  let lastY = 1e9;
  for (const v of [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001]) {
    const l = Math.log10(v);
    if (l < yBot - 0.02 || l > yTop + 0.02) continue;
    const y = Y(l);
    if (Math.abs(y - lastY) < 26) continue;
    lastY = y;
    text(ctx, String(v), IN.x0 - 10, y + 4.5, { size: 12.5, color: C.faint, align: "right", font: "mono" });
  }
  let lastX = -1e9;
  for (const s of [1, 10, 100, 1000, 10000]) {
    const k = indexOfStep(s);
    if (k > xMax + 0.01) continue;
    const x = X(k);
    if (x - lastX < 44) continue;
    lastX = x;
    text(ctx, s >= 1000 ? thousands(s) : String(s), x, IN.y1 + 20, { size: 12.5, color: C.faint, align: "center", font: "mono" });
  }
  text(ctx, "损失（对数）", IN.x0, IN.y0 - 16, { size: 15, weight: 500, color: C.dim, font: "cjk" });
  text(ctx, "训练步数", IN.x1, IN.y1 + 44, { size: 15, weight: 500, color: C.dim, align: "right", font: "cjk" });

  ctx.save();
  ctx.beginPath();
  ctx.rect(IN.x0 - 2, IN.y0 - 6, IN.x1 - IN.x0 + 8, IN.y1 - IN.y0 + 12);
  ctx.clip();
  // the training loss (orange), up to the run's progress
  const last = Math.floor(kp);
  const pts: number[] = [];
  for (let i = 0; i <= last; i++) pts.push(X(i), Y(TRAIN_LOG[i]));
  pts.push(X(kp), Y(sampleAt(TRAIN_LOG, kp)));
  polyline(ctx, pts, { color: C.neg, lw: 3 });
  // the held-out loss (white), wiped in from the left
  if (testShow > 0.01) {
    const reveal = seg(t, T.wipe[0], T.wipe[1], ease.inOutSine);
    const cut = IN.x0 + reveal * (IN.x1 - IN.x0 + 4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(IN.x0 - 2, IN.y0 - 6, cut - IN.x0 + 2, IN.y1 - IN.y0 + 12);
    ctx.clip();
    const tp: number[] = [];
    for (let i = 0; i <= Math.floor(kp); i++) tp.push(X(i), Y(TEST_LOG[i]));
    polyline(ctx, tp, { color: "#ffffff", lw: 3, alpha: testShow });
    ctx.restore();
  }
  ctx.restore();

  // the best moment
  const bA = seg(t, T.best, T.best + 0.8, ease.out) * (1 - seg(t, T.plotsOut[0], T.plotsOut[0] + 0.5));
  if (bA > 0.01) {
    const x = X(IBEST);
    line(ctx, x, IN.y0 - 12, x, IN.y1, { color: rgba(RGB_POS, 0.7), lw: 1.4, dash: [5, 5], alpha: bA });
    circle(ctx, x, Y(TEST_LOG[IBEST]), 5.5, { fill: C.pos, stroke: "#ffffff", lw: 1.5, alpha: bA });
    text(ctx, `测试损失最低 · 第 ${BEST_STEP} 步`, x, IN.y0 - 20, { size: 14.5, weight: 600, color: C.pos, align: "center", font: "cjk", alpha: bA });
  }
  // the cursor while rewinding
  const rw = seg(t, T.rewind[0], T.rewind[1], ease.inOut);
  if (rw > 0.001 && rw < 0.999) {
    const x = X(kc);
    line(ctx, x, IN.y0, x, IN.y1, { color: "rgba(255,255,255,0.4)", lw: 1.2 });
    circle(ctx, x, Y(sampleAt(TEST_LOG, kc)), 5, { fill: "#ffffff" });
    circle(ctx, x, Y(sampleAt(TRAIN_LOG, kc)), 5, { fill: C.neg });
  }
  // curve names
  const nameA = seg(t, T.wipe[1] - 0.6, T.wipe[1] + 0.4, ease.out) * (1 - seg(t, T.plotsOut[0], T.plotsOut[0] + 0.5));
  if (nameA > 0.01) {
    text(ctx, "没见过的数据", X(KEND) - 6, Y(TEST_LOG[KEND]) - 12, { size: 15, weight: 700, color: "#ffffff", align: "right", font: "cjk", alpha: nameA });
    text(ctx, "训练数据", X(KEND) - 6, Y(TRAIN_LOG[KEND]) - 12, { size: 15, weight: 700, color: C.neg, align: "right", font: "cjk", alpha: nameA });
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------- the three remedies
const ROWS = [
  { label: "一直训练到底", sub: `${thousands(remedies.overtrained.step ?? 24000)} 步`, v: remedies.overtrained.testLoss, acc: remedies.overtrained.testAcc, bad: true },
  { label: "更多数据", sub: `数据量 ×${Math.round(remedies.moreData.n / 220)}`, v: remedies.moreData.testLoss, acc: remedies.moreData.testAcc, bad: false },
  { label: "更简单的模型", sub: "限制权重大小", v: remedies.simpler.testLoss, acc: remedies.simpler.testAcc, bad: false },
  { label: "及时停下", sub: `第 ${remedies.earlyStop.step} 步`, v: remedies.earlyStop.testLoss, acc: remedies.earlyStop.testAcc, bad: false },
];

function drawBars(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha < 0.004) return;
  const x0 = 640;
  const W = 470;
  ctx.save();
  ctx.globalAlpha *= alpha;
  text(ctx, "在没见过的数据上，损失是多少？（越低越好）", x0, 196, { size: 17, weight: 500, color: C.dim, font: "cjk" });
  ROWS.forEach((r, i) => {
    const a = seg(t, T.bar[i], T.bar[i] + 0.7, ease.out);
    if (a < 0.005) return;
    const y = 250 + i * 76;
    const grow = seg(t, T.bar[i] + 0.2, T.bar[i] + 1.4, ease.out);
    const col = r.bad ? C.neg : C.pos;
    text(ctx, r.label, x0, y, { size: 20, weight: 700, color: C.text, font: "cjk", alpha: a });
    text(ctx, r.sub, x0 + 150, y, { size: 15, weight: 500, color: C.dim, font: "cjk", alpha: a });
    rrect(ctx, x0, y + 12, W, 16, 5, { fill: "rgba(255,255,255,0.05)", alpha: a });
    rrect(ctx, x0, y + 12, Math.max(6, W * (r.v / 1.3) * grow), 16, 5, { fill: col, alpha: a * 0.95 });
    text(ctx, fmt(r.v * grow, 2), x0 + W + 16, y + 26, { size: 20, weight: 700, color: col, font: "mono", alpha: a });
    text(ctx, `正确率 ${(r.acc * 100).toFixed(0)}%`, x0 + W + 16, y + 3, { size: 13, weight: 500, color: C.dim, font: "cjk", alpha: a });
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------------- scene
function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  if (t < 0 || t >= DUR + 0.001) return;
  const plots = 1 - seg(t, T.plotsOut[0], T.plotsOut[1], ease.inOutSine);
  const kc = kShown(t);

  if (plots > 0.003) {
    const testShow = seg(t, T.test, T.test + 1.0, ease.out);
    drawRunField(ctx, FIELD9, kc, { alpha: plots, points: testShow > 0.01 ? "both" : "train", testAlpha: testShow, wrong: testShow * (1 - seg(t, T.rewind[0], T.rewind[1] - 0.6)) + seg(t, T.rewind[1] - 0.2, T.rewind[1] + 0.4) * 0.9 });
    text(ctx, "它现在的判断", FIELD9.x, FIELD9.y - 14, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha: plots * seg(t, 5.2, 6.0, ease.out) });
    // legend for the rings
    const lg1 = seg(t, T.test + 0.4, T.test + 1.2, ease.out) * plots;
    if (lg1 > 0.01) {
      circle(ctx, FIELD9.x + 6, FIELD9.y + FIELD9.h + 26, 4.5, { fill: C.text, alpha: lg1 });
      text(ctx, "训练用的点", FIELD9.x + 18, FIELD9.y + FIELD9.h + 31, { size: 14, weight: 500, color: C.dim, font: "cjk", alpha: lg1 });
      circle(ctx, FIELD9.x + 132, FIELD9.y + FIELD9.h + 26, 4.5, { stroke: C.text, lw: 1.4, alpha: lg1 });
      text(ctx, "没见过的点", FIELD9.x + 144, FIELD9.y + FIELD9.h + 31, { size: 14, weight: 500, color: C.dim, font: "cjk", alpha: lg1 });
      line(ctx, FIELD9.x + 246, FIELD9.y + FIELD9.h + 21, FIELD9.x + 255, FIELD9.y + FIELD9.h + 30, { color: "#ffffff", lw: 1.6, alpha: lg1 });
      line(ctx, FIELD9.x + 246, FIELD9.y + FIELD9.h + 30, FIELD9.x + 255, FIELD9.y + FIELD9.h + 21, { color: "#ffffff", lw: 1.6, alpha: lg1 });
      text(ctx, "判断错了", FIELD9.x + 262, FIELD9.y + FIELD9.h + 31, { size: 14, weight: 500, color: C.dim, font: "cjk", alpha: lg1 });
    }
    // read-outs
    const step = Math.round(stepAt(kc));
    const trainL = sampleAt(R.trainLoss, kc);
    const testL = sampleAt(R.testLoss, kc);
    const Y = 152;
    const ro = (x: number, label: string, v: string, color: string, a = 1) => {
      text(ctx, label, x, Y - 26, { size: 15, weight: 500, color: C.dim, font: "cjk", alpha: plots * a });
      text(ctx, v, x, Y + 10, { size: 34, weight: 700, color, font: "mono", alpha: plots * a });
    };
    const chartA = plots * (1 - seg(t, T.bars[0], T.bars[1], ease.inOutSine));
    const showAcc = (1 - seg(t, T.test - 0.2, T.test + 0.6)) * chartA;
    const showTest = seg(t, T.test + 0.2, T.test + 1.0) * chartA;
    ctx.save();
    ctx.globalAlpha *= chartA;
    ro(IN.x0 - 30, "训练步数", thousands(step), C.text);
    ro(IN.x0 + 150, "训练数据上的损失", trainL < 0.0001 ? "≈ 0" : fmt(trainL, trainL < 0.01 ? 4 : trainL < 0.1 ? 3 : 2), trainL > 0.3 ? C.neg : C.text);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= showAcc;
    ro(IN.x0 + 320, "训练集正确率", `${Math.round(sampleAt(R.trainAcc, kc) * 100)}%`, C.pos);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= showTest;
    ro(IN.x0 + 320, "没见过的数据上的损失", fmt(testL, 2), testL > 0.3 ? "#ffffff" : C.pos);
    ctx.restore();
    drawChart(ctx, t, chartA);
    drawBars(ctx, t, plots * seg(t, T.bars[0], T.bars[1], ease.inOutSine));
  }

  // carry out: the 3×3 window
  const wA = seg(t, T.win, T.win + 0.9, ease.out);
  if (wA > 0.003) {
    const s = lerp(0.72, 1, ease.soft(seg(t, T.win, T.win + 1.1, ease.linear)));
    ctx.save();
    ctx.translate(WIN3.cx, WIN3.cy);
    ctx.scale(s, s);
    ctx.translate(-WIN3.cx, -WIN3.cy);
    drawWin3(ctx, WIN3.cx, WIN3.cy, WIN3.cell, wA, true);
    ctx.restore();
  }
}

export const Ch10Overfit: React.FC = () => (
  <>
    <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} />
    <ChapterCard />
    <Captions />
  </>
);
