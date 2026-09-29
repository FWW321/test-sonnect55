import { Canvas } from "../lib/canvas";
import { diverging, grey, mixRGB, rgba } from "../lib/color";
import { circle, heatmap, line, rrect, text } from "../lib/draw";
import { clamp, ease, fmt, keyframes, lerp, seg, thousands } from "../lib/math";
import { chapterClock } from "../lib/time";
import { C, FPS, RGB_NEG, RGB_POS } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { WIN3, WIN_PATCH, drawWin3, tokenRects } from "../visuals/carry";
import { ACC, HAND, K, LOSS, N_SNAP, SIDE, STEP_OF, biasAt, convolve, kernelAt, statAt } from "../visuals/cnn";
import { heroImage } from "../visuals/data";

/**
 * 11 · 卷积 — Act A: the 3×3 window carried from chapter 10 zooms out to the digit it came from, and the image is
 * flattened into one long strip: pixels that were vertical neighbours end up 28 places apart. Act B: a 3×3 kernel
 * slides over the image; every stop is nine multiplications and a sum, and the sums build a feature map (real
 * numbers throughout). Act C: several kernels, several maps — and the parameter count against a dense layer.
 * Act D: the kernels of a real (tiny) trained CNN, from noise to edge detectors, and the maps they make of the '7'.
 * Carry in: the 3×3 window. Carry out: eight feature maps that reflow into a row of word tokens.
 */
const CH = chapterById("conv");
const DUR = CH.dur / FPS;
const IMG = heroImage();
const PR = WIN_PATCH.r;
const PC = WIN_PATCH.c;
const IM = { x: 150, y: 128, S: 12 };
const N_OUT = SIDE * SIDE;

const T = {
  zoom: [0.6, 3.4] as const,
  strip: 4.0,
  connect: 5.4,
  stripOut: [9.0, 10.0] as const,
  panel: 9.8,
  first: 12.4,
  glide: [12.4, 13.6] as const,
  scan: [13.8, 20.2] as const,
  pairs: [20.6, 22.6] as const,
  extra: [21.4, 22.0, 22.6],
  params: 24.6,
  actC: [29.0, 30.0] as const,
  train: [30.2, 34.8] as const,
  tokens: [36.4, 37.8] as const,
};

// ---------------------------------------------------------------------------------- shared drawing
const KH = [1, 1, 1, 0, 0, 0, -1, -1, -1];
const VAL_MAX = 3;

const gridCol = (v: number, max: number) => diverging(clamp(v / max, -1, 1));
const map = (img: ArrayLike<number>, w: ArrayLike<number>, relu = false): Float32Array => {
  const m = convolve(img, w);
  if (relu) for (let i = 0; i < m.length; i++) if (m[i] < 0) m[i] = 0;
  return m;
};

/** A 3×3 kernel as coloured cells (orange negative, cyan positive), optionally with its numbers. */
function drawKernel(ctx: CanvasRenderingContext2D, cx: number, cy: number, cell: number, w: ArrayLike<number>, o: { alpha?: number; numbers?: boolean; max?: number; digits?: number } = {}) {
  const a = o.alpha ?? 1;
  if (a < 0.004) return;
  const max = o.max ?? Math.max(...Array.from(w, Math.abs), 1e-6);
  for (let i = 0; i < 9; i++) {
    const x = cx + ((i % 3) - 1.5) * cell;
    const y = cy + (Math.floor(i / 3) - 1.5) * cell;
    rrect(ctx, x + 1, y + 1, cell - 2, cell - 2, Math.min(5, cell * 0.16), { fill: rgba(gridCol(w[i], max)), stroke: "rgba(255,255,255,0.16)", lw: 1, alpha: a });
    if (o.numbers) text(ctx, w[i] === 0 ? "0" : fmt(w[i], o.digits ?? 0), x + cell / 2, y + cell / 2 + cell * 0.11, { size: cell * 0.34, weight: 700, color: C.text, align: "center", font: "mono", alpha: a });
  }
  rrect(ctx, cx - cell * 1.5 - 3, cy - cell * 1.5 - 3, cell * 3 + 6, cell * 3 + 6, 8, { stroke: "rgba(255,255,255,0.5)", lw: 1.6, alpha: a });
}

