import { Canvas } from "../lib/canvas";
import { rgba } from "../lib/color";
import { circle, line, polyline, rrect, text } from "../lib/draw";
import { clamp, ease, fmt, keyframes, lerp, seg } from "../lib/math";
import { chapterClock, useChapterClock } from "../lib/time";
import { C, FPS, RGB_NEG, RGB_POS } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { Formula } from "../ui/Formula";
import { gelu, relu, sigmoid, tanh } from "../visuals/activations";
import { H1, PLOT_BIG, SIG_WIN, drawSmallNeuron } from "../visuals/carry";
import {
  Frame,
  IDENT,
  Mat,
  Vec,
  drawMappedGrid,
  drawMappedPoints,
  matApply,
  matLerp,
  matMul,
  ring,
} from "../visuals/grid2d";
import { Rect, Win, drawAxes, drawCurve, drawFunctionPlot, px, py } from "../visuals/plot";

/**
 * 03 · 激活函数 — the sigmoid from chapter 2 fills the screen, two siblings join it, ReLU is picked.
 * Then the reason it matters: two linear layers collapse into one (a grid stays a grid), one ReLU
 * folds the plane. Folds are the raw material: 1 → 16 hinged pieces trace a wavy curve.
 * Carry out: the 16 ReLU neurons fly into a column — the first hidden layer of the digit network.
 */
const CH = chapterById("activation");
const DUR = CH.dur / FPS;

// ------------------------------------------------------------------ P1 / P2: the three curves
const PANEL: Rect[] = [
  { x: 92, y: 206, w: 316, h: 226 },
  { x: 482, y: 206, w: 316, h: 226 },
  { x: 872, y: 206, w: 316, h: 226 },
];
const FNS = [
  { name: "Sigmoid", fn: sigmoid, y0: -0.1, y1: 1.1, ticks: [0, 0.5, 1], tex: String.raw`\dfrac{1}{1+e^{-z}}` },
  { name: "Tanh", fn: tanh, y0: -1.2, y1: 1.2, ticks: [-1, 0, 1], tex: String.raw`\dfrac{e^{z}-e^{-z}}{e^{z}+e^{-z}}` },
  { name: "ReLU", fn: relu, y0: -0.4, y1: 3.2, ticks: [0, 1, 2, 3], tex: String.raw`\max(0,\;z)` },
] as const;
void gelu;

const zP1 = (t: number) =>
  keyframes(t, [
    [0, 0.988],
    [2.8, 0.988],
    [4.3, -5.3],
    [6.1, 5.3],
    [7.1, 0.988],
  ]);
const zP2 = (t: number) =>
  keyframes(t, [
    [8.4, 0.988],
    [10.0, -2.5],
    [12.0, 2.5],
    [13.8, 0.6],
  ]);

// ------------------------------------------------------------------ P3: linear layers collapse
const W1: Mat = [1.15, 0.55, -0.35, 0.95];
const W2: Mat = [0.9, -0.5, 0.45, 1.05];
const M = matMul(W2, W1);
const BIAS: Vec = [0.6, 0.5];
const FL: Frame = { x: 190, y: 152, w: 310, h: 310, half: 2 };
const FR: Frame = { x: 780, y: 152, w: 310, h: 310, half: 2 };
const OUTER = ring(0.8, 40);
const INNER = ring(0.4, 20, 0.15);
const P3 = { in: 14.8, w1: [16.2, 17.8], w2: [18.0, 19.6], eq: 20.0, fold: [21.6, 23.6], out: 24.2 };

