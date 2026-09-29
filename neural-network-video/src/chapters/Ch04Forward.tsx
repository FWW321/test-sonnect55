import { Sequence } from "remotion";
import { RollingNumber } from "../components/remocn/rolling-number";
import { Canvas } from "../lib/canvas";
import { diverging, grey, rgba } from "../lib/color";
import { circle, heatmap, line, rrect, text } from "../lib/draw";
import { clamp, ease, fmt, lerp, seg } from "../lib/math";
import { chapterClock, useChapterClock } from "../lib/time";
import { C, FPS, RGB_NEG, RGB_POS } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { Formula } from "../ui/Formula";
import { H1, LEGEND, drawClassDot, drawSmallNeuron } from "../visuals/carry";
import { digitNet, forwardDigit, heroImage, showcaseImage } from "../visuals/data";
import {
  FWD_DONE,
  FWD_IDLE,
  FwdEnv,
  H_YS,
  OUT_YS,
  R_H,
  R_OUT,
  X_H1,
  X_OUT,
  drawDigitNet,
  fwdEnv,
} from "../visuals/digitNetView";

/**
 * 04 · 前向传播 — the 16 neurons from chapter 3 become the first hidden layer of a real digit
 * network (784-16-16-10, 13 002 parameters, trained by scripts/train-digits.ts). Everything drawn
 * here — edge colours, glowing paths, activations, the 16 weight images, the logits and the
 * softmax — is read from that trained network, not invented.
 * Carry out: the output neurons for "7" and "1" become the two class markers of chapter 5.
 */
const CH = chapterById("forward");
const DUR = CH.dur / FPS;
const hero = heroImage();
const ODO_FRAMES = CH.lead + CH.dur + CH.tail - Math.round((17.0 + CH.lead / FPS) * FPS);

const T = {
  image: [2.0, 3.6],
  edgesIn: [2.6, 4.8],
  h2: [8.0, 9.6],
  e12: [8.8, 11.4],
  out: [15.6, 17.2],
  e23: [16.2, 18.4],
  number: 17.0,
  pass: 25.4,
  weights: [33.0, 34.4],
  weightsOut: [43.0, 44.2],
  softmax: [44.2, 52.0],
  cycle: 52.4,
  exit: [57.2, 58.8],
  move: [57.6, 59.9],
} as const;

// digits shown during the montage; the last one is the hero '7' so the carry matches
const CYCLE = [4, 9, 2, 6, 7];
const CYC_DT = 1.04;

// the weight images
const MOS = { x: 704, y: 128, s: 92, gap: 16 };
const HL = [2, 7, 11, 5];

