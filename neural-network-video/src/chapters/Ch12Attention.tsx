import { Canvas } from "../lib/canvas";
import { diverging, rgba } from "../lib/color";
import { arrow, circle, glow, line, rrect, text } from "../lib/draw";
import { clamp, ease, fmt, lerp, seg } from "../lib/math";
import { chapterClock, useChapterClock } from "../lib/time";
import { C, FPS, RGB_NEG, RGB_POS } from "../theme";
import { chapterById } from "../timeline";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { ParamCounter } from "../ui/ParamCounter";
import { TOKENS, TOKEN_ROW, drawTokenChip, tokenRects } from "../visuals/carry";
import { ATT, KEYS, N_TOK, Q, QUERY, ROUNDS, V, dot, mix, scores } from "../visuals/attention";

/**
 * 12 · 注意力 — the row of tokens (carried from chapter 11) gets a vector per token; the token "它" asks
 * "who am I?": similarity to every earlier token's key, a softmax, arcs whose thickness is the weight; then the
 * weighted sum of the values makes a new "它" that carries "猫" inside it. The whole matrix; then a language model
 * repeating one move — predict the next token — and the probabilities collapsing into the parameter counter.
 * The 4-D toy head is real arithmetic on hand-set / fitted vectors (labelled "示意" on screen).
 */
const CH = chapterById("attention");
const DUR = CH.dur / FPS;
const RECTS = tokenRects();
const CHIP_Y = 172;
const MONO = "mono" as const;

const T = {
  move: [1.0, 2.4] as const,
  vec: 2.8,
  query: 9.2,
  keys: 11.0,
  score: 12.4,
  soft: 14.2,
  arcs: [14.6, 16.4] as const,
  values: 18.0,
  sum: [19.6, 22.6] as const,
  matrixIn: [23.4, 24.4] as const,
  matrixOut: [27.0, 27.9] as const,
  round0: 28.8,
  roundLen: 2.7,
  collapse: [39.6, 41.6] as const,
};

const dy = (t: number) => lerp(0, CHIP_Y - TOKEN_ROW.y, ease.inOut(seg(t, T.move[0], T.move[1], ease.linear)));

// ---------------------------------------------------------------------------------- helpers
const VMAX_V = 1;
const VMAX_QK = Math.max(...Q.flat().map(Math.abs), ...KEYS.flat().map(Math.abs));

/** A 4-cell vertical vector under/over a chip. */
function drawVec(ctx: CanvasRenderingContext2D, cx: number, top: number, v: number[], alpha: number, max: number, o: { w?: number; h?: number; ring?: string } = {}) {
  if (alpha < 0.004) return;
  const w = o.w ?? 30;
  const h = o.h ?? 17;
  for (let d = 0; d < v.length; d++) {
    rrect(ctx, cx - w / 2, top + d * (h + 3), w, h, 4, { fill: rgba(diverging(clamp(v[d] / max, -1, 1))), stroke: "rgba(255,255,255,0.14)", lw: 1, alpha });
  }
  if (o.ring) rrect(ctx, cx - w / 2 - 4, top - 4, w + 8, v.length * (h + 3) + 5, 7, { stroke: o.ring, lw: 1.6, alpha });
}

const cxOf = (j: number) => RECTS[j].x + RECTS[j].w / 2;

