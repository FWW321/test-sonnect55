import { Canvas } from "../lib/canvas";
import { mixRGB, rgba } from "../lib/color";
import { circle, line, pulse, rrect, text } from "../lib/draw";
import { clamp, ease, fmt, hash01, lerp, seg } from "../lib/math";
import { chapterClock, useChapterClock } from "../lib/time";
import { C, RGB_NEG, RGB_POS, RGB_WHITE } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { Formula } from "../ui/Formula";
import { sigmoid } from "../visuals/activations";
import {
  HERO,
  PLOT_MINI,
  drawCarriedActivationPlot,
  drawHeroOutput,
  drawInputNode,
  drawNeuron,
  heroInputValues,
} from "../visuals/carry";

/**
 * 02 · 神经元 — the three pixels from chapter 1 vote. Weights say who counts and in which
 * direction, the weighted votes are summed, a bias sets the threshold, the activation squashes the
 * result. Finally w₁ is turned like a knob: the whole neuron is four numbers.
 * Carry out: the small activation plot grows into chapter 3's full-screen plot.
 */
const CH = chapterById("neuron");
const X = heroInputValues;
const W0 = [1.2, -0.8, 0.6];
const B0 = -0.5;

const calc = (w: number[], b = B0) => {
  const p = w.map((wi, i) => wi * X[i]);
  const z = p[0] + p[1] + p[2] + b;
  return { p, z, a: sigmoid(z) };
};

const T = {
  votes: [1.8, 6.6],
  labels: 7.2,
  weights: 13.6,
  products: 23.2,
  bias: 29.0,
  zDone: 32.2,
  plot: 34.0,
  a: 37.4,
  knob: 44.0,
  exit: [50.9, 52.9],
} as const;
const W1_KEYS: [number, number][] = [
  [44.6, 1.2],
  [46.2, -2.0],
  [48.6, 2.2],
  [50.6, 1.2],
];
function w1At(t: number) {
  if (t <= W1_KEYS[0][0]) return W1_KEYS[0][1];
  for (let i = 1; i < W1_KEYS.length; i++) {
    const [t0, v0] = W1_KEYS[i - 1];
    const [t1, v1] = W1_KEYS[i];
    if (t <= t1) return lerp(v0, v1, ease.inOutSine(clamp((t - t0) / (t1 - t0))));
  }
  return W1_KEYS[W1_KEYS.length - 1][1];
}

const signColor = (v: number) => (v >= 0 ? C.pos : C.neg);
const signRGB = (v: number) => (v >= 0 ? RGB_POS : RGB_NEG);

const NEURON_LEFT = { x: HERO.neuron.x - HERO.neuron.r - 2, y: HERO.neuron.y };
const nodeRight = (k: number) => ({ x: HERO.inputs[k].x + HERO.inputSize / 2 + 2, y: HERO.inputs[k].y });

/** Rounded label chip. */
function pill(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, color: string, alpha = 1, size = 17) {
  if (alpha <= 0.003) return;
  ctx.font = `600 ${size}px "JetBrains Mono", "Noto Sans SC", monospace`;
  const w = ctx.measureText(label).width + 18;
  const h = size + 12;
  rrect(ctx, x - w / 2, y - h / 2, w, h, 7, { fill: "rgba(9,12,18,0.92)", stroke: "rgba(255,255,255,0.14)", lw: 1, alpha });
  text(ctx, label, x, y + size * 0.34, { size, weight: 600, color, align: "center", font: "mono", alpha });
}

/** x with a subscript, drawn by hand (Inter's latin subset has no ₁₂₃). */
function sub(ctx: CanvasRenderingContext2D, base: string, s: string, x: number, y: number, size: number, color: string, alpha = 1) {
  ctx.font = `italic 500 ${size}px Inter, "Noto Sans SC", sans-serif`;
  const w = ctx.measureText(base).width;
  text(ctx, base, x - (w + size * 0.34) / 2, y, { size, color, italic: true, font: "sans", alpha, weight: 500 });
  text(ctx, s, x - (w + size * 0.34) / 2 + w + 1, y + size * 0.26, { size: size * 0.62, color, font: "sans", alpha, weight: 500 });
}

