import { Canvas } from "../lib/canvas";
import { circle, glow, text } from "../lib/draw";
import { clamp, ease, lerp, seg } from "../lib/math";
import { chapterClock, useChapterClock } from "../lib/time";
import { C, FPS, RGB_POS } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { COUNTER_TOP, ParamCounter } from "../ui/ParamCounter";
import { HERO, drawNeuron } from "../visuals/carry";
import { G_N, drawGalaxy, galaxy } from "../visuals/galaxy";

/**
 * 13 · 规模 — the parameter counter of chapter 12 climbs — 13 002, LeNet's 60 thousand, AlexNet's 60 million,
 * GPT-3's 175 billion — while a galaxy of dots (one per parameter, then per thousand, then per few million)
 * is pulled out of, level after level, until our whole network is a speck. Then the camera dives into a single dot
 * and it turns out to be a neuron: the very one chapter 2 began with. Carry in: the counter. Carry out: that neuron.
 */
const CH = chapterById("scale");
const DUR = CH.dur / FPS;

const G = { x: 640, y: 410 };
const R0 = 172;
const RATIO = 12.5;
const SLOT1 = { x: 60, y: -26 };
const SLOT2 = { x: -72, y: 30 };

const T = {
  glide: [0.6, 2.0] as const,
  cloud: [1.0, 2.6] as const,
  fill: [7.0, 9.2] as const,
  pull1: [10.8, 13.4] as const,
  pull2: [14.8, 17.6] as const,
  out: [19.0, 19.9] as const,
  dive: [19.4, 21.8] as const,
};

/** The counter's value over the chapter: holds, and log-space climbs between the landmarks. */
const LAND = [13002, 60_000, 60_000_000, 175_000_000_000];
function counterValue(t: number): number {
  const climb = (a: number, b: number, w: readonly [number, number]) => Math.exp(lerp(Math.log(a), Math.log(b), ease.inOut(seg(t, w[0], w[1], ease.linear))));
  if (t < T.fill[0]) return LAND[0];
  if (t < T.pull1[0] - 0.4) return climb(LAND[0], LAND[1], T.fill);
  if (t < T.pull1[1] + 0.1) return climb(LAND[1], LAND[2], [T.pull1[0], T.pull1[1] - 0.2]);
  if (t < T.pull2[0]) return LAND[2];
  return climb(LAND[2], LAND[3], [T.pull2[0], T.pull2[1] - 0.2]);
}

/** Camera "level": 0 = our galaxy fills the view, 1 = it is one speck of the next, 2 = one speck of the next again. */
function levelAt(t: number): number {
  return seg(t, T.pull1[0], T.pull1[1], ease.inOut) + seg(t, T.pull2[0], T.pull2[1], ease.inOut);
}

interface Lv {
  cx: number;
  cy: number;
  R: number;
}
function levels(L: number): Lv[] {
  const R = [0, 1, 2].map((k) => R0 * Math.pow(RATIO, k - L));
  const Bc = { x: SLOT2.x * (R[2] / R0), y: SLOT2.y * (R[2] / R0) };
  const Ac = { x: Bc.x + SLOT1.x * (R[1] / R0), y: Bc.y + SLOT1.y * (R[1] / R0) };
  const C0 = { x: 0, y: 0 };
  const l = clamp(L, 0, 2);
  const F = l <= 1 ? { x: lerp(Ac.x, Bc.x, l), y: lerp(Ac.y, Bc.y, l) } : { x: lerp(Bc.x, C0.x, l - 1), y: lerp(Bc.y, C0.y, l - 1) };
  return [Ac, Bc, C0].map((c, k) => ({ cx: G.x + (c.x - F.x), cy: G.y + (c.y - F.y), R: R[k] }));
}

const STAGES = [
  { a: 1.0, b: 7.0, title: "我们的网络", sub: "认识手写数字", legend: "= 1 个参数" },
  { a: 7.0, b: 10.8, title: "LeNet-5 · 1998", sub: "认识手写数字", legend: "= 1 个参数" },
  { a: 10.8, b: 14.8, title: "AlexNet · 2012", sub: "认识一千类图片 · 圈里是 LeNet", legend: "≈ 1 000 个参数" },
  { a: 14.8, b: 19.4, title: "GPT-3 · 2020", sub: "续写文字 · 圈里是 AlexNet", legend: "≈ 300 万个参数" },
];

/** The dot we dive into: a cyan one on the arm, not too far from the middle. */
const DIVE_IDX = (() => {
  const g = galaxy();
  for (let i = 3000; i < G_N; i++) if (g.cls[i] === 0 && g.x[i] > 0.28 && g.x[i] < 0.42 && Math.abs(g.y[i]) < 0.08) return i;
  return 3000;
})();

