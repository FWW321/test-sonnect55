import { Sequence } from "remotion";
import { AnimatedLineChart } from "../components/remocn/animated-line-chart";
import { GlassCodeBlock } from "../components/remocn/glass-code-block";
import { Canvas } from "../lib/canvas";
import { arrow, circle, glow, line, polyline, rrect, text } from "../lib/draw";
import { clamp, ease, fmt, lerp, seg } from "../lib/math";
import { chapterClock, useChapterClock } from "../lib/time";
import { C, FPS, RGB, RGB_NEG, RGB_POS } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { UpdateRule } from "../ui/UpdateRule";
import { CHART9, CHART9_INNER, FIELD9, drawRunField } from "../visuals/fieldView";
import { CH9_STEP, indexOfStep, run, sampleAt, stepAt } from "../visuals/run";

/**
 * 09 · 训练 — Act A: the update rule (carried from chapter 8) becomes the fifth of five steps: sample,
 * forward, loss, backward, update — a loop repeated thousands of times. Act B: one real training run
 * (2-16-16-1 tanh, full-batch Adam, noisy spirals): the decision field goes from random to the shape
 * of the data while the real loss curve is drawn by remocn's animated-line-chart. Act C: the same loop
 * as code, in remocn's glass code block, stepped line by line. Carry out: the trained field and the loss curve.
 */
const CH = chapterById("training");
const DUR = CH.dur / FPS;
const R = run();

const K9 = indexOfStep(CH9_STEP);

// ---------------------------------------------------------------------------------- timeline
const T = {
  glide: [1.0, 3.0] as const,
  cards: [1.5, 2.1, 2.7, 3.3],
  arrows: 3.8,
  sweep: [5.0, 7.6] as const,
  loop: [7.0, 8.0] as const,
  compact: [8.0, 9.2] as const,
  stage: [8.8, 9.8] as const,
  trainFrom: 11.2,
  trainTo: 33.0,
  code: 34.2,
  codeOut: 42.2,
};

// ---------------------------------------------------------------------------------- the five steps
const STEPS5 = [
  { title: "取一批数据", sub: "输入 x 和答案 y", chip: "取样" },
  { title: "前向传播", sub: "算出预测 p", chip: "前向" },
  { title: "计算损失", sub: "看错得多离谱", chip: "损失" },
  { title: "反向传播", sub: "得到每个梯度", chip: "反向" },
  { title: "更新参数", sub: "朝下坡走一小步", chip: "更新" },
];
const ACCENT: RGB[] = [[154, 164, 181], RGB_POS, RGB_NEG, RGB_NEG, [255, 255, 255]];
const CARD = { w: 196, h: 156, y: 252, gap: 28 };
const cardX = (k: number) => 94 + k * (CARD.w + CARD.gap);
const CHIP = { w: 108, h: 30, y: 82, gap: 12 };
const chipX = (k: number) => 640 - (5 * CHIP.w + 4 * CHIP.gap) / 2 + k * (CHIP.w + CHIP.gap);

const rgbStr = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Small pictograms for the cards. */
function icon(ctx: CanvasRenderingContext2D, k: number, cx: number, cy: number, a: number) {
  ctx.save();
  ctx.globalAlpha *= a;
  if (k === 0) {
    const pts: [number, number, boolean][] = [
      [-40, -14, true], [-18, 10, false], [0, -8, true], [20, 14, false], [38, -6, true], [-4, 20, false],
    ];
    for (const [dx, dy, cls] of pts) circle(ctx, cx + dx, cy + dy, 6, { fill: cls ? C.pos : C.neg });
  } else if (k === 1) {
    for (const [dx, dy] of [[-42, -14], [-42, 14], [0, 0], [42, 0]] as [number, number][]) circle(ctx, cx + dx, cy + dy, 8, { stroke: "rgba(255,255,255,0.5)", lw: 1.6, fill: "#0c1118" });
    arrow(ctx, cx - 30, cy, cx - 12, cy, { color: C.pos, lw: 2, head: 7 });
    arrow(ctx, cx + 12, cy, cx + 30, cy, { color: C.pos, lw: 2, head: 7 });
  } else if (k === 2) {
    text(ctx, "L", cx, cy + 16, { size: 46, weight: 500, color: C.neg, align: "center", font: "sans", italic: true });
  } else if (k === 3) {
    for (const [dx, dy] of [[-42, -14], [-42, 14], [0, 0], [42, 0]] as [number, number][]) circle(ctx, cx + dx, cy + dy, 8, { stroke: "rgba(255,255,255,0.5)", lw: 1.6, fill: "#0c1118" });
    arrow(ctx, cx + 34, cy, cx + 14, cy, { color: C.neg, lw: 2, head: 7 });
    arrow(ctx, cx - 8, cy, cx - 28, cy, { color: C.neg, lw: 2, head: 7 });
  }
  ctx.restore();
}

