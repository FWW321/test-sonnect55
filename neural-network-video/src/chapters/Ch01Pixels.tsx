import { Sequence } from "remotion";
import { SoftBlurIn } from "../components/remocn/soft-blur-in";
import { Canvas } from "../lib/canvas";
import { grey, rgba } from "../lib/color";
import { arrow, circle, glow, pulse, rrect, text } from "../lib/draw";
import { clamp, ease, hash01, lerp, seg } from "../lib/math";
import { chapterClock, useChapterClock } from "../lib/time";
import { C, FPS, RGB_POS } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { HERO, drawHeroEdges, drawHeroOutput, drawInputNode, drawNeuron, heroInputCells } from "../visuals/carry";
import { heroImage } from "../visuals/data";

/**
 * 01 · 像素 — one glowing pixel → the '7' it belongs to → 784 numbers → a vector → a black box
 * that answers "7" → the box opens and there is a single neuron with three of those pixels as inputs.
 * Every cell you see at the end is one of the cells you saw in the first shot.
 */
const CH = chapterById("pixels");
const N = 28;
const CELL = 15;
const GAP = 1.4;
const GX0 = 640 - (N * CELL) / 2;
const GY0 = 314 - (N * CELL) / 2;
const NCELL = N * N;

// ---- layouts a cell can be in ------------------------------------------------------------
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const gridRect = (i: number): Rect => ({
  x: GX0 + (i % N) * CELL,
  y: GY0 + Math.floor(i / N) * CELL,
  w: CELL - GAP,
  h: CELL - GAP,
});
const BAR = { x0: 32, w: (1280 - 64) / NCELL, y: 294, h: 40 };
const barRect = (i: number): Rect => ({ x: BAR.x0 + i * BAR.w, y: BAR.y, w: BAR.w * 0.88, h: BAR.h });
const COL = { x: 230, y0: 136, y1: 496, w: 30 };
const colRect = (i: number): Rect => ({
  x: COL.x - COL.w / 2,
  y: COL.y0 + (i / NCELL) * (COL.y1 - COL.y0),
  w: COL.w,
  h: ((COL.y1 - COL.y0) / NCELL) * 0.92,
});
const mix = (a: Rect, b: Rect, t: number): Rect => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
});

const BOX = { x: 470, y: 246, w: 340, h: 208 }; // centre (640, 350)
const BOX_C = { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 };
const ANSWER = { x: 1010, y: 350 };

// ---- times (seconds) ---------------------------------------------------------------------
const T = {
  pixelIn: [0.3, 1.0],
  zoomOut: [0.9, 5.4],
  numbers: 8.8,
  zoomIn: [8.6, 11.4],
  zoomBack: [13.6, 15.4],
  flat: 16.4,
  toCol: 22.0,
  boxIn: [23.4, 25.0],
  stream: 25.4,
  answer: 27.0,
  title: 29.4,
  open: 38.0,
} as const;

// ---- the digit ---------------------------------------------------------------------------
const img = heroImage();
const HERO_PX = (() => {
  // brightest pixel nearest the ink's centre of mass: the very first thing the viewer sees
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let i = 0; i < NCELL; i++) {
    sx += (i % N) * img[i];
    sy += Math.floor(i / N) * img[i];
    sw += img[i];
  }
  const cx = sx / sw;
  const cy = sy / sw;
  let best = 0;
  let bd = 1e9;
  for (let i = 0; i < NCELL; i++) {
    if (img[i] < 0.97) continue;
    const d = Math.hypot((i % N) - cx, Math.floor(i / N) - cy);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
})();
const HERO_C = (() => {
  const r = gridRect(HERO_PX);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
})();
const FOCUS = (() => {
  const r = gridRect(7 * N + 17);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
})();
const heroCellSlot = new Map<number, number>(heroInputCells.map((c, k) => [c.index, k]));

// ---- camera ------------------------------------------------------------------------------
const CAM_KEYS = [
  { t: 0, z: 9, x: HERO_C.x, y: HERO_C.y },
  { t: T.zoomOut[0], z: 9, x: HERO_C.x, y: HERO_C.y },
  { t: T.zoomOut[1], z: 1, x: 640, y: 360 },
  { t: T.zoomIn[0], z: 1, x: 640, y: 360 },
  { t: T.zoomIn[1], z: 3.6, x: FOCUS.x, y: FOCUS.y },
  { t: T.zoomBack[0], z: 3.6, x: FOCUS.x, y: FOCUS.y },
  { t: T.zoomBack[1], z: 1, x: 640, y: 360 },
];
function camera(t: number) {
  if (t <= CAM_KEYS[0].t) return CAM_KEYS[0];
  for (let i = 1; i < CAM_KEYS.length; i++) {
    const a = CAM_KEYS[i - 1];
    const b = CAM_KEYS[i];
    if (t <= b.t) {
      if (b.t === a.t) return b;
      const e = ease.inOut(clamp((t - a.t) / (b.t - a.t)));
      return {
        t,
        z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), e)),
        x: lerp(a.x, b.x, e),
        y: lerp(a.y, b.y, e),
      };
    }
  }
  return CAM_KEYS[CAM_KEYS.length - 1];
}