function mapLeft(p: Vec, t: number): Vec {
  const e1 = seg(t, P3.w1[0], P3.w1[1], ease.inOut);
  const e2 = seg(t, P3.w2[0], P3.w2[1], ease.inOut);
  const e3 = seg(t, P3.fold[0], P3.fold[1], ease.inOut);
  const z = matApply(matLerp(matLerp(IDENT, W1, e1), M, e2), p);
  if (e3 <= 0) return z;
  const u: Vec = [z[0] + BIAS[0] * e3, z[1] + BIAS[1] * e3];
  return [lerp(u[0], Math.max(0, u[0]), e3), lerp(u[1], Math.max(0, u[1]), e3)];
}
function mapRight(p: Vec, t: number): Vec {
  return matApply(matLerp(IDENT, M, seg(t, P3.w2[0], P3.w2[1], ease.inOut)), p);
}

// ------------------------------------------------------------------ P4: ReLU hinges trace a curve
const AP: Rect = { x: 170, y: 132, w: 940, h: 296 };
const AWIN: Win = { x0: -3, x1: 3, y0: -0.12, y1: 1.12 };
const target = (x: number) => 0.5 + 0.3 * Math.sin(1.9 * x) + 0.13 * Math.sin(4.3 * x + 0.6);

const hingeCache = new Map<number, { xs: number[]; cs: number[]; f0: number }>();
function hinges(K: number) {
  let h = hingeCache.get(K);
  if (!h) {
    const xs = Array.from({ length: K + 1 }, (_, j) => -3 + (6 * j) / K);
    const slope = (j: number) => (target(xs[j + 1]) - target(xs[j])) / (xs[j + 1] - xs[j]);
    const cs = Array.from({ length: K }, (_, j) => (j === 0 ? slope(0) : slope(j) - slope(j - 1)));
    h = { xs: xs.slice(0, K), cs, f0: target(-3) };
    hingeCache.set(K, h);
  }
  return h;
}
const approx = (K: number, x: number) => {
  const h = hinges(K);
  let y = h.f0;
  for (let j = 0; j < K; j++) y += h.cs[j] * relu(x - h.xs[j]);
  return y;
};
const K_STEPS: [number, number][] = [
  [25.4, 1],
  [26.9, 2],
  [28.1, 3],
  [29.3, 4],
  [30.5, 6],
  [31.7, 8],
  [32.9, 12],
  [34.1, 16],
  [35.4, 16],
];
/** Blended approximation at time t, plus its fractional neuron count. */
function blendAt(t: number) {
  if (t <= K_STEPS[0][0]) return { K0: 1, K1: 1, e: 0, Kf: 1 };
  for (let i = 1; i < K_STEPS.length; i++) {
    if (t <= K_STEPS[i][0]) {
      const [ta, Ka] = K_STEPS[i - 1];
      const [tb, Kb] = K_STEPS[i];
      const e = ease.inOut(clamp(((t - ta) / (tb - ta) - 0.12) / 0.7));
      return { K0: Ka, K1: Kb, e, Kf: lerp(Ka, Kb, e) };
    }
  }
  return { K0: 16, K1: 16, e: 0, Kf: 16 };
}

const ROW = (i: number) => ({ x: 640 + (i - 7.5) * 46, y: 524 });

function hingeIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number) {
  polyline(ctx, [x - s, y + s * 0.55, x - s * 0.05, y + s * 0.55, x + s, y - s * 0.6], { color: "rgba(255,255,255,0.95)", lw: 1.8, alpha });
}