function drawCards(ctx: CanvasRenderingContext2D, t: number) {
  const appear = (k: number) => (k === 4 ? seg(t, 1.2, 2.0, ease.soft) : seg(t, T.cards[k], T.cards[k] + 0.7, ease.soft));
  const compact = seg(t, T.compact[0], T.compact[1], ease.inOut);
  const sweep = seg(t, T.sweep[0], T.sweep[1], ease.linear) * 5;
  const sweepOn = t >= T.sweep[0] && t < T.sweep[1] + 0.6;
  // arrows between the cards
  for (let k = 0; k < 4; k++) {
    const g = seg(t, T.arrows + k * 0.25, T.arrows + k * 0.25 + 0.5, ease.soft) * (1 - compact);
    if (g < 0.01) continue;
    const x1 = cardX(k) + CARD.w + 4;
    const x2 = cardX(k + 1) - 4;
    arrow(ctx, x1, CARD.y + CARD.h / 2, x1 + (x2 - x1) * g, CARD.y + CARD.h / 2, { color: "rgba(255,255,255,0.4)", lw: 1.8, head: 8, alpha: g });
  }
  // the loop from ⑤ back to ①
  const lp = seg(t, T.loop[0], T.loop[1], ease.inOut) * (1 - compact);
  if (lp > 0.01) {
    const yb = CARD.y + CARD.h;
    const yl = yb + 58;
    const x5 = cardX(4) + CARD.w / 2;
    const x1 = cardX(0) + CARD.w / 2;
    const pts = [x5, yb + 4, x5, yl, x1, yl, x1, yb + 8];
    // draw the path progressively
    const segLen = [yl - yb - 4, x5 - x1, yl - yb - 8];
    const total = segLen[0] + segLen[1] + segLen[2];
    let rem = total * lp;
    const path: number[] = [pts[0], pts[1]];
    let cx = pts[0];
    let cy = pts[1];
    for (let s = 0; s < 3; s++) {
      const tx = pts[2 + 2 * s];
      const ty = pts[3 + 2 * s];
      const L = segLen[s];
      const take = Math.min(rem, L);
      cx += ((tx - cx) / L) * take;
      cy += ((ty - cy) / L) * take;
      path.push(cx, cy);
      rem -= take;
      if (rem <= 0) break;
    }
    polyline(ctx, path, { color: "rgba(255,255,255,0.45)", lw: 1.8, alpha: lp });
    if (lp > 0.98) arrow(ctx, x1, yl, x1, yb + 6, { color: "rgba(255,255,255,0.45)", lw: 1.8, head: 8 });
    text(ctx, "重复几千次", (x1 + x5) / 2, yl + 28, { size: 20, weight: 600, color: C.text, align: "center", font: "cjk", alpha: lp });
  }
  // cards ↔ chips
  for (let k = 0; k < 5; k++) {
    const a = appear(k);
    if (a < 0.005) continue;
    const isActive = sweepOn && Math.floor(sweep) === k;
    const cx0 = cardX(k);
    const x = lerp(cx0, chipX(k), compact);
    const y = lerp(CARD.y + (1 - a) * 14, CHIP.y, compact);
    const w = lerp(CARD.w, CHIP.w, compact);
    const h = lerp(CARD.h, CHIP.h, compact);
    const col = ACCENT[k];
    if (isActive && compact < 0.5) glow(ctx, x + w / 2, y + h / 2, 130, col, 0.18);
    rrect(ctx, x, y, w, h, lerp(14, 8, compact), {
      fill: isActive ? rgbStr(col, 0.1) : "#0e1218",
      stroke: isActive ? rgbStr(col, 0.85) : "rgba(255,255,255,0.14)",
      lw: isActive ? 2 : 1.2,
      alpha: a,
    });
    const body = (1 - seg(compact, 0, 0.4, ease.out)) * a;
    if (body > 0.01) {
      text(ctx, String(k + 1), x + 16, y + 30, { size: 20, weight: 700, color: rgbStr(col, 0.95), font: "mono", alpha: body });
      text(ctx, STEPS5[k].title, x + CARD.w / 2, y + 34, { size: 21, weight: 700, color: C.text, align: "center", font: "cjk", alpha: body });
      if (k < 4) icon(ctx, k, x + CARD.w / 2, y + 90, body);
      text(ctx, STEPS5[k].sub, x + CARD.w / 2, y + CARD.h - 16, { size: 15, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: body });
    }
    const chipA = seg(compact, 0.55, 1, ease.out) * a;
    if (chipA > 0.01) {
      text(ctx, `${k + 1}`, x + 14, y + h / 2 + 5.5, { size: 15, weight: 700, color: rgbStr(col, 0.95), font: "mono", alpha: chipA });
      text(ctx, STEPS5[k].chip, x + w / 2 + 8, y + h / 2 + 5.5, { size: 15, weight: 600, color: C.text, align: "center", font: "cjk", alpha: chipA });
    }
  }
}

