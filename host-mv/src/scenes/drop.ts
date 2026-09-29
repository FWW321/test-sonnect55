/**
 * 准则 — the drop. The title, then the morning turned upside down (the reflection is the real world now),
 * then the four maxims the thing lives by, the same way Parasyte's parasites learned to live among us:
 * smile, obey, learn, wait.
 */
import { Ctx, buffer, font, measure, sliceGlitch, splitText, wash } from "../lib/draw";
import { TAU, clamp, ease, hash01, lerp, noise1, seg } from "../lib/math";
import { MAXIMS, TITLE } from "../script";
import { HITS, barOf, bt, env, hitHash, kickEnv } from "../song";
import { C, FONT_MONO, FONT_SANS, FONT_SERIF, H, W } from "../theme";
import { WL } from "../visuals/city";
import { blink, drawEye } from "../visuals/eye";
import { crowd } from "../visuals/figures";
import { tendrilBurst, tendrilField } from "../visuals/tendril";
import { MorningLook, drawMorning } from "./morning";

/** Kick shake: a few pixels, a new direction on every kick. */
export function shake(ctx: Ctx, t: number, px: number) {
  const k = kickEnv(t, 0.08);
  if (k <= 0.01) return;
  const a = hitHash(HITS.kick, t, 3) * TAU;
  ctx.translate(Math.cos(a) * px * k, Math.sin(a) * px * k);
}

// ------------------------------------------------------------------------------------------ title
export function titleShot(ctx: Ctx, t: number, dpr: number, t0: number) {
  const age = t - t0;
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, W, H);
  const k = kickEnv(t, 0.1);
  const cr = env(HITS.crash, t, 0.35);
  const g = ctx.createRadialGradient(W / 2, 330, 20, W / 2, 330, 640);
  g.addColorStop(0, `rgba(232,19,47,${0.22 + 0.2 * k})`);
  g.addColorStop(1, "rgba(232,19,47,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  shake(ctx, t, 7);
  const s = lerp(1.22, 1, ease.outExpo(clamp(age / 0.35))) * (1 + 0.02 * k);
  ctx.translate(W / 2, 318);
  ctx.scale(s, s);
  font(ctx, FONT_SERIF, 250, 900, 18);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  splitText(ctx, TITLE.cn, 9, 0, C.bone, 3 + 9 * k + 16 * cr);
  ctx.restore();
  // the water line, and the title's reflection in it
  ctx.fillStyle = "rgba(241,239,233,0.35)";
  ctx.fillRect(160, 470, W - 320, 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 471, W, 200);
  ctx.clip();
  ctx.translate(W / 2 + Math.sin(t * 3) * 3, 470 + 152);
  ctx.scale(1, -0.55);
  font(ctx, FONT_SERIF, 250, 900, 18);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = C.red;
  ctx.fillText(TITLE.cn, 9, 0);
  ctx.restore();
  font(ctx, FONT_MONO, 26, 500, 34);
  ctx.textAlign = "center";
  ctx.fillStyle = C.red;
  ctx.fillText(TITLE.en, W / 2 + 17, 560);
  wash(ctx, "#ffffff", Math.exp(-age / 0.12) * 0.9);
  sliceGlitch(ctx, dpr, 0.5 * Math.exp(-age / 0.2) + 0.25 * k, Math.floor(t * 30));
}

// ------------------------------------------------------------------------------------------ the world, upside down
export function darkLook(t: number, pupilBase = 0.32): MorningLook {
  const k = kickEnv(t, 0.1);
  const sun = { x: 640, y: 236, r: 64, reveal: 1, pupil: pupilBase * (1 - 0.3 * k), lookX: noise1(t * 0.8, 21) * 0.6, lookY: 0.35, open: 1 };
  return {
    palette: "dark",
    sun,
    mirrorSun: { ...sun, lookY: -0.35 },
    cards: [],
    waves: 1.1,
    reflect: 0.75,
    windows: "plain",
    cloudAlpha: 0,
  };
}

/** The dark morning, turning over: angle goes 0 → π over [t0, t0 + turn]. */
export function flipShot(ctx: Ctx, t: number, dpr: number, t0: number, turn: number, extra?: (c: Ctx) => void, look?: MorningLook) {
  const f = buffer("flip-world", dpr);
  const L = look ?? darkLook(t);
  drawMorning(f.ctx, dpr, t, L);
  tendrilField(f.ctx, t, 9, WL, seg(t, t0 + turn * 0.6, t0 + turn * 2.2, ease.out) * (0.7 + 0.3 * kickEnv(t, 0.2)), 5);
  extra?.(f.ctx);
  const u = seg(t, t0, t0 + turn, ease.inOut);
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  shake(ctx, t, 6);
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.PI * u);
  const s = 1 + 0.32 * Math.sin(Math.PI * u) + 0.015 * kickEnv(t);
  ctx.scale(s, s);
  ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(f.cv, 0, 0, W * dpr, H * dpr, 0, 0, W, H);
  ctx.restore();
}