/** The image as a grid of grey cells at (x, y) with cell size s, and its frame. */
function drawImage(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number) {
  if (alpha < 0.004) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  heatmap(ctx, IMG, 28, 28, x, y, 28 * s, 28 * s, grey);
  rrect(ctx, x - 1, y - 1, 28 * s + 2, 28 * s + 2, 3, { stroke: "rgba(255,255,255,0.28)", lw: 1 });
  ctx.restore();
}

/** Window frame over the image at cell (r, c). */
function frame(ctx: CanvasRenderingContext2D, x0: number, y0: number, s: number, r: number, c: number, alpha: number, color = "#ffffff") {
  rrect(ctx, x0 + c * s - 1, y0 + r * s - 1, 3 * s + 2, 3 * s + 2, 3, { stroke: color, lw: 2.2, alpha });
}

// ---------------------------------------------------------------------------------- Act A
function imagePose(t: number) {
  const e = ease.inOut(seg(t, T.zoom[0], T.zoom[1], ease.linear));
  const S = Math.exp(lerp(Math.log(WIN3.cell), Math.log(IM.S), e));
  const P0 = { x: WIN3.cx - 1.5 * WIN3.cell, y: WIN3.cy - 1.5 * WIN3.cell };
  const P1 = { x: IM.x + PC * IM.S, y: IM.y + PR * IM.S };
  const P = { x: lerp(P0.x, P1.x, e), y: lerp(P0.y, P1.y, e) };
  return { x: P.x - PC * S, y: P.y - PR * S, S, wx: P.x, wy: P.y };
}

const STRIP = { x: 90, y: 500, w: 1100, h: 26 };
const stripX = (i: number) => STRIP.x + ((i + 0.5) / 784) * STRIP.w;

function drawStrip(ctx: CanvasRenderingContext2D, t: number) {
  const a = seg(t, T.strip, T.strip + 0.6, ease.out) * (1 - seg(t, T.stripOut[0], T.stripOut[1], ease.inOutSine));
  if (a < 0.004) return;
  const draw = seg(t, T.strip, T.strip + 1.6, ease.inOut);
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.beginPath();
  ctx.rect(STRIP.x, STRIP.y - 2, STRIP.w * draw, STRIP.h + 4);
  ctx.clip();
  heatmap(ctx, IMG, 784, 1, STRIP.x, STRIP.y, STRIP.w, STRIP.h, grey);
  ctx.restore();
  rrect(ctx, STRIP.x - 1, STRIP.y - 1, STRIP.w + 2, STRIP.h + 2, 3, { stroke: "rgba(255,255,255,0.28)", lw: 1, alpha: a * draw });
  text(ctx, "784 个数，排成一条线", STRIP.x, STRIP.y + STRIP.h + 24, { size: 15, weight: 500, color: C.dim, font: "cjk", alpha: a * draw });
  // the nine window pixels and where they land
  const cA = seg(t, T.connect, T.connect + 1.6, ease.inOut) * a;
  if (cA > 0.01) {
    ctx.save();
    ctx.strokeStyle = rgba(RGB_NEG, 0.85);
    ctx.lineWidth = 1.6;
    ctx.globalAlpha *= cA;
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        const i = (PR + dr) * 28 + PC + dc;
        const x1 = IM.x + (PC + dc + 0.5) * IM.S;
        const y1 = IM.y + (PR + dr + 0.5) * IM.S;
        const x2 = stripX(i);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(x1, y1 + 100, x2, STRIP.y - 110, x2, STRIP.y);
        ctx.stroke();
        circle(ctx, x2, STRIP.y + STRIP.h / 2, 2.6, { fill: C.neg });
      }
    }
    ctx.restore();
    const lab = seg(t, T.connect + 1.4, T.connect + 2.2, ease.out) * a;
    for (let g = 0; g < 2; g++) {
      const xa = stripX((PR + g) * 28 + PC + 1);
      const xb = stripX((PR + g + 1) * 28 + PC + 1);
      line(ctx, xa, STRIP.y + STRIP.h + 6, xb, STRIP.y + STRIP.h + 6, { color: rgba(RGB_NEG, 0.8), lw: 1.6, alpha: lab });
      line(ctx, xa, STRIP.y + STRIP.h + 2, xa, STRIP.y + STRIP.h + 10, { color: rgba(RGB_NEG, 0.8), lw: 1.4, alpha: lab });
      line(ctx, xb, STRIP.y + STRIP.h + 2, xb, STRIP.y + STRIP.h + 10, { color: rgba(RGB_NEG, 0.8), lw: 1.4, alpha: lab });
    }
    const xm = stripX((PR + 1) * 28 + PC + 1);
    text(ctx, "上下相邻的像素，被拉开了 28 格", xm, STRIP.y + STRIP.h + 34, { size: 16, weight: 700, color: C.neg, align: "center", font: "cjk", alpha: lab });
  }
}