function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  if (t < 0 || t >= DUR + 0.001) return;

  const gA = seg(t, T.cloud[0], T.cloud[1], ease.out) * (1 - seg(t, T.out[0], T.out[1], ease.inOutSine) * 0);
  const L = levelAt(t);
  const lv = levels(L);
  // how many dots of the first galaxy exist at this moment (they arrive with the counter)
  const countA = t < T.fill[0] ? LAND[0] : Math.min(G_N, Math.round(lerp(LAND[0], G_N, ease.inOut(seg(t, T.fill[0], T.fill[1], ease.linear)))));

  const dive = ease.inOut(seg(t, T.dive[0], T.dive[1], ease.linear));
  if (dive < 0.001) {
    // levels drawn back to front; a level is drawn while it is neither microscopic nor astronomically big
    const fadeBig = (R: number) => 1 - seg(R, 900, 3000, ease.inOutSine);
    const order = [2, 1, 0];
    for (const k of order) {
      const { cx, cy, R } = lv[k];
      const a = gA * fadeBig(R) * (k === 2 ? seg(L, 0.75, 1.2, ease.out) : k === 1 ? seg(L, 0.0, 0.3, ease.out) : 1);
      drawGalaxy(ctx, cx, cy, R, k === 0 ? countA : G_N, a);
    }
    // a ring around the level we just came from, so the eye finds it
    const pulls = [
      { w: T.pull1, k: 0 },
      { w: T.pull2, k: 1 },
    ];
    for (const p of pulls) {
      const ra = seg(t, p.w[1] - 1.0, p.w[1] - 0.2, ease.out) * (1 - seg(t, p.w[1] + 1.2, p.w[1] + 2.0, ease.inOut));
      if (ra > 0.01) {
        const { cx, cy, R } = lv[p.k];
        circle(ctx, cx, cy, Math.max(R, 5) + 9, { stroke: "rgba(255,255,255,0.75)", lw: 1.4, alpha: ra });
      }
    }
  } else {
    // dive: the camera drops into one dot of the last galaxy, and the dot becomes the neuron of chapter 2
    const { cx, cy, R } = lv[2];
    const g = galaxy();
    const D = { x: cx + g.x[DIVE_IDX] * R, y: cy + g.y[DIVE_IDX] * R };
    const end = { x: HERO.neuron.x, y: HERO.neuron.y };
    const s = Math.exp(lerp(0, Math.log(HERO.neuron.r / 2), dive));
    const P = { x: lerp(D.x, end.x, dive), y: lerp(D.y, end.y, dive) };
    const ga = (1 - seg(dive, 0.05, 0.75, ease.out)) * gA;
    drawGalaxy(ctx, P.x + (cx - D.x) * s, P.y + (cy - D.y) * s, R * s, G_N, ga, { size: 1.6 });
    const dotA = 1 - seg(dive, 0.5, 0.92, ease.out);
    glow(ctx, P.x, P.y, 2 * s * 3, RGB_POS, 0.6 * dotA);
    circle(ctx, P.x, P.y, 2 * s, { fill: C.pos, alpha: dotA });
    drawNeuron(ctx, P.x, P.y, 2 * s, { act: 0, alpha: seg(dive, 0.45, 0.95, ease.out) });
  }

  // stage labels (left column)
  if (dive < 0.02) {
    STAGES.forEach((s) => {
      const a = seg(t, s.a, s.a + 0.6, ease.out) * (1 - seg(t, s.b - 0.5, s.b, ease.inOut)) * (1 - seg(t, T.out[0], T.out[1], ease.inOutSine));
      if (a < 0.01) return;
      text(ctx, s.title, 70, 350, { size: 28, weight: 700, color: C.text, font: "cjk", alpha: a });
      text(ctx, s.sub, 70, 382, { size: 17, weight: 500, color: C.dim, font: "cjk", alpha: a });
      circle(ctx, 76, 414, 3.4, { fill: C.pos, alpha: a });
      text(ctx, s.legend, 92, 420, { size: 16, weight: 500, color: C.dim, font: "cjk", alpha: a });
    });
  }
}

const Overlay: React.FC = () => {
  const { t } = useChapterClock();
  const g = ease.inOut(seg(t, T.glide[0], T.glide[1], ease.linear));
  const top = lerp(COUNTER_TOP, COUNTER_TOP - 200, g);
  const a = (t < DUR ? 1 : 0) * (1 - seg(t, T.out[0], T.out[1], ease.inOutSine));
  if (a < 0.01) return null;
  return (
    <>
      <ParamCounter value={counterValue(t)} opacity={a} top={top} />
      <div style={{ position: "absolute", left: 1076, top: 300 - 200 * g, fontSize: 28, fontWeight: 500, color: C.dim, opacity: a }}>个参数</div>
    </>
  );
};

export const Ch13Scale: React.FC = () => {
  const { t } = useChapterClock();
  // real temporal blur (5 sub-frames, wide shutter) while the camera is actually travelling
  const moving = (t > T.pull1[0] && t < T.pull1[1]) || (t > T.pull2[0] && t < T.pull2[1]) || (t > T.dive[0] && t < T.dive[1]);
  return (
    <>
      <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} blur={moving ? { samples: 5, shutter: 0.8 } : undefined} />
      <Overlay />
      <ChapterCard />
      <Captions />
    </>
  );
};