/** During the run: a cosmetic sweep across the five chips — "again, and again". */
function drawStrip(ctx: CanvasRenderingContext2D, t: number, alpha: number, forced = -1) {
  if (alpha < 0.01) return;
  const phase = forced >= 0 ? forced : (t * 1.7) % 5;
  for (let k = 0; k < 5; k++) {
    const dist = Math.min(Math.abs(phase - k), 5 - Math.abs(phase - k));
    const d = forced >= 0 ? (Math.floor(phase) === k ? 1 : 0) : Math.max(0, 1 - dist * 1.1);
    const col = ACCENT[k];
    const x = chipX(k);
    if (d > 0.05) glow(ctx, x + CHIP.w / 2, CHIP.y + CHIP.h / 2, 60, col, 0.18 * d * alpha);
    rrect(ctx, x, CHIP.y, CHIP.w, CHIP.h, 8, { fill: rgbStr(col, 0.1 * d), stroke: d > 0.3 ? rgbStr(col, 0.4 + 0.5 * d) : "rgba(255,255,255,0.14)", lw: 1.2 + d * 0.8, alpha });
    text(ctx, `${k + 1}`, x + 14, CHIP.y + CHIP.h / 2 + 5.5, { size: 15, weight: 700, color: rgbStr(col, 0.95), font: "mono", alpha });
    text(ctx, STEPS5[k].chip, x + CHIP.w / 2 + 8, CHIP.y + CHIP.h / 2 + 5.5, { size: 15, weight: 600, color: C.text, align: "center", font: "cjk", alpha });
  }
}

// ---------------------------------------------------------------------------------- the run
/** Snapshot index shown at time t. */
function kAt(t: number): number {
  const u = seg(t, T.trainFrom, T.trainTo, ease.linear);
  return K9 * Math.pow(u, 0.55);
}

const CHART = CHART9;
const inner = CHART9_INNER;
const KN = Math.ceil(K9) + 1;
const LOG = R.trainLoss.slice(0, KN).map((v) => Math.log10(Math.max(v, 1e-6)));
const LMIN = Math.min(...LOG);
const LMAX = Math.max(...LOG);

function drawRunChrome(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha < 0.005) return;
  const k = kAt(t);
  const step = Math.round(stepAt(k));
  const loss = sampleAt(R.trainLoss, k);
  const acc = sampleAt(R.trainAcc, k);
  drawRunField(ctx, FIELD9, k, { alpha });
  text(ctx, "它现在的判断", FIELD9.x, FIELD9.y - 14, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha });
  // read-outs
  const Y = 152;
  const col = (x: number, label: string, v: string, color: string = C.text) => {
    text(ctx, label, x, Y - 26, { size: 15, weight: 500, color: C.dim, font: "cjk", alpha });
    text(ctx, v, x, Y + 10, { size: 34, weight: 700, color, font: "mono", alpha });
  };
  col(inner.x0 - 30, "训练步数", String(step));
  col(inner.x0 + 150, "损失 L", fmt(loss, loss < 0.1 ? 3 : 2), loss > 0.3 ? C.neg : C.text);
  col(inner.x0 + 320, "训练集正确率", `${Math.round(acc * 100)}%`, acc < 0.9 ? C.neg : C.pos);
  // chart labels (the chart itself is remocn's animated-line-chart, drawn in the DOM)
  const Yof = (v: number) => inner.y0 + ((LMAX - Math.log10(v)) / (LMAX - LMIN || 1)) * (inner.y1 - inner.y0);
  for (const v of [0.5, 0.2, 0.05, 0.02]) {
    if (Math.log10(v) < LMIN - 0.05 || Math.log10(v) > LMAX + 0.05) continue;
    text(ctx, String(v), inner.x0 - 10, Yof(v) + 4.5, { size: 12.5, color: C.faint, align: "right", font: "mono", alpha });
  }
  for (const s of [1, 10, 100, 1000]) {
    if (indexOfStep(s) > K9 + 0.01) continue;
    const X = inner.x0 + (indexOfStep(s) / (KN - 1)) * (inner.x1 - inner.x0);
    text(ctx, String(s), X, inner.y1 + 20, { size: 12.5, color: C.faint, align: "center", font: "mono", alpha });
  }
  text(ctx, "损失（对数）", inner.x0, inner.y0 - 16, { size: 15, weight: 500, color: C.dim, font: "cjk", alpha });
  text(ctx, "训练步数", inner.x1, inner.y1 + 44, { size: 15, weight: 500, color: C.dim, align: "right", font: "cjk", alpha });
}