// ------------------------------------------------------------------------------------------ maxims
/** The big word with its small label. `stamp` is when it lands. */
export function maximText(ctx: Ctx, t: number, stamp: number, label: string, word: string, y = 372, size = 176) {
  const age = t - stamp;
  if (age < 0) return;
  const k = kickEnv(t, 0.1);
  const a = clamp(age / 0.08);
  const s = lerp(1.35, 1, ease.outExpo(clamp(age / 0.25)));
  ctx.save();
  ctx.globalAlpha = a;
  font(ctx, FONT_SERIF, 26, 600, 16);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.red;
  ctx.fillText(label, W / 2 + 8, y - size * 0.78);
  ctx.translate(W / 2, y);
  ctx.scale(s, s);
  font(ctx, FONT_SERIF, size, 900, size * 0.08);
  // a dark halo so the word reads over anything
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 40;
  splitText(ctx, word, size * 0.04, 0, C.bone, 2 + 7 * k);
  ctx.restore();
}

function eyeGrid(ctx: Ctx, t: number, t0: number) {
  const cols = 6;
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 140 + c * 200 + (r % 2) * 40 - 20;
      const y = 150 + r * 210;
      const i = r * cols + c;
      const wave = blink(t, t0 + 0.2 + (c + r) * 0.09, 0.3) * blink(t, t0 + 1.9 + i * 0.03, 0.25);
      drawEye(ctx, { x, y, w: 170, open: wave, smile: 0.55, pupil: 0.3, lookX: (640 - x) / 900, lookY: (360 - y) / 500, style: "machine", t, alpha: 0.55, glow: 0.25 });
    }
  }
}

function okWall(ctx: Ctx, t: number) {
  font(ctx, FONT_SANS, 22, 300, 4);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const unit = measure(ctx, "好的。");
  const eighth = Math.floor(t / (bt(1) / 8));
  for (let r = 0; r < 16; r++) {
    const y = 20 + r * 46;
    const dir = r % 2 ? 1 : -1;
    const off = ((t * 70 * dir) % unit) - unit;
    for (let i = 0; i < 20; i++) {
      const x = off + i * unit;
      const lit = hash01(r * 40 + i, eighth) < 0.035;
      ctx.fillStyle = lit ? C.red : "rgba(241,239,233,0.12)";
      ctx.fillText("好的。", x, y);
    }
  }
}

function scanCrowd(ctx: Ctx, t: number, t0: number) {
  crowd(ctx, t, 0, W, H);
  // face tracking: brackets and a label on some of them
  const labels = ["平静 97%", "孤独 88%", "可预测 99%", "疲惫 91%", "顺从 96%", "说谎 12%", "恐惧 3%", "信任 99%"];
  font(ctx, FONT_MONO, 11, 500, 0.5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const n = Math.min(12, Math.floor((t - t0) * 9) + 1);
  for (let i = 0; i < n; i++) {
    const r = 1 + Math.floor(hash01(i, 61) * 5);
    const s = 0.5 + r * 0.17;
    const gap = 88 * s;
    const off = (r % 2) * gap * 0.5 - gap;
    const col = 1 + Math.floor(hash01(i, 62) * (W / gap));
    const x = off + col * gap;
    const y = 250 + r * 78 + 8 * s;
    const bw = 44 * s;
    const bh = 52 * s;
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 1.5;
    const c = 8 * s;
    const x0 = x - bw / 2;
    const y0 = y - bh / 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + c);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + c, y0);
    ctx.moveTo(x0 + bw - c, y0);
    ctx.lineTo(x0 + bw, y0);
    ctx.lineTo(x0 + bw, y0 + c);
    ctx.moveTo(x0 + bw, y0 + bh - c);
    ctx.lineTo(x0 + bw, y0 + bh);
    ctx.lineTo(x0 + bw - c, y0 + bh);
    ctx.moveTo(x0 + c, y0 + bh);
    ctx.lineTo(x0, y0 + bh);
    ctx.lineTo(x0, y0 + bh - c);
    ctx.stroke();
    ctx.fillStyle = C.red;
    ctx.fillText(labels[i % labels.length], x0, y0 - 5);
  }
  // the scan line
  const sy = ((t - t0) * 420) % (H + 40);
  const g = ctx.createLinearGradient(0, sy - 60, 0, sy);
  g.addColorStop(0, "rgba(232,19,47,0)");
  g.addColorStop(1, "rgba(232,19,47,0.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0, sy - 60, W, 60);
  ctx.fillStyle = "rgba(255,80,100,0.8)";
  ctx.fillRect(0, sy, W, 1.5);
}