function knob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, v: number, lim: number, color: string, alpha: number) {
  const ang = ((clamp(v / lim, -1, 1) * 135 - 90) * Math.PI) / 180;
  circle(ctx, x, y, r, { fill: "#0c1118", stroke: "rgba(255,255,255,0.32)", lw: 1.6, alpha });
  // travel arc
  ctx.beginPath();
  ctx.arc(x, y, r + 5, ((-135 - 90) * Math.PI) / 180, ((135 - 90) * Math.PI) / 180);
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = 2;
  ctx.globalAlpha *= alpha;
  ctx.stroke();
  ctx.globalAlpha /= alpha || 1;
  line(ctx, x, y, x + Math.cos(ang) * (r - 3), y + Math.sin(ang) * (r - 3), { color, lw: 3, cap: "round", alpha });
}

function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  // Ownership of carried objects: chapter 1 draws the hero neuron/inputs until its nominal end,
  // this chapter from t = 0 — and hands the activation plot to chapter 3 at t = dur.
  if (t < 0) return;
  const exit = 1 - seg(t, T.exit[0], T.exit[1], ease.inOut);

  // live parameters (w₁ is the knob)
  const w1 = w1At(t);
  const W = [w1, W0[1], W0[2]];
  const live = calc(W);
  const showA = seg(t, T.a, T.a + 1.2, ease.out);
  const act = showA * live.a;

  // ---------------------------------------------------------------- edges (carried, then weighted)
  ctx.save();
  ctx.globalAlpha = exit;
  for (let k = 0; k < 3; k++) {
    const rev = seg(t, T.weights + k * 1.5, T.weights + k * 1.5 + 1.0, ease.out);
    const w = W[k];
    const col = mixRGB([255, 255, 255], signRGB(w), rev);
    const alpha = lerp(0.3, 0.95, rev);
    const lw = lerp(1.5, 1.4 + Math.abs(w) * 3.0, rev);
    const a = nodeRight(k);
    line(ctx, a.x, a.y, NEURON_LEFT.x, NEURON_LEFT.y, { color: rgba(col, alpha), lw });

    // weight chip on the wire
    if (rev > 0.01) {
      const mx = lerp(a.x, NEURON_LEFT.x, 0.46);
      const my = lerp(a.y, NEURON_LEFT.y, 0.46);
      // chip on the wire; the support/oppose tag sits on the side away from the wire
      const chipDy = [-4, -30, 6][k];
      const tagDy = [-34, 28, 38][k];
      pill(ctx, mx, my + chipDy, `w${["₁", "₂", "₃"][k]} = ${fmt(w, 2)}`, signColor(w), rev);
      const tag = w >= 0 ? "支持" : "反对";
      text(ctx, tag, mx, my + tagDy, { size: 14, weight: 500, color: signColor(w), align: "center", font: "cjk", alpha: rev * 0.9 });
    }
  }

  // ---------------------------------------------------------------- votes flowing in (stage A)
  const vA = seg(t, T.votes[0], T.votes[0] + 0.6, ease.out) * (1 - seg(t, T.votes[1] - 0.6, T.votes[1], ease.in));
  if (vA > 0.01) {
    for (let k = 0; k < 3; k++) {
      const a = nodeRight(k);
      for (let j = 0; j < 3; j++) {
        const p = (t * 0.36 + j / 3 + hash01(k, 5) * 0.2) % 1;
        pulse(ctx, a.x, a.y, NEURON_LEFT.x, NEURON_LEFT.y, p, RGB_POS, 2.4, vA * (0.35 + 0.65 * X[k]));
      }
    }
  }

  // ---------------------------------------------------------------- input nodes + labels (carried)
  for (let k = 0; k < 3; k++) {
    const p = HERO.inputs[k];
    drawInputNode(ctx, p.x, p.y, X[k], HERO.inputSize, 1);
    const la = seg(t, T.labels + k * 0.35, T.labels + k * 0.35 + 0.8, ease.out);
    if (la > 0.01) {
      sub(ctx, "x", String(k + 1), p.x - 56, p.y + 6, 24, C.text, la);
      text(ctx, fmt(X[k], 2), p.x, p.y + 44, { size: 17, weight: 500, color: C.dim, align: "center", font: "mono", alpha: la });
    }
  }
  const inLabel = seg(t, T.labels, T.labels + 1.0, ease.out);
  const inLabelA = inLabel * (1 - seg(t, 19.6, 20.8, ease.inOutSine));
  if (inLabelA > 0.01) text(ctx, "输入", 330, 136, { size: 17, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: inLabelA });

  // ---------------------------------------------------------------- product tokens + running sum
  let total = 0;
  for (let k = 0; k < 3; k++) {
    const s = T.products + k * 2.1;
    const p = ease.inOut(seg(t, s, s + 1.7, ease.linear));
    const a = nodeRight(k);
    if (p > 0 && p < 1) {
      const x = lerp(a.x + 26, NEURON_LEFT.x - 34, p);
      const y = lerp(a.y, NEURON_LEFT.y, p);
      const v = live.p[k];
      pill(ctx, x, y + (k === 1 ? 0 : 0), (v >= 0 ? "+" : "−") + fmt(Math.abs(v), 2), signColor(v), 1);
    }
    if (p >= 1) total += live.p[k];
  }
  const biasArrive = ease.inOut(seg(t, T.bias + 0.7, T.bias + 2.1, ease.linear));
  if (biasArrive >= 1) total += B0;

  // bias knob-node below the neuron
  const bA = seg(t, T.bias, T.bias + 0.9, ease.out);
  if (bA > 0.01) {
    const bx = HERO.neuron.x;
    const by = 462;
    line(ctx, bx, by - 24, bx, HERO.neuron.y + HERO.neuron.r + 3, { color: rgba(RGB_NEG, 0.85 * bA), lw: 1.4 + Math.abs(B0) * 3, alpha: 1 });
    rrect(ctx, bx - 27, by - 23, 54, 46, 10, { fill: "#0c1118", stroke: rgba(RGB_NEG, 0.8), lw: 1.6, alpha: bA });
    text(ctx, "b", bx, by + 8, { size: 26, color: C.neg, align: "center", font: "sans", italic: true, alpha: bA });
    text(ctx, `偏置 = ${fmt(B0, 2)}`, bx + 46, by + 6, { size: 16, weight: 500, color: C.dim, align: "left", font: "cjk", alpha: bA });
    const bp = biasArrive;
    if (bp > 0 && bp < 1) {
      pill(ctx, bx, lerp(by - 34, HERO.neuron.y + HERO.neuron.r + 34, bp), "−" + fmt(Math.abs(B0), 2), C.neg, 1);
    }
  }

  // ---------------------------------------------------------------- neuron + z readout
  const flash = Math.max(
    ...[0, 1, 2].map((k) => {
      const d = t - (T.products + k * 2.1 + 1.7);
      return d > 0 && d < 0.6 ? 1 - d / 0.6 : 0;
    }),
    (() => {
      const d = t - (T.bias + 2.1);
      return d > 0 && d < 0.6 ? 1 - d / 0.6 : 0;
    })(),
  );
  drawNeuron(ctx, HERO.neuron.x, HERO.neuron.y, HERO.neuron.r, { act });
  if (flash > 0.01) circle(ctx, HERO.neuron.x, HERO.neuron.y, HERO.neuron.r + 5 + 10 * (1 - flash), { stroke: rgba(RGB_WHITE, 0.6 * flash), lw: 2 });

  const sumA = seg(t, T.products + 1.5, T.products + 2.2, ease.out);
  if (sumA > 0.01) {
    const done = t > T.zDone;
    const val = done ? live.z : total;
    const label = done ? "z" : "Σ";
    text(ctx, `${label} = ${val >= 0 ? "" : "−"}${fmt(Math.abs(val), 2)}`, HERO.neuron.x, HERO.neuron.y - HERO.neuron.r - 22, {
      size: 24,
      weight: 600,
      color: done ? C.text : C.dim,
      align: "center",
      font: "mono",
      alpha: sumA,
    });
  }

  // ---------------------------------------------------------------- output arrow, a-readout
  drawHeroOutput(ctx, 1);
  if (showA > 0.01) {
    text(ctx, `a = ${fmt(live.a, 2)}`, 822, HERO.neuron.y - 14, { size: 21, weight: 600, color: C.pos, align: "center", font: "mono", alpha: showA });
  }
  ctx.restore();

  // ---------------------------------------------------------------- activation inset (carried to ch.3)
  const plotA = seg(t, T.plot, T.plot + 1.4, ease.out);
  if (plotA > 0.005 && t < c.dur) {
    const draw = seg(t, T.plot + 0.2, T.plot + 2.6, ease.inOut);
    // callout lines from the neuron's "f" half to the inset (fade as it grows)
    line(ctx, HERO.neuron.x + 30, HERO.neuron.y - 14, PLOT_MINI.x - 26, PLOT_MINI.y - 18, { color: "rgba(255,255,255,0.22)", lw: 1, dash: [3, 4], alpha: plotA * exit });
    line(ctx, HERO.neuron.x + 30, HERO.neuron.y + 14, PLOT_MINI.x - 26, PLOT_MINI.y + PLOT_MINI.h + 36, { color: "rgba(255,255,255,0.22)", lw: 1, dash: [3, 4], alpha: plotA * exit });
    text(ctx, "激活函数 f", PLOT_MINI.x, PLOT_MINI.y - 30, { size: 16, weight: 500, color: C.dim, align: "left", font: "cjk", alpha: plotA * exit });
    drawCarriedActivationPlot(ctx, gf, { z: live.z, alpha: plotA, progress: draw });
  }

  // ---------------------------------------------------------------- the four knobs (stage F)
  const kA = seg(t, T.knob - 0.6, T.knob + 0.6, ease.out) * exit;
  if (kA > 0.01) {
    const xs = [560, 640, 720, 800];
    const vals = [W[0], W[1], W[2], B0];
    const lims = [2.4, 2.4, 2.4, 2.4];
    const names = [
      ["w", "1"],
      ["w", "2"],
      ["w", "3"],
      ["b", ""],
    ];
    for (let i = 0; i < 4; i++) {
      const active = i === 0;
      const col = signColor(vals[i]);
      knob(ctx, xs[i], 538, 20, vals[i], lims[i], active ? col : C.dim, kA * (active ? 1 : 0.75));
      if (names[i][1]) sub(ctx, names[i][0], names[i][1], xs[i], 580, 20, active ? C.text : C.dim, kA);
      else text(ctx, "b", xs[i], 580, { size: 20, color: C.dim, align: "center", font: "sans", italic: true, alpha: kA, weight: 500 });
    }
    text(ctx, "只有 4 个参数", 880, 546, { size: 20, weight: 600, color: C.text, align: "left", font: "cjk", alpha: kA * seg(t, T.knob + 4.5, T.knob + 5.8, ease.out) });
  }
}