// ---------------------------------------------------------------------------------- scene
function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  if (t < 0 || t >= DUR + 0.001) return;

  // Act A: the five steps
  if (t < T.compact[1] + 0.2) drawCards(ctx, t);

  // Act B/C: the run
  const stage = seg(t, T.stage[0], T.stage[1], ease.out);
  const dim = 1 - 0.72 * seg(t, T.code - 0.4, T.code + 0.6, ease.inOutSine) * (1 - seg(t, T.codeOut, T.codeOut + 1.0, ease.inOutSine));
  if (stage > 0.003) {
    drawRunChrome(ctx, t, stage * dim);
    const codeStep = codeLine(t) - 2;
    drawStrip(ctx, t, seg(t, T.compact[1] - 0.3, T.compact[1] + 0.3, ease.out) * dim * (1 - seg(t, DUR - 1.2, DUR - 0.4, ease.inOutSine)), t >= T.code + 1.2 && codeStep >= 0 && codeStep < 5 ? codeStep : -1);
  }
}

/** Active line of the code block at time t (−1 = none). */
function codeLine(t: number): number {
  const s = t - T.code;
  if (s < 2.0 || s > 8.2) return -1;
  return 2 + Math.min(4, Math.floor((s - 2.0) / 1.15));
}

// ---------------------------------------------------------------------------------- DOM overlays
const CODE = `model = Net([2, 16, 16, 1])        # 参数先随机初始化
for step in range(5000):           # 重复几千次
    x, y = next_batch()            # 1 取一批数据
    p = model(x)                   # 2 前向传播
    loss = cross_entropy(p, y)     # 3 计算损失
    grads = backward(loss)         # 4 反向传播
    model.params -= lr * grads     # 5 更新参数`;

const Overlay: React.FC = () => {
  const { t } = useChapterClock();

  // the rule glides into card ⑤
  const g = seg(t, T.glide[0], T.glide[1], ease.inOut);
  const ruleA = 1 - seg(t, T.compact[0] - 0.2, T.compact[0] + 0.5, ease.inOutSine);
  const tx = 1088 - 640;
  const ty = 344 - 366;
  const sc = lerp(1, 0.33, g);
  const showRule = ruleA > 0.01;

  const chartA = (t >= DUR ? 0 : 1) * seg(t, T.stage[0] + 0.2, T.stage[1] + 0.6, ease.out) * (1 - 0.72 * seg(t, T.code - 0.4, T.code + 0.6, ease.inOutSine) * (1 - seg(t, T.codeOut, T.codeOut + 1.0, ease.inOutSine)));
  const k = kAt(t);
  const prog = clamp(k / (KN - 1));

  const codeA = seg(t, T.code, T.code + 0.8, ease.out) * (1 - seg(t, T.codeOut, T.codeOut + 1.0, ease.inOutSine));

  return (
    <>
      {showRule && (
        <div style={{ position: "absolute", inset: 0, transformOrigin: "640px 366px", transform: `translate(${tx * g}px, ${ty * g}px) scale(${sc})`, opacity: ruleA }}>
          <UpdateRule />
        </div>
      )}
      {chartA > 0.01 && (
        <div style={{ position: "absolute", left: CHART.x, top: CHART.y, width: CHART.w, height: CHART.h, opacity: chartA }}>
          <AnimatedLineChart
            data={LOG}
            width={CHART.svgW}
            height={CHART.svgH}
            strokeColor={C.neg}
            strokeWidth={3}
            gridColor="rgba(255,255,255,0.09)"
            progress={prog}
            gridCols={4}
          />
        </div>
      )}
      {codeA > 0.01 && (
        <div style={{ position: "absolute", inset: 0, opacity: codeA }}>
          <Sequence from={Math.round((T.code + CH.lead / FPS) * FPS)} layout="none">
            <GlassCodeBlock code={CODE} title="train.py" width={840} height={330} fontSize={19} staggerFrames={5} showTrafficLights={false} activeLine={codeLine(t)} glassColor="rgba(10,12,16,0.86)" />
          </Sequence>
        </div>
      )}
    </>
  );
};

export const Ch09Training: React.FC = () => (
  <>
    <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} />
    <Overlay />
    <ChapterCard />
    <Captions />
  </>
);

void RGB_NEG;