// ---------------------------------------------------------------------------------- Acts A–C: one query
function drawRow(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha < 0.004) return;
  const off = dy(t);
  const y = TOKEN_ROW.y + off;
  const vTop = y + TOKEN_ROW.h + 16;
  const qOn = seg(t, T.query, T.query + 0.8, ease.out);
  const kMix = seg(t, T.keys, T.keys + 0.9, ease.inOutSine) * (1 - seg(t, T.values, T.values + 0.9, ease.inOutSine));
  const vMix = 1 - kMix;
  const sc = seg(t, T.score, T.score + 1.2, ease.out);
  const so = seg(t, T.soft, T.soft + 1.2, ease.out);
  const arcs = seg(t, T.arcs[0], T.arcs[1], ease.inOut);
  const sumP = seg(t, T.sum[0], T.sum[1], ease.inOut);
  const w = ATT[QUERY];
  const s = scores(QUERY);

  // chips
  RECTS.forEach((r, j) => {
    const attended = j <= QUERY ? w[j] : 0;
    const isQ = j === QUERY;
    const lit = arcs * attended;
    if (lit > 0.05) glow(ctx, r.x + r.w / 2, y + r.h / 2, 60 + 80 * lit, RGB_POS, 0.12 + 0.4 * lit);
    drawTokenChip(ctx, { ...r, y }, alpha, {
      stroke: isQ && qOn > 0.02 ? rgba(RGB_POS, 0.35 + 0.65 * qOn) : lit > 0.03 ? rgba(RGB_POS, 0.3 + 0.7 * lit) : "rgba(255,255,255,0.3)",
    });
  });
  // row labels (left)
  text(ctx, "token", RECTS[0].x - 22, y + TOKEN_ROW.h / 2 + 5, { size: 15, weight: 500, color: C.dim, align: "right", font: "mono", alpha: alpha * seg(t, T.move[1], T.move[1] + 0.6, ease.out) });

  // vectors: values, later keys
  RECTS.forEach((r, j) => {
    const a = alpha * seg(t, T.vec + j * 0.16, T.vec + j * 0.16 + 0.7, ease.out);
    if (a < 0.004) return;
    const cx = r.x + r.w / 2;
    drawVec(ctx, cx, vTop + (1 - seg(t, T.vec + j * 0.16, T.vec + j * 0.16 + 0.7, ease.out)) * 10, V[j], a * vMix, VMAX_V);
    drawVec(ctx, cx, vTop, KEYS[j], a * kMix * (j <= QUERY ? 1 : 0.25), VMAX_QK);
  });
  const rowLabelA = alpha * seg(t, T.vec + 0.3, T.vec + 1.2, ease.out);
  text(ctx, vMix > 0.5 ? "一串数字" : "标签 K", RECTS[0].x - 22, vTop + 42, { size: 15, weight: 500, color: vMix > 0.5 ? C.dim : C.pos, align: "right", font: "cjk", alpha: rowLabelA });

  // the query
  if (qOn > 0.01) {
    const qx = RECTS[QUERY].x + RECTS[QUERY].w / 2;
    text(ctx, "它在问：我指的是谁？", qx, y - 20, { size: 17, weight: 700, color: C.pos, align: "center", font: "cjk", alpha: alpha * qOn * (1 - seg(t, T.arcs[0] - 0.4, T.arcs[0] + 0.5, ease.out)) });
    // Q vector sits to the right of the row
    const qX = RECTS[N_TOK - 1].x + RECTS[N_TOK - 1].w + 76;
    drawVec(ctx, qX, vTop, Q[QUERY], alpha * qOn * (1 - sumP), VMAX_QK, { ring: rgba(RGB_POS, 0.9) });
    text(ctx, "它的问题 Q", qX, vTop + 4 * 20 + 20, { size: 14, weight: 600, color: C.pos, align: "center", font: "cjk", alpha: alpha * qOn * (1 - sumP) });
  }

  // similarity scores, weights, arcs
  RECTS.forEach((r, j) => {
    if (j > QUERY) return;
    const cx = r.x + r.w / 2;
    const base = vTop + 4 * 20 + 14;
    if (sc > 0.01) {
      text(ctx, fmt(s[j], 1), cx, base + 6, { size: 15, weight: 600, color: s[j] > 1 ? C.pos : C.dim, align: "center", font: MONO, alpha: alpha * sc * (1 - so * 0.55) * (1 - sumP * 0.7) });
    }
    if (so > 0.01) {
      // vertical bar of the weight (grows up from a baseline) + percentage
      const bh = w[j] * 76 * so;
      const by = base + 100;
      rrect(ctx, cx - 11, by - bh, 22, bh, 4, { fill: rgba(RGB_POS, 0.25 + 0.7 * w[j]), alpha: alpha * (1 - sumP * 0.5) });
      text(ctx, `${Math.round(w[j] * 100)}%`, cx, by + 20, { size: 16, weight: 700, color: w[j] > 0.15 ? C.pos : C.dim, align: "center", font: MONO, alpha: alpha * so * (1 - sumP * 0.5) });
    }
  });
  if (sc > 0.01) text(ctx, "相似度  Q · K", RECTS[0].x - 22, vTop + 4 * 20 + 20, { size: 14, weight: 500, color: C.dim, align: "right", font: "cjk", alpha: alpha * sc * (1 - sumP) });
  if (so > 0.01) text(ctx, "关注度", RECTS[0].x - 22, vTop + 4 * 20 + 14 + 100 - 10, { size: 14, weight: 500, color: C.dim, align: "right", font: "cjk", alpha: alpha * so * (1 - sumP) });

  // arcs above the row: from 它 to every token it looks at
  if (arcs > 0.01) {
    const x0 = cxOf(QUERY);
    for (let j = 0; j <= QUERY; j++) {
      if (j === QUERY) continue;
      const x1 = cxOf(j);
      const wj = w[j] * arcs;
      const lift = 24 + Math.abs(x0 - x1) * 0.15;
      ctx.beginPath();
      ctx.moveTo(x0, y - 4);
      ctx.quadraticCurveTo((x0 + x1) / 2, y - 4 - lift, x1, y - 4);
      ctx.strokeStyle = rgba(RGB_POS, 0.25 + 0.7 * w[j]);
      ctx.lineWidth = 1 + 15 * wj;
      ctx.lineCap = "round";
      ctx.globalAlpha *= 1;
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * alpha * clamp(arcs * 1.4);
      ctx.stroke();
      ctx.restore();
    }
  }

  // weighted sum: value vectors slide down and blend into a new vector under 它
  if (sumP > 0.001) {
    const resX = cxOf(QUERY);
    const resTop = vTop + 4 * 20 + 14 + 128;
    for (let j = 0; j <= QUERY; j++) {
      if (w[j] < 0.02) continue;
      const cx = cxOf(j);
      const e = ease.inOut(clamp(sumP * 1.15 - (1 - w[j]) * 0.12));
      const px = lerp(cx, resX, e);
      const py = lerp(vTop, resTop, e);
      drawVec(ctx, px, py, V[j].map((v) => v * (0.25 + 0.75 * w[j])), alpha * (0.35 + 0.65 * w[j]) * (1 - seg(sumP, 0.85, 1, ease.out) * 0.9), VMAX_V, { h: 17 });
    }
    const done = seg(sumP, 0.8, 1, ease.out);
    if (done > 0.01) {
      drawVec(ctx, resX, resTop, mix(QUERY), alpha * done, VMAX_V, { ring: rgba(RGB_POS, 0.9) });
      text(ctx, "新的「它」", resX - 40, resTop + 40, { size: 17, weight: 700, color: C.pos, align: "right", font: "cjk", alpha: alpha * done });
      text(ctx, "已经带着「猫」的信息", resX - 40, resTop + 62, { size: 14, weight: 500, color: C.dim, align: "right", font: "cjk", alpha: alpha * done });
      // its own recipe
      const terms = w
        .map((v, j) => ({ v, j }))
        .filter((o) => o.v > 0.05)
        .sort((a, b) => b.v - a.v)
        .slice(0, 3)
        .map((o) => `${o.v.toFixed(2)}×${TOKENS[o.j]}`)
        .join(" + ");
      text(ctx, terms + " …", resX + 46, resTop + 44, { size: 15, weight: 600, color: C.text, font: MONO, alpha: alpha * done });
    }
  }
  void arrow;
  void dot;
}

