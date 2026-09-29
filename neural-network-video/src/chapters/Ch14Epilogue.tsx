import { Sequence } from "remotion";
import { SoftBlurIn } from "../components/remocn/soft-blur-in";
import { Canvas } from "../lib/canvas";
import { grey, rgba } from "../lib/color";
import { circle, heatmap, line, pulse, rrect, text } from "../lib/draw";
import { clamp, ease, fmt, hash01, lerp, seg } from "../lib/math";
import { chapterClock, useChapterClock } from "../lib/time";
import { C, FPS, RGB, RGB_NEG, RGB_POS } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { Formula } from "../ui/Formula";
import { sigmoid } from "../visuals/activations";
import { HERO, drawHeroOutput, drawInputNode, drawNeuron, heroInputValues } from "../visuals/carry";
import { heroImage } from "../visuals/data";

/**
 * 14 · 尾声 — the neuron chapter 13 dived into, exactly as chapter 2 met it: three inputs, three weights, one sum.
 * Then it is copied — a lattice of the same little unit, wave after wave of signal — and what such lattices have
 * learned to do: look, listen, speak. Title card, fade to black. Carry in: the neuron. No carry out.
 */
const CH = chapterById("epilogue");
const DUR = CH.dur / FPS;
const X = heroInputValues;
const W0 = [1.2, -0.8, 0.6];
const B0 = -0.5;
const Z = W0.reduce((s, w, i) => s + w * X[i], B0);
const A_OUT = sigmoid(Z);
const signRGB = (v: number): RGB => (v >= 0 ? RGB_POS : RGB_NEG);
const NEURON_LEFT = { x: HERO.neuron.x - HERO.neuron.r - 2, y: HERO.neuron.y };
const nodeRight = (k: number) => ({ x: HERO.inputs[k].x + HERO.inputSize / 2 + 2, y: HERO.inputs[k].y });

const T = {
  inputs: [0.5, 1.5] as const,
  pulses: [2.0, 6.4] as const,
  shrink: [6.6, 8.6] as const,
  fabric: [7.4, 10.4] as const,
  cards: [9.6, 10.4, 11.2],
  cardsOut: [13.0, 13.8] as const,
  title: 13.6,
  black: [16.2, 16.95] as const,
};

// ---------------------------------------------------------------------------------- the lattice
const COLS = [5, 8, 10, 11, 10, 8, 5];
const LX = (c: number) => 132 + c * 169.3;
const LY = (c: number, i: number) => 338 + (i - (COLS[c] - 1) / 2) * 42;
/** The slot the original neuron slides into: middle of the lattice. */
const SLOT = { c: 3, i: 5 };