/** The two derivation lines above the neuron, lit up in step with the animation. */
const Derivation: React.FC = () => {
  const c = useChapterClock();
  const t = c.t;
  const exit = 1 - seg(t, T.exit[0], T.exit[1], ease.inOut);
  const on = seg(t, T.products - 1.4, T.products - 0.4, ease.out) * exit;
  if (on < 0.01) return null;
  const W = [w1At(t), W0[1], W0[2]];
  const live = calc(W);
  const terms = (k: number) => {
    const s = T.products + k * 2.1;
    const e = seg(t, s, s + 0.7, ease.out);
    return e;
  };
  const eb = seg(t, T.bias + 0.7, T.bias + 1.5, ease.out);
  const ez = seg(t, T.zDone, T.zDone + 0.8, ease.out);
  const v = live.p;
  const fmtSigned = (x: number) => `\\mathbin{${x >= 0 ? "+" : "-"}}${fmt(Math.abs(x), 2).replace("−", "")}`;
  const tex2 = `\\htmlClass{tz}{z=}\\htmlClass{t1}{${fmt(v[0], 2)}}\\htmlClass{t2}{${fmtSigned(v[1])}}\\htmlClass{t3}{${fmtSigned(v[2])}}\\htmlClass{tb}{${fmtSigned(B0)}}\\htmlClass{tr}{=${fmt(live.z, 2).replace("−", "-")}}`;
  const tex1 = `\\htmlClass{tz}{z}=\\htmlClass{t1}{w_1x_1}+\\htmlClass{t2}{w_2x_2}+\\htmlClass{t3}{w_3x_3}+\\htmlClass{tb}{b}`;
  const lit = (e: number, col: string) => ({ o: lerp(0.2, 1, e), c: e > 0.05 ? col : undefined });
  const t1 = { tz: { o: 1 }, t1: lit(terms(0), signColor(W[0])), t2: lit(terms(1), signColor(W[1])), t3: lit(terms(2), signColor(W[2])), tb: lit(eb, signColor(B0)) };
  const t2 = {
    tz: { o: ez > 0.05 ? 1 : 0 },
    t1: { o: terms(0) > 0.5 ? 1 : 0, c: signColor(W[0]) },
    t2: { o: terms(1) > 0.5 ? 1 : 0, c: signColor(W[1]) },
    t3: { o: terms(2) > 0.5 ? 1 : 0, c: signColor(W[2]) },
    tb: { o: eb > 0.5 ? 1 : 0, c: signColor(B0) },
    tr: { o: ez, c: C.text },
  };
  return (
    <div style={{ position: "absolute", left: 0, top: 46, width: 1280, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: on }}>
      <Formula tex={tex1} size={34} terms={t1} />
      <Formula tex={tex2} size={30} terms={t2} />
    </div>
  );
};

export const Ch02Neuron: React.FC = () => (
  <>
    <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} />
    <Derivation />
    <ChapterCard />
    <Captions />
  </>
);