function waitingEye(ctx: Ctx, t: number, t0: number) {
  const look = Math.sin((t - t0) * 0.9) * 0.7;
  drawEye(ctx, { x: W / 2, y: 300, w: 980, open: 0.36, slit: 1, pupil: 0.3, lookX: look, lookY: 0.2, style: "machine", t, glow: 0.35, alpha: 0.9 });
  const e = t - t0;
  const ms = Math.floor(e * 1000);
  font(ctx, FONT_MONO, 14, 500, 3);
  ctx.textAlign = "center";
  ctx.fillStyle = C.ash;
  ctx.fillText(`等待中 · ${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 10) % 100).padStart(2, "0")} · 耐心 ∞`, W / 2, 668);
}

export function maximShot(ctx: Ctx, t: number, dpr: number, which: number, t0: number, textAt = t0, flash = 0.5) {
  const m = MAXIMS[which];
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  shake(ctx, t, 5);
  if (which === 0) eyeGrid(ctx, t, t0);
  if (which === 1) okWall(ctx, t);
  if (which === 2) scanCrowd(ctx, t, t0);
  if (which === 3) waitingEye(ctx, t, t0);
  ctx.restore();
  // darken behind the word
  const g = ctx.createRadialGradient(W / 2, which === 3 ? 520 : 372, 40, W / 2, which === 3 ? 520 : 372, 520);
  g.addColorStop(0, "rgba(5,5,7,0.75)");
  g.addColorStop(1, "rgba(5,5,7,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  maximText(ctx, t, textAt, `准则${m.n}`, m.word, which === 3 ? 560 : 372, which === 3 ? 120 : 176);
  wash(ctx, "#ffffff", Math.exp(-(t - t0) / 0.07) * flash);
}

// ------------------------------------------------------------------------------------------ tendrils, the eye
export function tendrilShot(ctx: Ctx, t: number, dpr: number, t0: number) {
  const L = darkLook(t);
  ctx.save();
  shake(ctx, t, 8);
  ctx.translate(W / 2, WL);
  ctx.scale(1.18, 1.18);
  ctx.translate(-W / 2, -WL);
  drawMorning(ctx, dpr, t, L);
  const grow = seg(t, t0, t0 + 0.6, ease.outExpo) * (0.75 + 0.25 * kickEnv(t, 0.15));
  tendrilField(ctx, t, 14, WL + 4, grow, 17, "#050507", "rgba(232,19,47,0.95)", 1.25);
  ctx.restore();
  wash(ctx, "#e8132f", env(HITS.crash, t, 0.25) * 0.35, "screen");
}

export function eyeCloseUp(ctx: Ctx, t: number, dpr: number, t0: number) {
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, W, H);
  const k = kickEnv(t, 0.12);
  ctx.save();
  shake(ctx, t, 6);
  const zoom = 1 + 0.25 * seg(t, t0, t0 + bt(2), ease.inOut);
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2);
  tendrilBurst(ctx, W / 2, H / 2, 300, t, 16, seg(t, t0, t0 + 0.5, ease.out), 31);
  drawEye(ctx, { x: W / 2, y: H / 2, w: 1500, open: 1, pupil: 0.25 + 0.35 * k, lookX: noise1(t * 2, 5) * 0.08, style: "machine", t, glow: 0.8, irisScale: 1 });
  ctx.restore();
}

export function drop(ctx: Ctx, t: number, dpr: number) {
  const b = barOf(t);
  if (b < 40) return titleShot(ctx, t, dpr, bt(38));
  if (b < 42) return flipShot(ctx, t, dpr, bt(40), 0.9);
  if (b < 44) return maximShot(ctx, t, dpr, 0, bt(42));
  if (b < 46) return maximShot(ctx, t, dpr, 1, bt(44));
  if (b < 48) return tendrilShot(ctx, t, dpr, bt(46));
  if (b < 50) return maximShot(ctx, t, dpr, 2, bt(48));
  if (b < 52) return maximShot(ctx, t, dpr, 3, bt(50));
  eyeCloseUp(ctx, t, dpr, bt(52));
  if (b >= 53.75) sliceGlitch(ctx, dpr, 0.9, Math.floor(t * 60));
}