function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  if (t < 0 || t >= DUR + 0.001) return; // this chapter owns its own span; the carried plot is handed over at t = 0

  // ============================================================ P1 → P2: the three curves
  if (t < 15.4) {
    const morph = seg(t, 7.2, 8.8, ease.inOut);
    const out = 1 - seg(t, 14.0, 15.0, ease.inOutSine);
    const hi = seg(t, 10.6, 11.6, ease.inOutSine);

    // sigmoid: the big plot shrinks into the first panel while its window zooms 12 → 6 wide
    const r0: Rect = {
      x: lerp(PLOT_BIG.x, PANEL[0].x, morph),
      y: lerp(PLOT_BIG.y, PANEL[0].y, morph),
      w: lerp(PLOT_BIG.w, PANEL[0].w, morph),
      h: lerp(PLOT_BIG.h, PANEL[0].h, morph),
    };
    const w0: Win = {
      x0: lerp(SIG_WIN.x0, -3, morph),
      x1: lerp(SIG_WIN.x1, 3, morph),
      y0: lerp(SIG_WIN.y0, FNS[0].y0, morph),
      y1: lerp(SIG_WIN.y1, FNS[0].y1, morph),
    };
    const z = t < 7.2 ? zP1(t) : zP2(t);
    const dim0 = lerp(1, 0.28, hi);
    drawFunctionPlot(ctx, r0, w0, sigmoid, { alpha: out * dim0, dotZ: z, ticksY: [...FNS[0].ticks] });

    // tanh and relu arrive
    for (let i = 1; i < 3; i++) {
      const a = seg(t, 8.2 + (i - 1) * 0.5, 9.4 + (i - 1) * 0.5, ease.out) * out;
      if (a <= 0.005) continue;
      const dim = i === 1 ? lerp(1, 0.28, hi) : 1;
      const win: Win = { x0: -3, x1: 3, y0: FNS[i].y0, y1: FNS[i].y1 };
      drawFunctionPlot(ctx, PANEL[i], win, FNS[i].fn, {
        alpha: a * dim,
        dotZ: zP2(t),
        ticksY: [...FNS[i].ticks],
        color: i === 2 ? C.text : C.text,
        dotColor: RGB_POS,
      });
    }
    // titles
    for (let i = 0; i < 3; i++) {
      const a = (i === 0 ? seg(t, 6.9, 8.4, ease.out) : seg(t, 8.6 + (i - 1) * 0.5, 9.6 + (i - 1) * 0.5, ease.out)) * out;
      const dim = i < 2 ? lerp(1, 0.28, hi) : 1;
      if (a > 0.005) text(ctx, FNS[i].name, PANEL[i].x, PANEL[i].y - 26, { size: 22, weight: 700, color: i === 2 && hi > 0.5 ? C.pos : C.text, font: "sans", alpha: a * dim });
    }
    // ReLU gets picked
    if (hi > 0.01) {
      const r = PANEL[2];
      rrect(ctx, r.x - 30, r.y - 60, r.w + 60, r.h + 130, 16, { stroke: rgba(RGB_POS, 0.5), lw: 1.5, alpha: hi * out });
    }
    // P1: the readouts beside the big plot
    const ro = seg(t, 2.8, 3.6, ease.out) * (1 - seg(t, 6.9, 7.6, ease.in));
    if (ro > 0.01) {
      const zz = zP1(t);
      text(ctx, `z = ${zz >= 0 ? "" : "−"}${fmt(Math.abs(zz), 2)}`, 940, 352, { size: 24, weight: 600, color: C.text, font: "mono", alpha: ro });
      text(ctx, `a = ${fmt(sigmoid(zz), 2)}`, 940, 392, { size: 24, weight: 600, color: C.pos, font: "mono", alpha: ro });
    }
    // shared z readout under the three panels
    const zr = seg(t, 9.4, 10.2, ease.out) * out;
    if (zr > 0.01) {
      const zz = zP2(t);
      text(ctx, `z = ${zz >= 0 ? "" : "−"}${fmt(Math.abs(zz), 2)}`, 640, 584, { size: 21, weight: 600, color: C.dim, align: "center", font: "mono", alpha: zr });
    }
  }

  // ============================================================ P3: linear layers collapse
  if (t > 14.4 && t < 25.6) {
    const a = seg(t, P3.in, P3.in + 1.0, ease.out) * (1 - seg(t, P3.out, P3.out + 0.9, ease.inOutSine));
    if (a > 0.005) {
      for (const [fr, isLeft] of [[FL, true], [FR, false]] as const) {
        rrect(ctx, fr.x - 1, fr.y - 1, fr.w + 2, fr.h + 2, 10, { stroke: "rgba(255,255,255,0.14)", lw: 1, alpha: a });
        const map = (p: Vec) => (isLeft ? mapLeft(p, t) : mapRight(p, t));
        drawMappedGrid(ctx, fr, map, { alpha: a, color: "rgba(255,255,255,0.32)" });
        drawMappedPoints(ctx, fr, map, OUTER, C.pos, { alpha: a, r: 3.2 });
        drawMappedPoints(ctx, fr, map, INNER, C.neg, { alpha: a, r: 3.2 });
      }
      // = / ≠
      const eq = seg(t, P3.eq, P3.eq + 0.8, ease.out);
      const neq = seg(t, P3.fold[0] + 0.3, P3.fold[0] + 1.1, ease.out);
      text(ctx, "=", 640, 328, { size: 76, weight: 300, color: C.text, align: "center", font: "sans", alpha: a * eq * (1 - neq) });
      text(ctx, "≠", 640, 328, { size: 76, weight: 300, color: C.neg, align: "center", font: "sans", alpha: a * neq });
      // titles
      const foldOn = seg(t, P3.fold[0], P3.fold[0] + 0.8, ease.out);
      text(ctx, "两层线性变换", FL.x + FL.w / 2, FL.y - 22, { size: 20, weight: 600, color: C.text, align: "center", font: "cjk", alpha: a * (1 - foldOn) });
      text(ctx, "再加一个 ReLU", FL.x + FL.w / 2, FL.y - 22, { size: 20, weight: 600, color: C.neg, align: "center", font: "cjk", alpha: a * foldOn });
      text(ctx, "合成一层线性变换", FR.x + FR.w / 2, FR.y - 22, { size: 20, weight: 600, color: C.text, align: "center", font: "cjk", alpha: a });
    }
  }

  // ============================================================ P4: hinges trace a curve
  if (t > 24.4 && t < 36.8) {
    const a = seg(t, 24.8, 25.8, ease.out) * (1 - seg(t, 35.4, 36.6, ease.inOutSine));
    if (a > 0.005) {
      const p = { ...AP, ...AWIN };
      drawAxes(ctx, p, { alpha: a, ticksX: [-3, -2, -1, 0, 1, 2, 3], ticksY: [0, 0.5, 1], labelX: "x", labelY: "y", grid: true });
      drawCurve(ctx, p, target, { color: "rgba(255,255,255,0.5)", lw: 2, dash: [7, 6], alpha: a });
      const b = blendAt(t);
      const f = (x: number) => lerp(approx(b.K0, x), approx(b.K1, x), b.e);
      drawCurve(ctx, p, f, { color: C.text, lw: 3.4, alpha: a, samples: 300 });
      // knots of both step sizes (the new ones fade in)
      for (const [K, wgt] of [[b.K0, 1 - b.e], [b.K1, b.e]] as const) {
        if (wgt <= 0.01 || (K === b.K0 && K === b.K1 && wgt < 1)) continue;
        for (const x of hinges(K).xs) {
          const X = px(p, x);
          const Y = py(p, f(x));
          line(ctx, X, p.y + p.h, X, Y, { color: rgba(RGB_POS, 0.18 * a * wgt), lw: 1 });
          circle(ctx, X, Y, 4.4, { fill: C.pos, alpha: a * wgt });
        }
      }
      // error readout (true RMS against the target)
      let se = 0;
      const nS = 240;
      for (let i = 0; i < nS; i++) {
        const x = -3 + (6 * (i + 0.5)) / nS;
        const d = f(x) - target(x);
        se += d * d;
      }
      const rms = Math.sqrt(se / nS);
      text(ctx, `均方根误差  ${fmt(rms, 3)}`, AP.x + AP.w, AP.y - 10, { size: 19, weight: 600, color: C.dim, align: "right", font: "mono", alpha: a });
      text(ctx, "目标曲线", AP.x + 100, AP.y - 10, { size: 17, weight: 500, color: C.dim, font: "cjk", alpha: a * 0.9 });
      line(ctx, AP.x + 8, AP.y - 15, AP.x + 92, AP.y - 15, { color: "rgba(255,255,255,0.5)", lw: 2, dash: [7, 6], alpha: a * 0.9 });
      text(ctx, `${Math.round(b.Kf)} 个 ReLU 神经元`, 640, 486, { size: 20, weight: 600, color: C.text, align: "center", font: "cjk", alpha: a });
    }
  }

  // ============================================================ neuron row → column (P4 → carry)
  if (t > 25.2) {
    const rowIn = seg(t, 25.2, 26.4, ease.out);
    const b = blendAt(t);
    const dimOut = 1 - seg(t, 35.6, 36.0, ease.linear);
    for (let i = 0; i < 16; i++) {
      const row = ROW(i);
      const lit = clamp(b.Kf - i);
      const q = ease.soft(seg(t, 36.0 + i * 0.05, 36.0 + i * 0.05 + 1.7, ease.linear));
      const x = lerp(row.x, H1.x, q);
      const y = lerp(row.y, H1.ys[i], q);
      const r = lerp(15, H1.r, q);
      const act = t < 37.4 ? lit : lit * (1 - seg(t, 37.4, 40.4, ease.inOutSine));
      drawSmallNeuron(ctx, x, y, r, act, rowIn);
      const ic = rowIn * (1 - q) * (0.35 + 0.65 * lit) * (dimOut + (1 - dimOut));
      if (ic > 0.02) hingeIcon(ctx, x, y, 6.5, ic);
    }
  }
}