function drawLattice(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha < 0.004) return;
  const reveal = (c: number) => seg(t, T.fabric[0] + c * 0.32, T.fabric[0] + c * 0.32 + 0.9, ease.out);
  ctx.save();
  ctx.globalAlpha *= alpha;
  // wires
  for (let c = 0; c < COLS.length - 1; c++) {
    const a = reveal(c + 1);
    if (a < 0.01) continue;
    for (let i = 0; i < COLS[c]; i++) {
      for (let j = 0; j < COLS[c + 1]; j++) {
        const h = hash01(c * 1000 + i * 31 + j, 3);
        const col: RGB = h < 0.5 ? RGB_POS : RGB_NEG;
        line(ctx, LX(c) + 11, LY(c, i), LX(c + 1) - 11, LY(c + 1, j), { color: rgba(col, 1), lw: 0.7, alpha: a * (0.04 + 0.1 * hash01(c * 1000 + i * 31 + j, 9)) });
      }
    }
  }
  // waves of signal, left to right, again and again
  const speed = 0.42;
  for (let w = 0; w < 3; w++) {
    const phase = (t * speed + w / 3) % 1;
    for (let c = 0; c < COLS.length - 1; c++) {
      const p = clamp(phase * (COLS.length - 1) - c);
      if (p <= 0 || p >= 1) continue;
      const a = reveal(c + 1);
      if (a < 0.05) continue;
      for (let i = 0; i < COLS[c]; i++) {
        for (let j = 0; j < COLS[c + 1]; j++) {
          if (hash01(c * 1000 + i * 31 + j, 5 + w) > 0.16) continue;
          pulse(ctx, LX(c) + 11, LY(c, i), LX(c + 1) - 11, LY(c + 1, j), p, hash01(c * 1000 + i * 31 + j, 3) < 0.5 ? RGB_POS : RGB_NEG, 2, a * 0.8);
        }
      }
    }
  }
  // neurons
  for (let c = 0; c < COLS.length; c++) {
    const a = reveal(c);
    if (a < 0.01) continue;
    for (let i = 0; i < COLS[c]; i++) {
      if (c === SLOT.c && i === SLOT.i) continue; // the one we brought
      const lit = 0.5 + 0.5 * Math.sin(t * 2.4 - c * 0.9 + hash01(c * 40 + i, 11) * 6.28);
      circle(ctx, LX(c), LY(c, i), 9, { fill: "#0c1118", stroke: `rgba(255,255,255,${0.32 + 0.3 * lit})`, lw: 1.5, alpha: a });
      if (lit > 0.62) circle(ctx, LX(c), LY(c, i), 6.4, { fill: rgba(RGB_POS, 0.22 + 0.5 * (lit - 0.62) * 2.5), alpha: a });
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------- the three abilities
const CARD = { w: 236, h: 236, y: 190 };
const cardX = (k: number) => 640 + (k - 1) * 296 - CARD.w / 2;
const IMG = heroImage();

function drawCards(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  const words = ["看", "听", "说"];
  const subs = ["图像", "声音", "文字"];
  for (let k = 0; k < 3; k++) {
    const a = seg(t, T.cards[k], T.cards[k] + 0.9, ease.soft) * alpha;
    if (a < 0.004) continue;
    const x = cardX(k);
    const y = CARD.y + (1 - a) * 16;
    rrect(ctx, x, y, CARD.w, CARD.h, 18, { fill: "rgba(10,13,18,0.92)", stroke: "rgba(255,255,255,0.16)", lw: 1.2, alpha: a });
    const cx = x + CARD.w / 2;
    const cy = y + 88;
    ctx.save();
    ctx.globalAlpha *= a;
    if (k === 0) {
      // 看: the '7' with a window scanning it
      heatmap(ctx, IMG, 28, 28, cx - 58, cy - 58, 116, 116, grey);
      const p = (t * 0.5) % 1;
      const wx = cx - 58 + (0.12 + 0.6 * p) * 116;
      const wy = cy - 58 + (0.1 + 0.42 * ((p * 3) % 1)) * 116;
      rrect(ctx, wx, wy, 21, 21, 3, { stroke: C.pos, lw: 2 });
    } else if (k === 1) {
      // 听: a waveform
      for (let i = 0; i < 34; i++) {
        const u = i / 33;
        const env = Math.sin(u * Math.PI);
        const amp = env * (0.35 + 0.65 * Math.abs(Math.sin(u * 11 + t * 3.2) * Math.cos(u * 4.3 - t * 1.7))) * 50;
        rrect(ctx, cx - 66 + i * 4, cy - amp, 2.6, amp * 2, 1.3, { fill: i % 3 === 0 ? C.neg : C.pos });
      }
    } else {
      // 说: tokens, one after another
      const toks = ["你", "好", "，", "我", "是", "…"];
      const shown = Math.floor(((t - T.cards[2]) * 1.6) % (toks.length + 2));
      for (let i = 0; i < toks.length; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const on = i < shown;
        rrect(ctx, cx - 74 + col * 50, cy - 40 + row * 50, 42, 42, 9, { fill: "#0e1218", stroke: on ? rgba(RGB_POS, 0.8) : "rgba(255,255,255,0.14)", lw: 1.4 });
        if (on) text(ctx, toks[i], cx - 74 + col * 50 + 21, cy - 40 + row * 50 + 29, { size: 24, weight: 600, color: C.text, align: "center", font: "cjk" });
      }
    }
    ctx.restore();
    text(ctx, words[k], cx, y + CARD.h - 46, { size: 46, weight: 700, color: C.text, align: "center", font: "cjk", alpha: a });
    text(ctx, subs[k], cx, y + CARD.h - 20, { size: 16, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: a });
  }
}

// ---------------------------------------------------------------------------------- scene
function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  if (t < 0 || t >= DUR + 0.001) return;

  const shrink = ease.inOut(seg(t, T.shrink[0], T.shrink[1], ease.linear));
  const inputsA = seg(t, T.inputs[0], T.inputs[1], ease.out) * (1 - seg(shrink, 0, 0.45, ease.out));

  // ---- the first neuron: inputs, weights, sum
  if (inputsA > 0.004) {
    for (let k = 0; k < 3; k++) {
      const a = nodeRight(k);
      const w = W0[k];
      line(ctx, a.x, a.y, NEURON_LEFT.x, NEURON_LEFT.y, { color: rgba(signRGB(w), 1), lw: 1.4 + Math.abs(w) * 3, alpha: inputsA * 0.9 });
      const mx = lerp(a.x, NEURON_LEFT.x, 0.46);
      const my = lerp(a.y, NEURON_LEFT.y, 0.46);
      text(ctx, fmt(w, 1), mx, my + [-12, -14, 22][k], { size: 17, weight: 700, color: w >= 0 ? C.pos : C.neg, align: "center", font: "mono", alpha: inputsA });
      drawInputNode(ctx, HERO.inputs[k].x, HERO.inputs[k].y, X[k], HERO.inputSize, inputsA);
      // votes flowing in
      const pa = seg(t, T.pulses[0], T.pulses[0] + 0.6, ease.out) * (1 - seg(t, T.pulses[1] - 0.5, T.pulses[1], ease.in)) * inputsA;
      if (pa > 0.01) {
        for (let j = 0; j < 3; j++) {
          const p = (t * 0.4 + j / 3 + hash01(k, 5) * 0.2) % 1;
          pulse(ctx, a.x, a.y, NEURON_LEFT.x, NEURON_LEFT.y, p, RGB_POS, 2.4, pa * (0.35 + 0.65 * X[k]));
        }
      }
    }
    drawHeroOutput(ctx, inputsA);
    const oa = seg(t, T.pulses[0] + 1.6, T.pulses[0] + 2.6, ease.out) * inputsA;
    text(ctx, fmt(A_OUT, 2), HERO.outX + 16, HERO.neuron.y + 8, { size: 28, weight: 700, color: C.pos, font: "mono", alpha: oa });
  }

  // ---- the neuron itself: the very pose chapter 13 dived into; later it becomes one unit of the lattice
  const act = seg(t, T.pulses[0] + 1.0, T.pulses[0] + 2.4, ease.out) * A_OUT * (1 - seg(shrink, 0, 0.6, ease.out));
  const nx = lerp(HERO.neuron.x, LX(SLOT.c), shrink);
  const ny = lerp(HERO.neuron.y, LY(SLOT.c, SLOT.i), shrink);
  const nr = lerp(HERO.neuron.r, 9, shrink);
  drawNeuron(ctx, nx, ny, nr, { act, glyph: shrink < 0.55, alpha: 1 - seg(t, T.cardsOut[0], T.cardsOut[1], ease.inOutSine) });

  // ---- the lattice, then the three things it learned to do
  const latA = 1 - 0.55 * seg(t, T.cards[0] - 0.2, T.cards[0] + 0.8, ease.inOut);
  const fabricOut = 1 - seg(t, T.cardsOut[0], T.cardsOut[1], ease.inOutSine);
  drawLattice(ctx, t, latA * fabricOut);
  drawCards(ctx, t, 1 - seg(t, T.cardsOut[0], T.cardsOut[1], ease.inOutSine));
}

const Overlay: React.FC = () => {
  const { t } = useChapterClock();
  const fa = seg(t, 2.6, 3.6, ease.out) * (1 - seg(t, T.shrink[0], T.shrink[0] + 0.7, ease.inOutSine));
  const titleIn = seg(t, T.title + 1.6, T.title + 2.6, ease.out);
  const black = seg(t, T.black[0], T.black[1], ease.inOutSine);
  return (
    <>
      {fa > 0.01 && (
        <div style={{ position: "absolute", left: 0, width: 1280, top: 452, display: "flex", justifyContent: "center", opacity: fa, transform: "translateX(70px)" }}>
          <Formula tex={String.raw`a=f\Big(\sum_i w_i x_i + b\Big)`} size={34} color={C.dim} />
        </div>
      )}
      <Sequence from={Math.round((T.title + CH.lead / FPS) * FPS)} durationInFrames={Math.round((DUR - T.title) * FPS) + 60} layout="none">
        <div style={{ position: "absolute", left: 0, top: 236, width: 1280, height: 130 }}>
          <SoftBlurIn text="神经网络" fontSize={104} fontWeight={700} color={C.text} tracking="0.06em" blur={16} />
        </div>
      </Sequence>
      <div style={{ position: "absolute", left: 0, top: 388, width: 1280, textAlign: "center", fontSize: 28, fontWeight: 400, color: C.dim, opacity: titleIn, translate: `0 ${(1 - titleIn) * 8}px` }}>
        一个神经元，重复亿万次。
      </div>
      {black > 0.001 && <div style={{ position: "absolute", inset: 0, background: "#000", opacity: black }} />}
    </>
  );
};

export const Ch14Epilogue: React.FC = () => (
  <>
    <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} />
    <Overlay />
    <ChapterCard />
    <Captions />
  </>
);