// ---------------------------------------------------------------------------------- Act B: the sliding kernel
const FM = { x: 880, y: 146, cell: 10 };
const PAN = { x: 640, yWin: 226, yKer: 392, cell: 44 };

/** Window position (cell coordinates of its top-left) and how many output cells are done at time t. */
function scanState(t: number) {
  if (t < T.glide[0]) return { r: PR, c: PC, n: -1, done: [PR * SIDE + PC] };
  if (t < T.glide[1]) {
    const e = ease.inOut(seg(t, T.glide[0], T.glide[1], ease.linear));
    return { r: lerp(PR, 0, e), c: lerp(PC, 0, e), n: -1, done: [PR * SIDE + PC] };
  }
  // through the empty top rows quickly, slowly along the bar of the 7 (where the sums are interesting), then a sweep
  const n = keyframes(
    t,
    [
      [T.glide[1], 0],
      [T.scan[0] + 0.5, 118],
      [T.scan[0] + 2.4, 196],
      [T.scan[0] + 3.8, 330],
      [T.scan[0] + 5.2, 560],
      [T.scan[1], N_OUT - 1],
    ],
    ease.linear,
  );
  const i = Math.floor(clamp(n, 0, N_OUT - 1));
  return { r: Math.floor(i / SIDE), c: i % SIDE, n: i, done: [PR * SIDE + PC] };
}

function windowValues(r: number, c: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out.push(IMG[(r + i) * 28 + c + j]);
  return out;
}

const FMAP = map(IMG, KH);

function drawFeatureMap(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, upTo: number, extra: number[], alpha: number, w?: ArrayLike<number>, max = VAL_MAX) {
  if (alpha < 0.004) return;
  const m = w ? map(IMG, w) : FMAP;
  ctx.save();
  ctx.globalAlpha *= alpha;
  rrect(ctx, x - 1, y - 1, SIDE * cell + 2, SIDE * cell + 2, 3, { fill: "#0c1118", stroke: "rgba(255,255,255,0.22)", lw: 1 });
  for (let i = 0; i < N_OUT; i++) {
    if (i > upTo && !extra.includes(i)) continue;
    ctx.fillStyle = rgba(gridCol(m[i], max));
    ctx.fillRect(x + (i % SIDE) * cell, y + Math.floor(i / SIDE) * cell, cell + 0.4, cell + 0.4);
  }
  ctx.restore();
}