// ---- drawing -----------------------------------------------------------------------------
function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  const cam = camera(t);

  // ---------- world (camera) layer: the cells
  ctx.save();
  ctx.translate(640, 360);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -cam.y);

  const hx = HERO_C.x / CELL; // for radial reveal distance
  const numA = seg(t, T.numbers, T.numbers + 1.2, ease.out) * (1 - seg(t, 13.2, 14.4, ease.inOutSine));
  const openA = 1 - seg(t, T.open, T.open + 1.1, ease.out);
  const pixelA = seg(t, T.pixelIn[0], T.pixelIn[1], ease.out);

  for (let i = 0; i < NCELL; i++) {
    const r = Math.floor(i / N);
    const col = i % N;
    const v = img[i];
    const slot = heroCellSlot.get(i);

    // reveal: hero pixel first, then a ripple outward
    const d = Math.hypot(col + 0.5 - HERO_C.x / CELL + GX0 / CELL, r + 0.5 - HERO_C.y / CELL + GY0 / CELL);
    let alpha = i === HERO_PX ? pixelA : seg(t, 1.5 + d * 0.055, 2.15 + d * 0.055, ease.out);
    if (t > 5.4) alpha = 1;

    // stage 1: grid → barcode (row by row), stage 2: barcode → column (left to right)
    const p1 = ease.inOut(seg(t, T.flat + r * 0.085, T.flat + r * 0.085 + 1.5, ease.linear));
    const p2 = ease.inOut(seg(t, T.toCol + (i / NCELL) * 0.9, T.toCol + (i / NCELL) * 0.9 + 1.5, ease.linear));
    let rect = mix(mix(gridRect(i), barRect(i), p1), colRect(i), p2);

    let a = alpha;
    let asInput = 0;
    if (t > T.open - 0.2) {
      if (slot !== undefined) {
        const p3 = ease.soft(seg(t, T.open + slot * 0.14, T.open + slot * 0.14 + 1.5, ease.linear));
        const tgt = HERO.inputs[slot];
        const s = HERO.inputSize;
        rect = mix(rect, { x: tgt.x - s / 2, y: tgt.y - s / 2, w: s, h: s }, p3);
        asInput = p3;
      } else {
        a *= openA;
      }
    }
    if (a <= 0.003) continue;

    // cull anything far outside the view
    const sx = (rect.x - cam.x) * cam.z + 640;
    const sy = (rect.y - cam.y) * cam.z + 360;
    if (sx > 1300 || sy > 740 || sx + rect.w * cam.z < -20 || sy + rect.h * cam.z < -20) continue;

    if (asInput > 0.02) {
      drawInputNode(ctx, rect.x + rect.w / 2, rect.y + rect.h / 2, v, Math.max(rect.w, 4), a * clamp(asInput * 3));
      if (asInput < 0.98) {
        ctx.globalAlpha = a * (1 - clamp(asInput * 3));
        ctx.fillStyle = rgba(grey(v));
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = rgba(grey(v));
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.globalAlpha = 1;
    }

    // the numbers (0–255) written into the cells while the camera is close
    if (numA > 0.01 && cam.z > 1.6 && p1 === 0) {
      const n = Math.round(v * 255);
      const delay = r * 0.05 + col * 0.005;
      const na = numA * seg(t, T.numbers + delay, T.numbers + delay + 0.5, ease.out);
      if (na > 0.01) {
        text(ctx, String(n), rect.x + rect.w / 2, rect.y + rect.h / 2 + 1.6, {
          size: 4.7,
          weight: 500,
          font: "mono",
          align: "center",
          color: v > 0.5 ? "#0a0d12" : "#c7d0de",
          alpha: na * (v > 0.5 ? 0.9 : 0.7),
        });
      }
    }
  }
  // the first glow — one pixel, very bright
  const gl = pixelA * (1 - seg(t, 0.9, 3.4, ease.out));
  if (gl > 0.01) glow(ctx, HERO_C.x, HERO_C.y, CELL * 3.2, [235, 245, 255], 0.55 * gl);
  ctx.restore();
  void hx;

  // ---------- screen layer: everything after the cells have become a vector
  const boxA = seg(t, T.boxIn[0], T.boxIn[1], ease.out);
  const openBox = seg(t, T.open, T.open + 3.0, ease.inOut);
  if (boxA > 0.005) {
    const s = 1 + openBox * 4.6;
    const alpha = boxA * (1 - seg(t, T.open + 1.6, T.open + 3.0, ease.out));
    if (alpha > 0.005) {
      ctx.save();
      ctx.translate(BOX_C.x, BOX_C.y);
      ctx.scale(s, s);
      rrect(ctx, -BOX.w / 2, -BOX.h / 2, BOX.w, BOX.h, 18 / Math.sqrt(s), {
        fill: "rgba(11,15,21,0.92)",
        stroke: "rgba(255,255,255,0.4)",
        lw: 1.5 / s,
        alpha,
      });
      ctx.restore();
    }
    // the question mark inside the box
    const qa = boxA * (1 - seg(t, T.open, T.open + 0.9, ease.out));
    if (qa > 0.01) text(ctx, "?", BOX_C.x, BOX_C.y + 30, { size: 92, weight: 300, color: C.dim, align: "center", font: "sans", alpha: 0.75 * qa });
  }

  // stream of signal from the column into the box, and from the box to the answer
  const streamA = seg(t, T.stream, T.stream + 1.2, ease.out) * (1 - seg(t, T.open - 0.4, T.open + 0.8, ease.out));
  if (streamA > 0.01) {
    for (let k = 0; k < 16; k++) {
      const y = 350 + (hash01(k, 3) - 0.5) * 120;
      const p = (t * 0.42 + hash01(k, 1)) % 1;
      pulse(ctx, COL.x + COL.w / 2 + 6, y, BOX.x - 4, lerp(y, 350, 0.55), p, RGB_POS, 2.6, streamA);
    }
    const ans = seg(t, T.answer, T.answer + 1.4, ease.out);
    for (let k = 0; k < 8; k++) {
      const p = (t * 0.5 + hash01(k, 9)) % 1;
      pulse(ctx, BOX.x + BOX.w + 4, lerp(350, 350, 0), ANSWER.x - 78, 350, p, RGB_POS, 2.6, streamA * ans);
    }
  }
  const ansA = seg(t, T.answer, T.answer + 1.3, ease.soft) * (1 - seg(t, T.open, T.open + 0.9, ease.out));
  if (ansA > 0.01) {
    arrow(ctx, BOX.x + BOX.w + 16, 350, ANSWER.x - 76, 350, { color: "rgba(255,255,255,0.35)", lw: 1.5, alpha: ansA });
    const sc = lerp(0.82, 1, ansA);
    ctx.save();
    ctx.translate(ANSWER.x, ANSWER.y);
    ctx.scale(sc, sc);
    text(ctx, "7", 0, 46, { size: 150, weight: 700, color: C.pos, align: "center", font: "sans", alpha: ansA });
    ctx.restore();
  }
  if (boxA > 0.05) {
    const la = boxA * (1 - seg(t, T.open - 0.4, T.open + 0.6, ease.out));
    text(ctx, "784 个数字", COL.x, COL.y1 + 34, { size: 17, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: la });
  }

  // ---------- the neuron opens up inside the box (carried into chapter 2)
  const grow = ease.soft(seg(t, T.open + 1.0, T.open + 3.4, ease.linear));
  if (grow > 0.003) {
    drawHeroEdges(ctx, seg(t, T.open + 2.4, T.open + 4.0, ease.out));
    drawHeroOutput(ctx, seg(t, T.open + 3.0, T.open + 4.4, ease.out));
    drawNeuron(ctx, HERO.neuron.x, HERO.neuron.y, HERO.neuron.r * grow, { alpha: clamp(grow * 1.6) });
  }
}

