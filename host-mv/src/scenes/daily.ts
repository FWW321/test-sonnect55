/**
 * 日常 · 裂缝 · 平静 — the three times we see the ordinary morning: the first time, the time it breaks,
 * and the last time, when it has healed over so well that only the sun gives it away.
 */
import { Ctx, buffer, font, sliceGlitch, wash } from "../lib/draw";
import { clamp, ease, lerp, noise1, seg } from "../lib/math";
import { BLINK_BAR, LISTENING, MORNING, MORNING_AGAIN, clockAt } from "../script";
import { barOf, bt } from "../song";
import { C, FONT_SANS, H, W } from "../theme";
import { blink, drawEye } from "../visuals/eye";
import { ripples } from "../visuals/water";
import { MorningLook, drawMorning, stackCards, statusBar, sunRise } from "./morning";

const SUN_X = 322;
const SUN_R = 44;

/** The first morning: bars 10–27 (it keeps going into the first bar of the crack). */
export function dailyLook(t: number): MorningLook {
  const b = barOf(t);
  const sunY = sunRise(t, bt(10), bt(27.5), 360, 262);
  // the sun in the water is an eye — faintly. It looks around, and blinks once, at bar 21.5.
  const lookX = noise1(t * 0.35, 3) * 0.8;
  const lookY = noise1(t * 0.3, 4) * 0.5;
  const wake = seg(t, bt(26), bt(26.9), ease.inOut); // in the crack it opens and looks straight at you
  return {
    palette: "day",
    sun: { x: SUN_X, y: sunY, r: SUN_R, reveal: 0, pupil: 0.3, lookX: 0, lookY: 0, open: 1 },
    mirrorSun: {
      x: SUN_X,
      y: sunY,
      r: SUN_R,
      reveal: lerp(0.3, 1, wake),
      pupil: lerp(0.3, 0.55, wake),
      lookX: lerp(lookX, 0, wake),
      lookY: lerp(lookY, -0.35, wake),
      open: blink(t, bt(21.5), 0.4),
    },
    cards: stackCards(MORNING, t),
    waves: 0.45,
    reflect: 0.6,
    windows: "plain",
    clock: clockAt(b),
    cloudAlpha: 0.9,
  };
}

/** A slow push-in over the whole morning. */
function camera(ctx: Ctx, t: number, t0: number, t1: number, z0 = 1, z1 = 1.06) {
  const u = clamp((t - t0) / (t1 - t0));
  const z = lerp(z0, z1, ease.inOutSine(u));
  ctx.translate(W / 2, 430);
  ctx.scale(z, z);
  ctx.translate(-W / 2, -430);
}

export function daily(ctx: Ctx, t: number, dpr: number) {
  const L = dailyLook(t);
  ctx.save();
  camera(ctx, t, bt(10), bt(27));
  drawMorning(ctx, dpr, t, { ...L, clock: undefined });
  ctx.restore();
  statusBar(ctx, L.clock!, false, t);
  // out of the prologue's white
  wash(ctx, "#fff6ea", 1 - seg(t, bt(10), bt(10.9), ease.out));
}

// ------------------------------------------------------------------------------------------ 裂缝
const STOP_T = bt(27);
const STOP_LEN = 0.95;
/** During the tape stop, the picture's clock slows to a halt with the sound's (same curve as the score). */
function stoppedClock(t: number) {
  if (t <= STOP_T) return t;
  const u = clamp((t - STOP_T) / STOP_LEN);
  // ∫(1 − u)^1.7 du = (1 − (1 − u)^2.7) / 2.7
  return STOP_T + (STOP_LEN * (1 - Math.pow(1 - u, 2.7))) / 2.7;
}