function drawActB(ctx: CanvasRenderingContext2D, t: number) {
  const a = seg(t, T.panel, T.panel + 0.8, ease.out) * (1 - seg(t, T.pairs[0] + 1.2, T.pairs[1], ease.inOutSine));
  if (a < 0.004) return;
  const st = scanState(t);
  const r = Math.round(st.r);
  const c = Math.round(st.c);
  // frame on the image
  frame(ctx, IM.x, IM.y, IM.S, st.r, st.c, a);
  // magnifier lines from the frame to the panel
  const fx = IM.x + (st.c + 3) * IM.S;
  const fy0 = IM.y + st.r * IM.S;
  const fy1 = IM.y + (st.r + 3) * IM.S;
  const px = PAN.x - 1.5 * PAN.cell - 4;
  line(ctx, fx, fy0, px, PAN.yWin - 1.5 * PAN.cell - 4, { color: "rgba(255,255,255,0.22)", lw: 1, alpha: a });
  line(ctx, fx, fy1, px, PAN.yWin + 1.5 * PAN.cell + 4, { color: "rgba(255,255,255,0.22)", lw: 1, alpha: a });

  // window values × kernel = sum
  const wv = windowValues(r, c);
  const sum = wv.reduce((s, v, i) => s + v * KH[i], 0);
  // the carried window is the panel's first content: same cells, same numbers
  drawWin3Values(ctx, PAN.x, PAN.yWin, PAN.cell, wv, a);
  text(ctx, "×", PAN.x, (PAN.yWin + PAN.yKer) / 2 + 12, { size: 34, weight: 500, color: C.dim, align: "center", font: "sans", alpha: a });
  const kA = seg(t, T.panel + 0.6, T.panel + 1.4, ease.out) * a;
  drawKernel(ctx, PAN.x, PAN.yKer, PAN.cell, KH, { alpha: kA, numbers: true, max: 1 });
  text(ctx, "卷积核（9 个权重）", PAN.x, PAN.yKer + 1.5 * PAN.cell + 30, { size: 15, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: kA });
  const sA = seg(t, T.panel + 1.4, T.panel + 2.2, ease.out) * a;
  text(ctx, "对应相乘，再加起来", PAN.x, PAN.yWin - 1.5 * PAN.cell - 22, { size: 15, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: sA });
  text(ctx, `= ${fmt(sum, 2)}`, PAN.x, PAN.yKer + 1.5 * PAN.cell + 68, { size: 30, weight: 700, color: sum >= 0 ? C.pos : C.neg, align: "center", font: "mono", alpha: sA });

  // feature map
  const mA = seg(t, T.panel + 1.6, T.panel + 2.4, ease.out) * a;
  const upTo = st.n < 0 ? -1 : st.n;
  drawFeatureMap(ctx, FM.x, FM.y, FM.cell, upTo, st.done, mA);
  text(ctx, "特征图", FM.x, FM.y - 12, { size: 15, weight: 500, color: C.dim, font: "cjk", alpha: mA });
  // the output cell being written
  const oi = st.n >= 0 ? st.n : PR * SIDE + PC;
  circle(ctx, FM.x + ((oi % SIDE) + 0.5) * FM.cell, FM.y + (Math.floor(oi / SIDE) + 0.5) * FM.cell, 7, { stroke: "#ffffff", lw: 2, alpha: mA });
}

/** The 3×3 window with the pixel values of the current position on its cells. */
function drawWin3Values(ctx: CanvasRenderingContext2D, cx: number, cy: number, cell: number, vals: number[], alpha: number) {
  for (let i = 0; i < 9; i++) {
    const x = cx + ((i % 3) - 1.5) * cell;
    const y = cy + (Math.floor(i / 3) - 1.5) * cell;
    rrect(ctx, x + 1, y + 1, cell - 2, cell - 2, 6, { fill: rgba(grey(vals[i])), stroke: "rgba(255,255,255,0.18)", lw: 1, alpha });
    text(ctx, vals[i].toFixed(1), x + cell / 2, y + cell / 2 + cell * 0.11, { size: cell * 0.32, weight: 700, color: vals[i] > 0.55 ? "#0b0e14" : C.text, align: "center", font: "mono", alpha });
  }
  rrect(ctx, cx - cell * 1.5 - 3, cy - cell * 1.5 - 3, cell * 3 + 6, cell * 3 + 6, 8, { stroke: "rgba(255,255,255,0.9)", lw: 2, alpha });
}

// ---------------------------------------------------------------------------------- Act C: four kernels, and the count
const PAIR = [
  { key: "horizontal", ...HAND.horizontal, w: KH },
  { key: "vertical", ...HAND.vertical, w: [1, 0, -1, 1, 0, -1, 1, 0, -1] },
  { key: "diagonal", ...HAND.diagonal, w: [0, 1, 1, -1, 0, 1, -1, -1, 0] },
  { key: "blur", ...HAND.blur, w: [1, 1, 1, 1, 1, 1, 1, 1, 1].map((v) => v / 3) },
];
const PG = { x: 548, y: 104, dx: 332, dy: 200 };
const pairPos = (k: number) => ({ x: PG.x + (k % 2) * PG.dx, y: PG.y + Math.floor(k / 2) * PG.dy });