const Labels: React.FC = () => {
  const c = useChapterClock();
  const t = c.t;
  // sigmoid formula beside the big plot
  const sig = seg(t, 2.4, 3.4, ease.out) * (1 - seg(t, 6.9, 7.6, ease.in));
  const out = 1 - seg(t, 14.0, 15.0, ease.inOutSine);
  const hi = seg(t, 10.6, 11.6, ease.inOutSine);
  const p3 = seg(t, P3.in + 0.6, P3.in + 1.6, ease.out) * (1 - seg(t, P3.out, P3.out + 0.9, ease.inOutSine));
  return (
    <>
      {sig > 0.01 && (
        <div style={{ position: "absolute", left: 936, top: 214, opacity: sig }}>
          <Formula tex={String.raw`\sigma(z)=\dfrac{1}{1+e^{-z}}`} size={30} />
        </div>
      )}
      {FNS.map((f, i) => {
        const a = (i === 0 ? seg(t, 8.4, 9.4, ease.out) : seg(t, 9.0 + (i - 1) * 0.5, 10.0 + (i - 1) * 0.5, ease.out)) * out;
        const dim = i < 2 ? lerp(1, 0.28, hi) : 1;
        if (a * dim < 0.01) return null;
        return (
          <div
            key={f.name}
            style={{ position: "absolute", left: PANEL[i].x, top: PANEL[i].y + PANEL[i].h + 46, width: PANEL[i].w, display: "flex", justifyContent: "center", opacity: a * dim }}
          >
            <Formula tex={f.tex} size={i === 2 ? 30 : 26} color={i === 2 && hi > 0.5 ? C.pos : C.text} />
          </div>
        );
      })}
      {p3 > 0.01 && (
        <>
          <div style={{ position: "absolute", left: FL.x, top: FL.y + FL.h + 22, width: FL.w, display: "flex", justifyContent: "center", opacity: p3 }}>
            <Formula tex={String.raw`W_2\,(W_1\,\mathbf{x})`} size={28} />
          </div>
          <div style={{ position: "absolute", left: FR.x, top: FR.y + FR.h + 22, width: FR.w, display: "flex", justifyContent: "center", opacity: p3 }}>
            <Formula tex={String.raw`(W_2W_1)\,\mathbf{x}`} size={28} />
          </div>
        </>
      )}
    </>
  );
};

export const Ch03Activation: React.FC = () => (
  <>
    <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} />
    <Labels />
    <ChapterCard />
    <Captions />
  </>
);

void RGB_NEG;
