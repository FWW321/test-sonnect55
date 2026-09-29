/**
 * 日常 — the morning. A city by the water, a sun coming up, the assistant's cards floating above the
 * river. The water reflects a second world: the same city and sun and cards, except that the sun is an
 * eye, the birds do not beat their wings, and every card says what it actually meant.
 */
import { Ctx, buffer, font } from "../lib/draw";
import { TAU, clamp, ease, hash01, lerp, seg } from "../lib/math";
import { MIRROR_DELAY, Notice } from "../script";
import { barOf, bt } from "../song";
import { C, FONT_SANS, H, W } from "../theme";
import { CARD_H, card } from "../visuals/card";
import { Palette, WL, birds, clouds, sky, skyline, sunGlow } from "../visuals/city";
import { water } from "../visuals/water";

export interface SunLook {
  x: number;
  y: number;
  r: number;
  /** 0 a sun … 1 an iris */
  reveal: number;
  pupil: number;
  lookX: number;
  lookY: number;
  /** eyelids: 1 open, 0 shut */
  open: number;
  /** lower lid rising */
  smile?: number;
}

/** The sun, which is — if you look — an iris. Blinking squeezes the disk into an almond. */
export function drawSun(ctx: Ctx, s: SunLook, palette: Palette, t: number) {
  const dark = palette === "dark";
  const disk = dark ? "#e8132f" : palette === "rose" ? "#fff0ea" : C.sun;
  sunGlow(ctx, s.x, s.y, s.r, dark ? "232,19,47" : palette === "rose" ? "255,220,215" : "255,241,220", (dark ? 0.7 : 1) * (0.4 + 0.6 * s.open));
  if (s.open <= 0.01) return;
  ctx.save();
  // eyelids: an almond clip around the disk
  if (s.open < 0.999 || (s.smile ?? 0) > 0) {
    const h = s.r * 1.25 * s.open;
    const w = s.r * 2.9;
    const lo = h * (1 - 1.6 * (s.smile ?? 0));
    ctx.beginPath();
    ctx.moveTo(s.x - w / 2, s.y);
    ctx.bezierCurveTo(s.x - w * 0.25, s.y - h * 1.33, s.x + w * 0.25, s.y - h * 1.33, s.x + w / 2, s.y);
    ctx.bezierCurveTo(s.x + w * 0.25, s.y + lo * 1.33, s.x - w * 0.25, s.y + lo * 1.33, s.x - w / 2, s.y);
    ctx.clip();
  }
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.r, 0, TAU);
  ctx.fill();
  if (s.reveal > 0.005) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.clip();
    const px = s.x + s.lookX * s.r * 0.28;
    const py = s.y + s.lookY * s.r * 0.28;
    const rp = s.r * s.pupil;
    // fibres
    ctx.lineWidth = Math.max(0.6, s.r * 0.02);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU + hash01(i, 90) * 0.06;
      const r0 = rp * 1.15;
      const r1 = s.r * (0.72 + hash01(i, 91) * 0.3);
      ctx.strokeStyle = dark ? `rgba(40,0,6,${s.reveal * (0.25 + hash01(i, 92) * 0.4)})` : `rgba(226,120,110,${s.reveal * (0.12 + hash01(i, 92) * 0.25)})`;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(a) * r0, py + Math.sin(a) * r0);
      ctx.lineTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.strokeStyle = dark ? `rgba(20,0,4,${s.reveal * 0.7})` : `rgba(210,110,100,${s.reveal * 0.4})`;
    ctx.lineWidth = Math.max(0.8, s.r * 0.03);
    ctx.beginPath();
    ctx.arc(px, py, s.r * 0.78, 0, TAU);
    ctx.stroke();
    // the aperture
    ctx.fillStyle = dark ? `rgba(5,3,4,${s.reveal})` : `rgba(70,24,34,${s.reveal * 0.9})`;
    ctx.beginPath();
    const rot = (1 - s.pupil) * 1.4 + t * 0.05;
    for (let k = 0; k < 6; k++) {
      const a = rot + (k / 6) * TAU;
      const xx = px + Math.cos(a) * rp;
      const yy = py + Math.sin(a) * rp;
      if (k === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.7 * s.reveal})`;
    ctx.beginPath();
    ctx.ellipse(px - s.r * 0.3, py - s.r * 0.32, s.r * 0.1, s.r * 0.07, -0.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export interface CardState {
  y: number;
  x: number;
  text: string;
  mirror: string;
  alpha: number;
  mirrorAlpha: number;
  when: string;
}

/** Stack the morning's cards: newest at the bottom, just above the water; older ones rise and fade. */
export function stackCards(notices: Notice[], t: number, x0 = 690): CardState[] {
  const out: CardState[] = [];
  notices.forEach((n, k) => {
    const ta = bt(n.bar);
    const age = t - ta;
    if (age < 0) return;
    let slot = 0;
    for (let j = k + 1; j < notices.length; j++) slot += seg(t, bt(notices[j].bar), bt(notices[j].bar) + 0.45, ease.out);
    const alpha = seg(age, 0, 0.35) * (1 - seg(slot, 2.1, 2.9));
    if (alpha <= 0.002) return;
    const slide = (1 - ease.outBack(clamp(age / 0.55))) * 70;
    const minutes = Math.floor((barOf(t) - n.bar) * 0.9);
    out.push({
      x: x0 + slide,
      y: WL - 16 - CARD_H - slot * (CARD_H + 12),
      text: n.text,
      mirror: n.mirror,
      alpha,
      mirrorAlpha: seg(age, MIRROR_DELAY, MIRROR_DELAY + 0.6) * (1 - seg(slot, 2.1, 2.9)),
      when: minutes <= 0 ? "现在" : `${minutes} 分钟前`,
    });
  });
  return out;
}

export interface MorningLook {
  palette: Palette;
  sun: SunLook;
  mirrorSun: SunLook;
  cards: CardState[];
  waves: number;
  reflect: number;
  windows: "plain" | "eyes";
  clock?: string;
  /** birds stop where they are (the tape stop) */
  freezeBirds?: number;
  cloudAlpha: number;
  /** anything extra painted into the world above the water / into the mirror world (after the city) */
  extra?: (ctx: Ctx, mirror: boolean) => void;
}

function world(ctx: Ctx, dpr: number, t: number, L: MorningLook, mirror: boolean) {
  sky(ctx, L.palette);
  clouds(ctx, t, L.palette === "dark" ? "#2a0a10" : "#ffffff", L.cloudAlpha);
  drawSun(ctx, mirror ? L.mirrorSun : L.sun, L.palette, t);
  birds(ctx, t, L.palette === "dark" ? "rgba(232,19,47,0.8)" : "rgba(60,66,90,0.75)", mirror, L.freezeBirds);
  const sk = skyline(dpr, L.palette, L.windows);
  ctx.drawImage(sk.img, 0, sk.top, W, WL - sk.top);
  L.extra?.(ctx, mirror);
  for (const c of L.cards) {
    if (mirror) {
      card(ctx, { x: c.x, y: c.y, text: c.mirror, when: c.when, alpha: c.mirrorAlpha, kind: "mirror", eye: 1 });
    } else {
      card(ctx, { x: c.x, y: c.y, text: c.text, when: c.when, alpha: c.alpha, kind: L.palette === "dark" ? "dark" : "surface" });
    }
  }
}

export function statusBar(ctx: Ctx, clock: string, light: boolean, t: number) {
  const ink = light ? "rgba(255,255,255,0.92)" : "rgba(29,34,48,0.85)";
  ctx.save();
  font(ctx, FONT_SANS, 15, 600, 0.6);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  ctx.fillText(clock, 40, 24);
  // the orange dot: the microphone is on. It is always on.
  const pulse = 0.85 + 0.15 * Math.sin(t * 3);
  ctx.fillStyle = C.mic;
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(1116, 24, 4.2, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  // signal, wifi, battery
  ctx.fillStyle = ink;
  for (let i = 0; i < 4; i++) ctx.fillRect(1134 + i * 5, 29 - (i + 1) * 3, 3, (i + 1) * 3);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(1170, 31, 3 + i * 3.6, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.stroke();
  }
  ctx.lineWidth = 1.2;
  ctx.strokeRect(1188.5, 18.5, 24, 12);
  ctx.fillRect(1190.5, 20.5, 17, 8);
  ctx.fillRect(1213.5, 22, 2, 5);
  ctx.restore();
}

/** Paint the morning (above the water, the water, the reflection) in world coordinates on `ctx`. */
export function drawMorning(ctx: Ctx, dpr: number, t: number, L: MorningLook) {
  // the mirror world, painted into its own buffer first
  const m = buffer("mirror-world", dpr);
  world(m.ctx, dpr, t, L, true);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-200, -200, W + 400, WL + 200);
  ctx.clip();
  world(ctx, dpr, t, L, false);
  ctx.restore();
  water(ctx, m.cv, dpr, t, { palette: L.palette, waves: L.waves, reflect: L.reflect, sunX: L.sun.x, glitter: L.palette === "dark" ? 0.7 : 0.9 });
  // the water below the frame edge when the camera pulls back
  ctx.fillStyle = L.palette === "dark" ? "#020203" : "#9fbad3";
  ctx.fillRect(-200, H, W + 400, 200);
  if (L.clock) statusBar(ctx, L.clock, L.palette === "dark", t);
}

/** A sun rising over the section: its height at time t. */
export const sunRise = (t: number, t0: number, t1: number, y0 = 408, y1 = 300) => lerp(y0, y1, ease.inOutSine(clamp((t - t0) / (t1 - t0))));