function drawActC(ctx: CanvasRenderingContext2D, t: number) {
  const e = seg(t, T.pairs[0], T.pairs[1], ease.inOut);
  const a = seg(t, T.pairs[0], T.pairs[0] + 0.4, ease.linear) * (1 - seg(t, T.actC[0] - 0.6, T.actC[0] + 0.4, ease.inOutSine));
  if (a < 0.004) return;
  const cellK = 21;
  const cellM = 5.6;
  PAIR.forEach((p, k) => {
    const pos = pairPos(k);
    const appear = k === 0 ? 1 : seg(t, T.extra[k - 1], T.extra[k - 1] + 0.7, ease.out);
    if (appear < 0.004) return;
    // pair 0 grows out of the panel of act B
    const kx = k === 0 ? lerp(PAN.x, pos.x + 42, e) : pos.x + 42;
    const ky = k === 0 ? lerp(PAN.yKer, pos.y + 66, e) : pos.y + 66;
    const kc = k === 0 ? lerp(PAN.cell, cellK, e) : cellK;
    drawKernel(ctx, kx, ky, kc, p.w, { alpha: a * appear, numbers: k === 0 && e < 0.55, max: k === 3 ? 0.34 : 1 });
    const mx = k === 0 ? lerp(FM.x, pos.x + 108, e) : pos.x + 108;
    const my = k === 0 ? lerp(FM.y, pos.y + 4, e) : pos.y + 4;
    const mc = k === 0 ? lerp(FM.cell, cellM, e) : cellM;
    drawFeatureMap(ctx, mx, my, mc, N_OUT, [], a * appear, p.w, k === 3 ? 1 : VAL_MAX);
    text(ctx, p.name, pos.x + 42, pos.y + 4 + 26 * cellM + 22, { size: 15, weight: 600, color: C.text, align: "center", font: "cjk", alpha: a * appear * e });
  });
  // the count
  const pa = seg(t, T.params, T.params + 0.8, ease.out) * a;
  if (pa > 0.004) {
    const dense = 784 * SIDE * SIDE;
    text(ctx, "9", 700, 536, { size: 40, weight: 700, color: C.pos, align: "right", font: "mono", alpha: pa });
    text(ctx, "个权重 —— 一个卷积核，扫过整张图", 712, 536, { size: 18, weight: 500, color: C.text, font: "cjk", alpha: pa });
    const pb = seg(t, T.params + 1.2, T.params + 2.0, ease.out) * a;
    text(ctx, thousands(dense), 700, 572, { size: 30, weight: 700, color: C.neg, align: "right", font: "mono", alpha: pb });
    text(ctx, "个权重 —— 同样输出 26×26 的图，用全连接层", 712, 572, { size: 18, weight: 500, color: C.dim, font: "cjk", alpha: pb });
  }
}

// ---------------------------------------------------------------------------------- Act D: learned kernels
const TILE = { cell: 38, gap: 16 };
const tileX = (k: number) => 640 - (K * (TILE.cell * 3) + (K - 1) * TILE.gap) / 2 + k * (TILE.cell * 3 + TILE.gap);
const TILE_Y = 210;
const MAP_Y = 348;

const kAt = (t: number) => (N_SNAP - 1) * Math.pow(seg(t, T.train[0], T.train[1], ease.linear), 0.72);