// ---------------------------------------------------------------------------------- the matrix
function drawMatrix(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha < 0.004) return;
  const cell = 42;
  const x0 = 640 - (N_TOK * cell) / 2 + 30;
  const y0 = 158;
  text(ctx, "每个词都这样算一遍：", 640, 112, { size: 19, weight: 600, color: C.text, align: "center", font: "cjk", alpha });
  for (let j = 0; j < N_TOK; j++) text(ctx, TOKENS[j], x0 + (j + 0.5) * cell, y0 - 10, { size: 15, weight: 500, color: C.dim, align: "center", font: "cjk", alpha });
  for (let i = 0; i < N_TOK; i++) {
    text(ctx, TOKENS[i], x0 - 12, y0 + (i + 0.5) * cell + 5, { size: 16, weight: i === QUERY ? 700 : 500, color: i === QUERY ? C.pos : C.dim, align: "right", font: "cjk", alpha });
    for (let j = 0; j < N_TOK; j++) {
      const v = ATT[i][j];
      const a = seg(t, T.matrixIn[0] + 0.3 + i * 0.08 + j * 0.02, T.matrixIn[0] + 0.9 + i * 0.08 + j * 0.02, ease.out);
      const masked = j > i;
      rrect(ctx, x0 + j * cell + 1.5, y0 + i * cell + 1.5, cell - 3, cell - 3, 5, {
        fill: masked ? "rgba(255,255,255,0.03)" : rgba([14 + (76 - 14) * Math.pow(v, 0.6), 20 + (201 - 20) * Math.pow(v, 0.6), 30 + (240 - 30) * Math.pow(v, 0.6)] as [number, number, number]),
        stroke: "rgba(255,255,255,0.08)",
        lw: 1,
        alpha: alpha * a,
      });
      if (!masked && v >= 0.12) text(ctx, `${Math.round(v * 100)}`, x0 + (j + 0.5) * cell, y0 + (i + 0.5) * cell + 5, { size: 13, weight: 700, color: v > 0.5 ? "#06131a" : C.text, align: "center", font: MONO, alpha: alpha * a });
    }
  }
  const hl = seg(t, T.matrixIn[0] + 1.6, T.matrixIn[0] + 2.2, ease.out);
  rrect(ctx, x0 - 2, y0 + QUERY * cell - 1, N_TOK * cell + 4, cell + 2, 6, { stroke: C.pos, lw: 2.2, alpha: alpha * hl });
  text(ctx, "行：提问的词　　列：被关注的词　　只看前面的词（灰色为看不到的部分）", 640, y0 + N_TOK * cell + 30, { size: 14, weight: 500, color: C.dim, align: "center", font: "cjk", alpha: alpha * seg(t, T.matrixIn[0] + 1.0, T.matrixIn[0] + 1.8, ease.out) });
}