function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  if (t < 0 || t >= DUR + 0.001) return;

  const net = digitNet();
  const exit = 1 - seg(t, T.exit[0], T.exit[1], ease.inOutSine);

  // ------------------------------------------------ which image is on the input
  let img: Float32Array = hero;
  let key = "hero";
  let cycling = false;
  let cycT = 0;
  if (t >= T.cycle && t < T.cycle + CYCLE.length * CYC_DT) {
    const k = Math.floor((t - T.cycle) / CYC_DT);
    cycling = true;
    cycT = (t - T.cycle) - k * CYC_DT;
    if (CYCLE[k] === 7) {
      img = hero;
      key = "hero";
    } else {
      img = showcaseImage(CYCLE[k]);
      key = `show-${CYCLE[k]}`;
    }
  } else if (t >= T.cycle + CYCLE.length * CYC_DT) {
    img = hero;
    key = "hero";
  }

  // ------------------------------------------------ forward-pass envelopes
  let fwd: FwdEnv = FWD_IDLE;
  if (t >= T.pass) {
    fwd = fwdEnv(t, T.pass);
    const decay = 1 - seg(t, 31.4, 32.9, ease.inOutSine);
    if (t > T.pass + 4.2) fwd = { e0: 1, lit1: decay, e1: 1, lit2: decay, e2: 1, litO: decay };
    // softmax beat + montage: the output stays lit
    if (t >= T.softmax[0] - 0.6) fwd = { ...FWD_DONE, lit1: 1, lit2: 1, litO: 1 };
    if (t < T.softmax[0] - 0.6 && t > 32.9) fwd = FWD_IDLE;
  }
  if (cycling) {
    const ramp = ease.out(clamp(cycT / 0.4));
    const l = 0.25 + 0.75 * ramp;
    fwd = { e0: 1, lit1: l, e1: 1, lit2: l, e2: 1, litO: l };
  }

  // ------------------------------------------------ focus shots
  const wFocus = seg(t, T.weights[0], T.weights[1], ease.inOutSine) * (1 - seg(t, T.weightsOut[0], T.weightsOut[1], ease.inOutSine));
  const sFocus = seg(t, T.softmax[0], T.softmax[0] + 1.2, ease.inOutSine) * (1 - seg(t, 51.2, 52.4, ease.inOutSine));
  const dimH2 = 1 - 0.86 * wFocus - 0.62 * sFocus;

  // ------------------------------------------------ the diagram
  ctx.save();
  ctx.globalAlpha = exit;
  const f = drawDigitNet(ctx, {
    img,
    key,
    t,
    image: seg(t, T.image[0], T.image[1], ease.out),
    h1: 1, // carried in from chapter 3: fully present from t = 0
    h2: seg(t, T.h2[0], T.h2[1], ease.out),
    out: seg(t, T.out[0], T.out[1], ease.out),
    edgesIn: seg(t, T.edgesIn[0], T.edgesIn[1], ease.inOutSine),
    edges12: seg(t, T.e12[0], T.e12[1], ease.inOutSine),
    edges23: seg(t, T.e23[0], T.e23[1], ease.inOutSine),
    fwd,
    dimH2,
    labels: seg(t, 3.4, 4.6, ease.out),
    pulses: !cycling,
  });
  ctx.restore();

  // ------------------------------------------------ weight images (one per first-layer neuron)
  if (wFocus > 0.005) {
    rrect(ctx, 650, 78, 592, 534, 18, { fill: "rgba(7,9,13,0.97)", stroke: "rgba(255,255,255,0.09)", lw: 1, alpha: wFocus });
    text(ctx, "隐藏层 1 · 16 个神经元的权重", MOS.x, 122, { size: 17, weight: 600, color: C.text, font: "cjk", alpha: wFocus });
    const L0 = net.layers[0];
    const hi = Math.min(HL.length - 1, Math.max(0, Math.floor((t - 35.6) / 1.9)));
    const hiOn = seg(t, 35.4, 36.0, ease.out) * (1 - seg(t, 42.2, 42.9, ease.in));
    for (let j = 0; j < 16; j++) {
      const col = j % 4;
      const row = Math.floor(j / 4);
      const x = MOS.x + col * (MOS.s + MOS.gap);
      const y = MOS.y + 22 + row * (MOS.s + MOS.gap);
      const w = L0.W.subarray(j * 784, (j + 1) * 784);
      let vm = 0;
      for (const v of w) vm = Math.max(vm, Math.abs(v));
      vm = Math.max(vm, 1e-6); // an all-zero (dead) neuron draws as a flat tile, never NaN
      const a = wFocus * seg(t, T.weights[0] + 0.5 + j * 0.06, T.weights[0] + 1.3 + j * 0.06, ease.out);
      ctx.save();
      ctx.globalAlpha *= a;
      heatmap(ctx, w, 28, 28, x, y, MOS.s, MOS.s, (v) => diverging(v / vm), { smooth: true });
      rrect(ctx, x - 0.5, y - 0.5, MOS.s + 1, MOS.s + 1, 2, { stroke: "rgba(255,255,255,0.14)", lw: 1 });
      ctx.restore();
      if (hiOn > 0.01 && HL[hi] === j) {
        rrect(ctx, x - 4, y - 4, MOS.s + 8, MOS.s + 8, 6, { stroke: C.pos, lw: 2.2, alpha: hiOn * wFocus });
        // wire from the neuron to its picture
        line(ctx, X_H1 + R_H + 3, H_YS[j], x - 6, y + MOS.s / 2, { color: rgba(RGB_POS, 0.5), lw: 1.4, dash: [4, 5], alpha: hiOn * wFocus });
        drawSmallNeuron(ctx, X_H1, H_YS[j], R_H + 2, 0.95, hiOn * wFocus);
      }
    }
    // legend
    const lg = wFocus * seg(t, 36.0, 37.0, ease.out);
    circle(ctx, MOS.x + 6, 572, 5, { fill: C.pos, alpha: lg });
    text(ctx, "正权重：这里越亮，神经元越兴奋", MOS.x + 18, 577, { size: 15, weight: 500, color: C.dim, font: "cjk", alpha: lg });
    circle(ctx, MOS.x + 310, 572, 5, { fill: C.neg, alpha: lg });
    text(ctx, "负权重：这里越亮，越被压制", MOS.x + 322, 577, { size: 15, weight: 500, color: C.dim, font: "cjk", alpha: lg });
  }

  // ------------------------------------------------ logits → softmax bars
  if (sFocus > 0.005) {
    const morph = seg(t, 47.6, 49.4, ease.inOut);
    // raw scores z
    const z = f.z[2];
    let zm = 0;
    for (const v of z) zm = Math.max(zm, Math.abs(v));
    const zAlpha = sFocus * (1 - morph);
    const base = 1108;
    line(ctx, base, OUT_YS[0] - 22, base, OUT_YS[9] + 22, { color: "rgba(255,255,255,0.3)", lw: 1, alpha: zAlpha });
    text(ctx, "原始得分 z", base, OUT_YS[0] - 34, { size: 16, weight: 600, color: C.dim, align: "center", font: "cjk", alpha: zAlpha });
    for (let d = 0; d < 10; d++) {
      const len = (z[d] / zm) * 92;
      const col = z[d] >= 0 ? C.pos : C.neg;
      const r = seg(t, 44.8 + d * 0.06, 45.6 + d * 0.06, ease.out);
      const x0 = Math.min(base, base + len * r);
      rrect(ctx, x0, OUT_YS[d] - 5, Math.abs(len * r), 10, 3, { fill: col, alpha: zAlpha * 0.9 });
      text(ctx, (z[d] >= 0 ? "" : "−") + fmt(Math.abs(z[d]), 1), z[d] >= 0 ? base + len * r + 8 : base + len * r - 8, OUT_YS[d] + 5, {
        size: 13.5,
        weight: 500,
        color: C.dim,
        align: z[d] >= 0 ? "left" : "right",
        font: "mono",
        alpha: zAlpha * r,
      });
    }
    // probabilities
    const pAlpha = sFocus * morph;
    const pb = 1010;
    text(ctx, "概率（加起来等于 1）", pb, OUT_YS[0] - 34, { size: 16, weight: 600, color: C.dim, font: "cjk", alpha: pAlpha });
    for (let d = 0; d < 10; d++) {
      const p = f.probs[d];
      const len = Math.max(2, p * 190) * ease.out(clamp((morph - 0.1 * (d % 3)) / 0.9));
      rrect(ctx, pb, OUT_YS[d] - 5, len, 10, 3, { fill: f.pred === d ? C.pos : "rgba(154,164,181,0.55)", alpha: pAlpha });
      const pct = p >= 0.9995 ? "100%" : p < 0.0005 ? "0%" : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
      text(ctx, pct, pb + len + 8, OUT_YS[d] + 5, { size: 13.5, weight: f.pred === d ? 700 : 500, color: f.pred === d ? C.pos : C.dim, font: "mono", alpha: pAlpha });
    }
  }

  // ------------------------------------------------ hand-off: two output neurons → class markers
  const mv = ease.soft(seg(t, T.move[0], T.move[1], ease.linear));
  if (t >= T.move[0] - 0.05) {
    const ys = [OUT_YS[7], OUT_YS[1]];
    const to = [LEGEND.B, LEGEND.A];
    for (let k = 0; k < 2; k++) {
      const x = lerp(X_OUT, to[k].x, mv);
      const y = lerp(ys[k], to[k].y, mv);
      const r = lerp(R_OUT, LEGEND.r, mv);
      if (k === 0) drawClassDot(ctx, x, y, r, "B", 1);
      else drawClassDot(ctx, x, y, r, "A", mv);
    }
  }
  void RGB_NEG;
}