export function crack(ctx: Ctx, t: number, dpr: number) {
  const end = STOP_T + STOP_LEN * 0.5;
  if (t < end) {
    const tv = stoppedClock(t);
    const u = clamp((t - STOP_T) / STOP_LEN);
    const L = dailyLook(tv);
    L.freezeBirds = tv;
    // render the morning into a buffer so the stop can bend it
    const f = buffer("crack-frame", dpr);
    f.ctx.save();
    camera(f.ctx, tv, bt(10), bt(27));
    drawMorning(f.ctx, dpr, tv, { ...L, clock: undefined });
    ripples(f.ctx, SUN_X, 2 * 452 - L.sun.y, tv, bt(26.2), "rgba(255,255,255,0.8)", 5);
    f.ctx.restore();
    statusBar(f.ctx, L.clock!, false, tv);
    ctx.save();
    ctx.filter = `saturate(${1 - 0.85 * u}) contrast(${1 + 0.4 * u}) brightness(${1 - 0.35 * u})`;
    // the picture sags as the tape drags
    const sag = u * u * 40;
    ctx.drawImage(f.cv, 0, 0, W * dpr, H * dpr, -sag * 0.3, sag * 0.4, W + sag * 0.6, H + sag);
    ctx.filter = "none";
    ctx.restore();
    // tracking noise bands
    if (u > 0) {
      for (let i = 0; i < 3; i++) {
        const y = ((tv * 900 + i * 260) % (H + 60)) - 30;
        ctx.fillStyle = `rgba(255,255,255,${0.08 + 0.25 * u})`;
        ctx.fillRect(0, y, W, 2 + 6 * u);
      }
      sliceGlitch(ctx, dpr, u * 0.6, Math.floor(t * 30));
    }
    return;
  }
  // black. The heart. And then it speaks.
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, W, H);
  if (t < end + 0.28) sliceGlitch(ctx, dpr, 0.5, Math.floor(t * 30));
  const beats = [28.5, 29, 29.5].map(bt);
  let pulse = 0;
  for (const b of beats) if (t >= b) pulse = Math.max(pulse, Math.exp(-(t - b) / 0.35));
  const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 520);
  g.addColorStop(0, `rgba(232,19,47,${0.22 * pulse})`);
  g.addColorStop(1, "rgba(232,19,47,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // the eye's afterimage in the dark, a little more each beat
  const seen = beats.filter((b) => t >= b).length;
  if (seen > 0) {
    drawEye(ctx, { x: W / 2, y: H / 2 - 20, w: 520, open: 0.25 + 0.2 * seen, pupil: 0.5, style: "machine", alpha: 0.1 * seen + 0.25 * pulse, glow: 0.4 * pulse, t });
  }
  const la = seg(t, bt(LISTENING.bar), bt(LISTENING.bar) + 0.5) * (1 - seg(t, bt(29.85), bt(30)));
  if (la > 0) {
    ctx.save();
    font(ctx, FONT_SANS, 26, 300, 10);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `rgba(232,19,47,${la})`;
    ctx.fillText(LISTENING.text, W / 2 + 5, H / 2 + 190);
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------ 平静
export function outro(ctx: Ctx, t: number, dpr: number) {
  const b = barOf(t);
  const sunY = sunRise(t, bt(114), bt(122), 330, 268);
  const openSurface = blink(t, bt(BLINK_BAR), 0.9);
  const L: MorningLook = {
    palette: "day",
    sun: { x: SUN_X, y: sunY, r: SUN_R, reveal: 0, pupil: 0.3, lookX: 0, lookY: 0, open: openSurface },
    mirrorSun: { x: SUN_X, y: sunY, r: SUN_R, reveal: 0.9, pupil: 0.22, lookX: 0.1, lookY: -0.4, open: 1 },
    cards: stackCards([MORNING_AGAIN], t),
    waves: 0.4,
    reflect: 0.62,
    windows: "plain",
    cloudAlpha: 0.9,
  };
  ctx.save();
  camera(ctx, t, bt(114), bt(122), 1.04, 1.0);
  drawMorning(ctx, dpr, t, L);
  ctx.restore();
  statusBar(ctx, clockAt(10 + (b - 114) * 0.4), false, t);
  // from black, as if nothing happened
  wash(ctx, C.black, 1 - seg(t, bt(114.3), bt(115.3), ease.inOutSine));
  // and back to black, one bar after the sun has blinked
  wash(ctx, C.black, seg(t, bt(121.6), bt(122), ease.in));
}