// ---------------------------------------------------------------------------------- next-token prediction
function rowLayout(count: number): { x: number; w: number }[] {
  const widths = (n: number) => (n < TOKENS.length ? RECTS[n].w : 36 * 2 + 26);
  const list: { x: number; w: number }[] = [];
  const full = Math.floor(count);
  const frac = count - full;
  let total = 0;
  for (let i = 0; i < full; i++) total += (i < RECTS.length ? RECTS[i].w : 98) + TOKEN_ROW.gap;
  total += frac * (98 + TOKEN_ROW.gap) - TOKEN_ROW.gap;
  let x = 640 - total / 2;
  for (let i = 0; i < full; i++) {
    const w = i < RECTS.length ? RECTS[i].w : 98;
    list.push({ x, w });
    x += w + TOKEN_ROW.gap;
  }
  void widths;
  return list;
}

const APPENDED: { t: string; w: number }[] = ROUNDS.map((r) => ({ t: r.picks[0].t, w: 36 * Array.from(r.picks[0].t).length + 26 }));

function drawPredict(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha < 0.004) return;
  const y = CHIP_Y;
  const rowFade = 1 - seg(t, T.collapse[0] + 0.3, T.collapse[1], ease.inOutSine);
  // how many rounds are complete (fractional while a chip is on its way)
  let count = TOKENS.length;
  for (let r = 0; r < ROUNDS.length; r++) count += seg(t, T.round0 + r * T.roundLen + 1.7, T.round0 + r * T.roundLen + 2.4, ease.inOut);
  // chip widths for the appended tokens
  const widthOf = (i: number) => (i < TOKENS.length ? RECTS[i].w : APPENDED[i - TOKENS.length].w);
  const full = Math.floor(count + 1e-6);
  const frac = count - full;
  let total = 0;
  for (let i = 0; i < full; i++) total += widthOf(i) + TOKEN_ROW.gap;
  if (full < TOKENS.length + ROUNDS.length && frac > 0) total += frac * (widthOf(full) + TOKEN_ROW.gap);
  total += 0; // the trailing gap is the room for the "?" chip
  const qW = 58;
  const totalWithQ = total + qW;
  let x = 640 - totalWithQ / 2;
  for (let i = 0; i < Math.ceil(count - 1e-6); i++) {
    const w = widthOf(i);
    const grow = i < full ? 1 : frac;
    const label = i < TOKENS.length ? TOKENS[i] : APPENDED[i - TOKENS.length].t;
    ctx.save();
    if (grow < 1) {
      ctx.beginPath();
      ctx.rect(x - 2, y - 4, w * grow + 4, TOKEN_ROW.h + 8);
      ctx.clip();
    }
    drawTokenChip(ctx, { x, y, w, h: TOKEN_ROW.h, label }, alpha * rowFade, { stroke: i >= TOKENS.length ? rgba(RGB_POS, 0.7) : undefined });
    ctx.restore();
    x += (w + TOKEN_ROW.gap) * grow;
  }
  // the "?" chip
  const lastDone = ROUNDS.length - 1;
  const allDone = t > T.round0 + lastDone * T.roundLen + 2.4;
  if (!allDone) {
    rrect(ctx, x, y, qW, TOKEN_ROW.h, 14, { stroke: "rgba(255,255,255,0.5)", lw: 1.6, alpha: alpha * rowFade });
    ctx.save();
    ctx.setLineDash([]);
    ctx.restore();
    text(ctx, "?", x + qW / 2, y + TOKEN_ROW.h / 2 + 9, { size: 28, weight: 700, color: C.text, align: "center", font: "sans", alpha: alpha * rowFade });
  }

  // the candidate bars of the current round
  const r = clamp(Math.floor((t - T.round0) / T.roundLen), 0, ROUNDS.length - 1);
  const s = t - (T.round0 + r * T.roundLen);
  if (t >= T.round0 - 0.6 && !allDone) {
    const inA = seg(s, 0.0, 0.5, ease.out) * (1 - seg(s, 2.2, 2.6, ease.in));
    const picks = ROUNDS[r].picks;
    const bx = 470;
    text(ctx, "下一个 token 是什么？（示意）", bx, 304, { size: 17, weight: 600, color: C.dim, font: "cjk", alpha: alpha * seg(t, T.round0 - 0.6, T.round0, ease.out) * (1 - seg(t, T.collapse[0], T.collapse[0] + 0.6, ease.inOut)) });
    picks.forEach((p, i) => {
      const yy = 338 + i * 38;
      const grow = seg(s, 0.2 + i * 0.05, 1.0 + i * 0.05, ease.out);
      const top = i === 0;
      const chosen = top ? seg(s, 1.3, 1.7, ease.out) : 0;
      const col = top ? C.pos : C.dim;
      const cp = seg(t, T.collapse[0], T.collapse[1], ease.inOut);
      const fade = inA * (1 - seg(cp, 0.55, 1, ease.out));
      // the bars contract towards the spot where the parameter counter will stand
      const bxx = lerp(bx + 76, 900, cp);
      const byy = lerp(yy, 322, cp);
      const bw = lerp(360, 6, cp);
      text(ctx, p.t, lerp(bx + 60, 900, cp), byy + 6, { size: 20, weight: 700, color: top && chosen > 0.4 ? C.pos : C.text, align: "right", font: "cjk", alpha: alpha * fade * (1 - cp) });
      rrect(ctx, bxx, byy - 10, bw, 20, 5, { fill: "rgba(255,255,255,0.05)", alpha: alpha * fade });
      rrect(ctx, bxx, byy - 10, Math.max(4, bw * Math.min(1, p.p * grow * 1.9)), 20, 5, { fill: top ? rgba(RGB_POS, 0.55 + 0.4 * chosen) : "rgba(154,164,181,0.6)", alpha: alpha * fade });
      text(ctx, `${Math.round(p.p * 100 * grow)}%`, lerp(bx + 450, 900, cp), byy + 6, { size: 17, weight: 700, color: col, font: MONO, alpha: alpha * fade * (1 - cp) });
    });
  }
  void RGB_NEG;
  void circle;
}