const Overlay: React.FC = () => {
  const c = useChapterClock();
  const t = c.t;
  const exit = 1 - seg(t, T.exit[0], T.exit[1], ease.inOutSine);
  const sf = seg(t, T.softmax[0] + 3.2, T.softmax[0] + 4.4, ease.out) * (1 - seg(t, 51.2, 52.2, ease.inOutSine));
  const num = seg(t, T.number + 0.2, T.number + 1.4, ease.out) * exit;
  return (
    <>
      {t >= T.number && t < DUR && (
        // The odometer keeps its final value on screen for the rest of the chapter, so the Sequence runs to the end
        // and `speed` is chosen so that the counting itself takes ~3.5 s (RollingNumber counts over 80 % of the Sequence).
        <Sequence from={Math.round((T.number + CH.lead / FPS) * FPS)} durationInFrames={ODO_FRAMES} layout="none">
          <div style={{ position: "absolute", left: 40, top: 56, width: 300, height: 84, opacity: num }}>
            <RollingNumber from={0} to={13002} fontSize={58} color={C.text} speed={(ODO_FRAMES * 0.8) / (3.5 * FPS)} />
          </div>
        </Sequence>
      )}
      {t >= T.number && (
        <div style={{ position: "absolute", left: 342, top: 88, fontSize: 24, fontWeight: 500, color: C.dim, opacity: num * seg(t, T.number + 1.8, T.number + 2.8, ease.out) }}>
          个参数
        </div>
      )}
      {sf > 0.01 && (
        <div style={{ position: "absolute", left: 930, top: 520, opacity: sf }}>
          <Formula tex={String.raw`\mathrm{softmax}(z)_i=\dfrac{e^{z_i}}{\sum_j e^{z_j}}`} size={25} />
        </div>
      )}
    </>
  );
};

export const Ch04Forward: React.FC = () => (
  <>
    <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} />
    <Overlay />
    <ChapterCard />
    <Captions />
  </>
);

void grey;
void forwardDigit;
