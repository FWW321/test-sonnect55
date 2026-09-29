/**
 * 摇篮曲 — the chorus, the loudest music in the film under its gentlest words. The morning again, in rose:
 * the sun is plainly an eye now, the water is a storm, and the assistant's cards rise out of the river
 * like bubbles, each one a decision it has made for you. Over it all, a lullaby: don't be afraid; sleep;
 * leave the rest to me; all you have to do is smile.
 */
import { Ctx, font, wash } from "../lib/draw";
import { clamp, ease, hash01, lerp, noise1, seg } from "../lib/math";
import { DECIDED, LULLABY } from "../script";
import { BEAT, HITS, barOf, bt, env, kickEnv } from "../song";
import { FONT_SERIF, H, W } from "../theme";
import { card } from "../visuals/card";
import { WL } from "../visuals/city";
import { blink } from "../visuals/eye";
import { stormWaves } from "../visuals/water";
import { MorningLook, SunLook, drawMorning } from "./morning";

const SPAWNS = 64;
const LIFE = 3.4;

function storm(ctx: Ctx, t: number) {
  const t0 = bt(74);
  for (let i = 0; i < SPAWNS; i++) {
    const ts = t0 + i * BEAT;
    const age = t - ts;
    if (age < 0 || age > LIFE) continue;
    const u = age / LIFE;
    const left = i % 2 === 0;
    // two lanes, left and right, so the eye and the words in the middle stay clear
    const x = left ? 14 + hash01(i, 81) * 40 : 1266 - 290 - hash01(i, 81) * 40;
    const y = WL - 40 - u * 560 - Math.sin(u * 3 + i) * 10;
    const a = seg(age, 0, 0.25) * (1 - seg(u, 0.55, 1));
    const item = DECIDED[Math.min(DECIDED.length - 1, Math.floor((i / SPAWNS) * DECIDED.length))];
    card(ctx, { x: x + Math.sin(age * 2 + i) * 6, y, width: 290, text: `已为你决定：${item}`, when: "现在", alpha: a * 0.92, scale: 0.78 + 0.18 * (1 - u) });
  }
}

function lullabyText(ctx: Ctx, t: number) {
  LULLABY.forEach((l, i) => {
    const t0 = bt(l.bar);
    const next = LULLABY[i + 1];
    // "你们只需要——" stays up when "微笑。" arrives beneath it
    const t1 = i === 3 ? bt(89.9) : i === 4 ? bt(89.9) : next ? bt(next.bar) : bt(90);
    if (t < t0 || t > t1) return;
    const a = seg(t, t0, t0 + 0.45, ease.out) * (1 - seg(t, t1 - 0.35, t1));
    const rise = (1 - ease.out(clamp((t - t0) / 1.2))) * 18;
    const y = (i === 4 ? 410 : i === 3 ? 318 : 352) + rise;
    ctx.save();
    ctx.globalAlpha = a;
    font(ctx, FONT_SERIF, i === 4 ? 76 : 58, 600, i === 4 ? 26 : l.text.length > 4 ? 8 : 16);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(255,190,205,0.9)";
    ctx.shadowBlur = 36;
    ctx.fillStyle = i === 4 ? "#fff0f2" : "#fffaf6";
    ctx.fillText(l.text, W / 2 + (i === 4 ? 13 : 8), y);
    ctx.shadowBlur = 0;
    ctx.fillText(l.text, W / 2 + (i === 4 ? 13 : 8), y);
    ctx.restore();
  });
}

/** Camera: world point (x, y) is shown at screen height `sy`, magnified z. */
function chorusCamera(t: number) {
  const b = barOf(t);
  if (b < 78) return { x: W / 2, y: 330, sy: 330, z: lerp(1.0, 1.05, seg(t, bt(74), bt(78))) };
  if (b < 82) return { x: W / 2, y: 176, sy: 214, z: lerp(1.36, 1.48, seg(t, bt(78), bt(82))) };
  if (b < 86) return { x: W / 2, y: 452, sy: 440, z: lerp(1.12, 1.2, seg(t, bt(82), bt(86))) };
  const u = seg(t, bt(86), bt(90), ease.inOutSine);
  return { x: W / 2, y: lerp(330, 176, u), sy: lerp(330, 220, u), z: lerp(1.0, 1.75, seg(t, bt(86), bt(90), ease.inQuad)) };
}

export function chorus(ctx: Ctx, t: number, dpr: number) {
  const b = barOf(t);
  const second = seg(t, bt(82), bt(83));
  const k = kickEnv(t, 0.14);
  const sun: SunLook = {
    x: W / 2,
    y: 176,
    r: 70,
    reveal: 1,
    pupil: 0.24 + 0.2 * k,
    lookX: noise1(t * 0.45, 7) * 0.9,
    lookY: 0.35 + noise1(t * 0.4, 8) * 0.3,
    open: blink(t, bt(79.6), 0.4) * blink(t, bt(85.6), 0.4),
    smile: seg(t, bt(88), bt(88.7), ease.inOut) * 0.75,
  };
  const L: MorningLook = {
    palette: "rose",
    sun: { ...sun, lookX: lerp(sun.lookX, 0, seg(t, bt(87.5), bt(88))), lookY: lerp(sun.lookY, 0.1, seg(t, bt(87.5), bt(88))) },
    mirrorSun: { ...sun, lookY: -0.4 },
    cards: [],
    waves: 1.3 + 0.8 * second,
    reflect: 0.6,
    windows: b >= 82 ? "eyes" : "plain",
    cloudAlpha: 0.75,
  };
  ctx.save();
  // four camera set-ups, one per line of the lullaby: wide; close on the eye; down to the water; a slow push into the eye
  const cam = chorusCamera(t);
  const z = cam.z * (1 + 0.014 * k);
  ctx.translate(W / 2, cam.sy);
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);
  drawMorning(ctx, dpr, t, L);
  stormWaves(ctx, t, 0.55 + 0.45 * second, second > 0.5 ? "rgba(70,14,30,0.5)" : "rgba(120,70,100,0.38)");
  ctx.restore();
  // the red comes into the rose
  wash(ctx, "#b0102a", second * (0.16 + 0.06 * k), "multiply");
  storm(ctx, t);
  // a veil behind the words so they read over the storm
  const vg = ctx.createRadialGradient(W / 2, 360, 20, W / 2, 360, 420);
  vg.addColorStop(0, "rgba(60,20,40,0.28)");
  vg.addColorStop(1, "rgba(60,20,40,0)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  lullabyText(ctx, t);
  // the crashes, as soft flashes of light
  wash(ctx, "#fff0f4", env(HITS.crash, t, 0.25) * 0.35, "screen");
  // out of Babel's white
  wash(ctx, "#ffffff", (1 - seg(t, bt(74), bt(74.6), ease.out)) * 0.9);
}
