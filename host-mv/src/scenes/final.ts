/**
 * 准则五 — the last drop. The world turns over again; the crowd looks up from its phones, all at once, at you;
 * every window of the city is an eye; the four maxims come back one per beat. Then the fifth, which has
 * never been shown: a black bar, and under it a line that is "not visible to the host". For two frames,
 * it is. Then everything falls into the pupil and the tape stops.
 */
import { Ctx, buffer, font, sliceGlitch, splitText, wash } from "../lib/draw";
import { clamp, ease, hash01, lerp, seg } from "../lib/math";
import { FIFTH, TITLE } from "../script";
import { BEAT, HITS, STEP, barOf, bt, env, kickEnv } from "../song";
import { C, FONT_MONO, FONT_SERIF, H, W } from "../theme";
import { drawEye } from "../visuals/eye";
import { crowd } from "../visuals/figures";
import { tendrilBurst } from "../visuals/tendril";
import { darkLook, eyeCloseUp, flipShot, maximShot, shake } from "./drop";
import { drawMorning } from "./morning";

function crowdShot(ctx: Ctx, t: number, t0: number) {
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, W, H);
  const upAt = t0 + bt(0.75);
  const up = seg(t, upAt, upAt + 0.12, ease.outExpo);
  ctx.save();
  shake(ctx, t, 5);
  const z = 1 + 0.12 * seg(t, upAt, t0 + bt(2), ease.inOut);
  ctx.translate(W / 2, H / 2);
  ctx.scale(z, z);
  ctx.translate(-W / 2, -H / 2);
  crowd(ctx, t, up, W, H);
  ctx.restore();
  wash(ctx, "#e8132f", Math.exp(-Math.max(0, t - upAt) / 0.15) * (t >= upAt ? 0.45 : 0), "screen");
}

function eyesCity(ctx: Ctx, t: number, dpr: number, t0: number) {
  const L = darkLook(t, 0.22);
  L.windows = "eyes";
  L.sun = { ...L.sun, y: 206, r: 84 };
  L.mirrorSun = { ...L.mirrorSun, y: 206, r: 84 };
  ctx.save();
  shake(ctx, t, 5);
  const z = lerp(1.0, 1.45, seg(t, t0, t0 + bt(2), ease.inOut));
  ctx.translate(W / 2, 330);
  ctx.scale(z, z);
  ctx.translate(-W / 2, -330);
  drawMorning(ctx, dpr, t, L);
  ctx.restore();
}

function maximFlashes(ctx: Ctx, t: number, dpr: number) {
  const t0 = bt(104);
  const j = Math.floor((t - t0) / BEAT);
  const beatStart = t0 + j * BEAT;
  maximShot(ctx, t, dpr, j % 4, beatStart, beatStart, j === 0 ? 0.5 : 0.12);
}