export const Ch01Pixels: React.FC = () => {
  const c = useChapterClock();
  const blur = c.t > 0.9 && c.t < 4.2 ? { samples: 5, shutter: 0.75 } : undefined;
  const from = (s: number) => Math.round(s * FPS);
  const titleOut = 1 - seg(c.t, 37.0, 38.0, ease.inOutSine);
  const subIn = seg(c.t, 32.6, 34.2, ease.out);
  return (
    <>
      {/* the zoomed-in numbers must not run under the caption band */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          maskImage: "linear-gradient(to bottom, #000 0, #000 80%, transparent 87%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 0, #000 80%, transparent 87%)",
        }}
      >
        <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} blur={blur} />
      </div>
      {/* film title — remocn soft-blur-in, in a box across the top of the stage */}
      <Sequence from={from(T.title)} durationInFrames={from(8.6)} layout="none">
        <div style={{ position: "absolute", left: 0, top: 70, width: 1280, height: 120, opacity: titleOut }}>
          <SoftBlurIn text="神经网络" fontSize={92} fontWeight={700} color={C.text} tracking="0.06em" blur={14} />
        </div>
      </Sequence>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 178,
          width: 1280,
          textAlign: "center",
          fontSize: 26,
          fontWeight: 400,
          color: C.dim,
          opacity: subIn * titleOut,
          translate: `0 ${(1 - subIn) * 8}px`,
        }}
      >
        一台学会自己写规则的机器
      </div>
      <ChapterCard delay={2.0} />
      <Captions />
    </>
  );
};