function drawActD(ctx: CanvasRenderingContext2D, t: number) {
  const a = seg(t, T.actC[0] + 0.4, T.actC[1] + 0.6, ease.out);
  if (a < 0.004) return;
  const k = kAt(t);
  const morph = ease.inOut(seg(t, T.tokens[0], T.tokens[1], ease.linear));
  const tileA = a * (1 - seg(morph, 0, 0.45, ease.out));
  const kernels = Array.from({ length: K }, (_, i) => kernelAt(k, i));
  const kmax = Math.max(...kernels.flat().map(Math.abs), 1e-6);
  const chips = tokenRects();
  for (let i = 0; i < K; i++) {
    const x0 = tileX(i);
    const cx = x0 + TILE.cell * 1.5;
    drawKernel(ctx, cx, TILE_Y + TILE.cell * 1.5, TILE.cell, kernels[i], { alpha: tileA, max: kmax });
    text(ctx, String(i + 1), cx, TILE_Y - 14, { size: 14, weight: 600, color: C.faint, align: "center", font: "mono", alpha: tileA });
    // the map of the hero '7' through the learned kernel (ReLU)
    const m = convolve(IMG, kernels[i], biasAt(k, i));
    for (let j = 0; j < m.length; j++) if (m[j] < 0) m[j] = 0;
    let mm = 0;
    for (let j = 0; j < m.length; j++) mm = Math.max(mm, m[j]);
    mm = Math.max(mm, 0.25);
    const mapA = seg(t, T.train[0] + 0.4, T.train[0] + 1.4, ease.out) * a;
    // rectangle of the map: from tile-wide square to its token chip
    const chip = chips[i];
    const rx = lerp(x0, chip.x, morph);
    const ry = lerp(MAP_Y, chip.y, morph);
    const rw = lerp(TILE.cell * 3, chip.w, morph);
    const rh = lerp(TILE.cell * 3, chip.h, morph);
    const content = mapA * (1 - seg(morph, 0.1, 0.7, ease.out));
    if (content > 0.004) {
      ctx.save();
      ctx.globalAlpha *= content;
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.clip();
      // draw the map stretched into the (shrinking) rectangle
      const cw = rw / SIDE;
      const ch = rh / SIDE;
      for (let j = 0; j < N_OUT; j++) {
        const v = Math.pow(clamp(m[j] / mm), 1.25) * 0.82;
        if (v < 0.02) continue;
        const col = mixRGB([14, 20, 30], RGB_POS, v);
        ctx.fillStyle = rgba(col);
        ctx.fillRect(rx + (j % SIDE) * cw, ry + Math.floor(j / SIDE) * ch, cw + 0.4, ch + 0.4);
      }
      ctx.restore();
    }
    const plate = mapA * (1 - morph * 0.0);
    rrect(ctx, rx, ry, rw, rh, lerp(4, 14, morph), { fill: `rgba(14,18,24,${morph})`, stroke: `rgba(255,255,255,${lerp(0.22, 0.3, morph)})`, lw: lerp(1, 1.5, morph), alpha: Math.max(plate, morph) * a });
    if (morph > 0.35) text(ctx, chip.label, rx + rw / 2, ry + rh / 2 + 8, { size: 24, weight: 600, color: C.text, align: "center", font: "cjk", alpha: seg(morph, 0.6, 1, ease.out) * a });
  }
  // read-outs
  const step = Math.round(statAt(STEP_OF, k));
  const ro = a * (1 - seg(morph, 0, 0.3, ease.out));
  text(ctx, "训练中的 8 个卷积核", 640 - (K * TILE.cell * 3 + (K - 1) * TILE.gap) / 2, 132, { size: 17, weight: 500, color: C.dim, font: "cjk", alpha: ro });
  text(ctx, `第 ${thousands(step)} 步`, 1140, 126, { size: 22, weight: 700, color: C.text, align: "right", font: "mono", alpha: ro });
  text(ctx, `损失 ${fmt(statAt(LOSS, k), 3)}  ·  正确率 ${Math.round(statAt(ACC, k) * 100)}%`, 1140, 152, { size: 15, weight: 500, color: C.dim, align: "right", font: "mono", alpha: ro });
  text(ctx, "同一张 7，经过每个卷积核之后：", 640 - (K * TILE.cell * 3 + (K - 1) * TILE.gap) / 2, MAP_Y - 12, { size: 15, weight: 500, color: C.dim, font: "cjk", alpha: ro * seg(t, T.train[0] + 0.6, T.train[0] + 1.6, ease.out) });
}

// ---------------------------------------------------------------------------------- scene
function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  if (t < 0 || t >= DUR + 0.001) return;

  // the image (Acts A–C) and the window that grew out of chapter 10's carry
  const pose = imagePose(t);
  const imgA = seg(t, 0.5, 1.7, ease.out) * (1 - seg(t, T.actC[0] - 0.6, T.actC[0] + 0.4, ease.inOutSine));
  drawImage(ctx, pose.x, pose.y, pose.S, imgA);
  // the window itself: drawn from t = 0 so the hand-off is the same picture
  const winA = 1 - seg(t, T.panel - 0.2, T.panel + 0.5, ease.inOutSine);
  if (winA > 0.004) {
    const cellW = pose.S;
    drawWin3(ctx, pose.wx + 1.5 * cellW, pose.wy + 1.5 * cellW, cellW, winA, cellW > 30);
  }
  drawStrip(ctx, t);
  drawActB(ctx, t);
  drawActC(ctx, t);
  drawActD(ctx, t);
}

export const Ch11Conv: React.FC = () => (
  <>
    <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} />
    <ChapterCard />
    <Captions />
  </>
);