// ---------------------------------------------------------------------------------- scene
function drawScene(ctx: CanvasRenderingContext2D, gf: number) {
  const c = chapterClock(gf, CH);
  const t = c.t;
  if (t < 0 || t >= DUR + 0.001) return;

  const rowA = 1 - seg(t, T.matrixIn[0] - 0.4, T.matrixIn[0] + 0.5, ease.inOutSine);
  drawRow(ctx, t, t < T.matrixIn[0] + 0.6 ? rowA : 0);
  const mA = seg(t, T.matrixIn[0], T.matrixIn[0] + 0.5, ease.out) * (1 - seg(t, T.matrixOut[0], T.matrixOut[1], ease.inOutSine));
  drawMatrix(ctx, t, mA);
  const pA = seg(t, T.matrixOut[0] + 0.2, T.matrixOut[1] + 0.4, ease.out);
  drawPredict(ctx, t, pA);
  // note
  const noteA = (seg(t, 3.4, 4.2, ease.out) * (1 - seg(t, 27.0, 27.6)) + seg(t, T.round0, T.round0 + 0.6) * (1 - seg(t, T.collapse[0], T.collapse[0] + 0.6))) * 0.9;
  text(ctx, "（示意：为讲解手工设定的小例子，运算是真的）", 640, 584, { size: 14, weight: 500, color: C.faint, align: "center", font: "cjk", alpha: noteA });
}

// ---------------------------------------------------------------------------------- counter (carry out)
const Overlay: React.FC = () => {
  const { t } = useChapterClock();
  const a = seg(t, T.collapse[0] + 0.6, T.collapse[1], ease.out) * (t < DUR ? 1 : 0);
  if (a < 0.01) return null;
  return (
    <>
      <ParamCounter value={13002} opacity={a} />
      <div style={{ position: "absolute", left: 1076, top: 300, fontSize: 28, fontWeight: 500, color: C.dim, opacity: a * seg(t, T.collapse[0] + 1.4, T.collapse[1] + 0.2, ease.out) }}>个参数</div>
    </>
  );
};

export const Ch12Attention: React.FC = () => (
  <>
    <Canvas draw={({ ctx, gf }) => drawScene(ctx, gf)} />
    <Overlay />
    <ChapterCard />
    <Captions />
  </>
);