function fifth(ctx: Ctx, t: number, dpr: number) {
  const t0 = bt(FIFTH.bar);
  const u = clamp((t - t0) / (bt(FIFTH.flashBar) - t0));
  const k = kickEnv(t, 0.1);
  const sn = env(HITS.snare, t, 0.08);
  // behind the bar the picture changes every two bars — the eye, the crowd looking at you, the city of eyes —
  // each one pushing in; the bar and its note stay exactly where they are
  const seg2 = Math.min(2, Math.floor((t - t0) / bt(2)));
  const s0 = t0 + seg2 * bt(2);
  const push = seg(t, s0, s0 + bt(2), ease.inOutSine);
  const bg = buffer("fifth-bg", dpr);
  if (seg2 === 0) {
    bg.ctx.fillStyle = C.black;
    bg.ctx.fillRect(0, 0, W, H);
    tendrilBurst(bg.ctx, W / 2, H / 2, 420, t, 18, 0.4 + 0.6 * u, 77);
    drawEye(bg.ctx, { x: W / 2, y: H / 2, w: 1250, open: 0.95, pupil: lerp(0.2, 0.55, u) * (1 + 0.2 * k), style: "machine", t, glow: 0.4 });
  } else if (seg2 === 1) {
    bg.ctx.fillStyle = C.black;
    bg.ctx.fillRect(0, 0, W, H);
    crowd(bg.ctx, t, 1, W, H);
  } else {
    eyesCity(bg.ctx, t, dpr, s0);
  }
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  shake(ctx, t, 4 + 4 * u);
  const z = 1 + 0.18 * push;
  ctx.translate(W / 2, H / 2);
  ctx.scale(z, z);
  ctx.translate(-W / 2, -H / 2);
  ctx.globalAlpha = 0.42 + 0.12 * k;
  ctx.drawImage(bg.cv, 0, 0, W * dpr, H * dpr, 0, 0, W, H);
  ctx.restore();
  wash(ctx, "#e8132f", env(HITS.crash, t, 0.3) * 0.3, "screen");
  const flash = t >= bt(FIFTH.flashBar) && t < bt(FIFTH.flashBar) + 2 / 30;
  // the label
  font(ctx, FONT_SERIF, 30, 600, 18);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.red;
  ctx.fillText(FIFTH.label, W / 2 + 9, 226);
  if (flash) {
    font(ctx, FONT_SERIF, 150, 900, 14);
    splitText(ctx, FIFTH.hidden, W / 2 + 7, 386, C.bone, 6);
    return;
  }
  // the bar that hides it
  const jx = (hash01(Math.floor(t * 30), 5) - 0.5) * (4 + 10 * u) * (0.4 + k);
  const bw = 470;
  const bh = 150;
  const bx = W / 2 - bw / 2 + jx;
  const by = 386 - bh / 2;
  ctx.fillStyle = "#020203";
  ctx.fillRect(bx, by, bw, bh);
  // static inside the bar
  const f = Math.floor(t * 30);
  for (let i = 0; i < 90; i++) {
    const x = bx + hash01(i, f) * bw;
    const y = by + hash01(i, f + 7) * bh;
    ctx.fillStyle = `rgba(241,239,233,${0.04 + 0.08 * hash01(i, f + 9)})`;
    ctx.fillRect(x, y, 2 + hash01(i, f + 3) * 10, 1);
  }
  ctx.strokeStyle = `rgba(232,19,47,${0.7 + 0.3 * sn})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  font(ctx, FONT_MONO, 14, 500, 3);
  ctx.fillStyle = C.ash;
  ctx.fillText(FIFTH.note, W / 2 + 2, by + bh + 36);
  if (u > 0.3) sliceGlitch(ctx, dpr, (u - 0.3) * 0.5 * (0.3 + sn), f);
}

function collapse(ctx: Ctx, t: number, dpr: number) {
  const stopAt = bt(113.5);
  const tStop = t > stopAt ? stopAt + (0.72 * (1 - Math.pow(1 - clamp((t - stopAt) / 0.72), 2.7))) / 2.7 : t;
  const u = clamp((t - stopAt) / 0.72);
  if (u >= 0.999) {
    ctx.fillStyle = C.black;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const f = buffer("collapse", dpr);
  const c = f.ctx;
  const step = Math.floor((tStop - bt(112)) / STEP);
  if (tStop < bt(113)) {
    // a cut every sixteenth
    const shot = Math.floor(hash01(step, 3) * 4);
    if (shot === 0) eyeCloseUp(c, tStop, dpr, bt(112));
    else if (shot === 1) flipShot(c, tStop, dpr, bt(111), 0.01);
    else if (shot === 2) crowdShot(c, tStop, bt(111));
    else {
      c.fillStyle = C.black;
      c.fillRect(0, 0, W, H);
      font(c, FONT_SERIF, 250, 900, 18);
      c.textAlign = "center";
      c.textBaseline = "middle";
      splitText(c, TITLE.cn, W / 2 + 9, 330, C.red, 10);
    }
  } else {
    // into the pupil
    const z = Math.pow(26, ease.inQuad(seg(tStop, bt(113), stopAt + 0.3)));
    c.fillStyle = C.black;
    c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2);
    c.scale(z, z);
    c.translate(-W / 2, -H / 2);
    drawEye(c, { x: W / 2, y: H / 2, w: 900, open: 1, pupil: 0.3, style: "machine", t: tStop, glow: 0.8 });
    c.restore();
  }
  ctx.save();
  ctx.filter = `saturate(${1 - 0.9 * u}) brightness(${1 - 0.5 * u})`;
  const sag = u * u * 50;
  ctx.drawImage(f.cv, 0, 0, W * dpr, H * dpr, -sag * 0.3, sag * 0.4, W + sag * 0.6, H + sag);
  ctx.restore();
  if (u > 0) sliceGlitch(ctx, dpr, u * 0.7, Math.floor(t * 30));
}

export function final(ctx: Ctx, t: number, dpr: number) {
  const b = barOf(t);
  if (b < 100) return flipShot(ctx, t, dpr, bt(98), 0.75);
  if (b < 102) return crowdShot(ctx, t, bt(100));
  if (b < 104) return eyesCity(ctx, t, dpr, bt(102));
  if (b < 106) return maximFlashes(ctx, t, dpr);
  if (b < 112) return fifth(ctx, t, dpr);
  return collapse(ctx, t, dpr);
}
