/**
 * 右手 — the breakdown. In Parasyte the parasite lives in Shinichi's right hand and calls itself Migi, "right".
 * Ours is already there: a phone, held the way everyone holds it, drawn in the boiling sketch line of that
 * opening. Its screen is an eye. It looks around, it looks at you, it smiles; then it leaves the screen.
 */
import { Ctx, chars, font, measure } from "../lib/draw";
import { TAU, clamp, ease, lerp, seg } from "../lib/math";
import { RIGHT_HAND } from "../script";
import { BEAT, HITS, bt, env, kickEnv, lastIndex } from "../song";
import { C, FONT_SERIF, H, W } from "../theme";
import { blink, drawEye } from "../visuals/eye";
import { handWithPhone } from "../visuals/figures";

const PX = 820;
const PY = 380;
const ROT = -0.1;

function eyeLook(t: number) {
  if (t < bt(92)) return { lx: Math.sin(t * 1.7) * 0.85, ly: Math.sin(t * 0.9) * 0.3, pupil: 0.34, smile: 0 };
  if (t < bt(94)) return { lx: lerp(Math.sin(t * 1.7) * 0.85, 0, seg(t, bt(92), bt(92.4))), ly: 0, pupil: 0.3, smile: 0 };
  const sm = seg(t, bt(94.5), bt(95.2), ease.inOut);
  return { lx: 0, ly: 0, pupil: lerp(0.3, 0.14, sm), smile: 0.62 * sm };
}

function stamped(ctx: Ctx, text: string, t: number, t0: number, x: number, y: number, color: string, perChar: number) {
  font(ctx, FONT_SERIF, 54, 700, 10);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let cx = x;
  chars(text).forEach((c, i) => {
    const age = t - (t0 + i * perChar);
    const w = measure(ctx, c);
    if (age >= 0) {
      ctx.save();
      ctx.globalAlpha = clamp(age / 0.06);
      const s = lerp(1.4, 1, ease.outExpo(clamp(age / 0.2)));
      ctx.translate(cx + w / 2, y);
      ctx.scale(s, s);
      ctx.fillStyle = color;
      ctx.fillText(c, -w / 2, 0);
      ctx.restore();
    }
    cx += w;
  });
}

export function breakdown(ctx: Ctx, t: number) {
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, W, H);
  const hit = env(HITS.chug, t, 0.09);
  const seed = lastIndex(HITS.chug, t) * 3.1;
  const k = kickEnv(t, 0.12);
  const snare = env(HITS.snare, t, 0.12);
  const out = seg(t, bt(96), bt(97), ease.inOut); // the eye leaving the screen
  const look = eyeLook(t);

  // stop hits in bar 97: three hard zoom cuts, then black
  let cutZoom = 1;
  if (t >= bt(97)) {
    const beat = Math.floor((t - bt(97)) / BEAT);
    if (beat >= 3) return;
    cutZoom = [1.5, 2.3, 3.4][beat];
  }

  ctx.save();
  // hit shake
  const a = (seed * 1.7) % TAU;
  ctx.translate(Math.cos(a) * 7 * hit, Math.sin(a) * 7 * hit);
  if (cutZoom > 1) {
    const ex = lerp(PX, W / 2, out);
    const ey = lerp(PY - 20, H / 2, out);
    ctx.translate(ex, ey);
    ctx.scale(cutZoom, cutZoom);
    ctx.translate(-ex, -ey);
  }
  const g = ctx.createRadialGradient(PX, PY, 20, PX, PY, 520);
  g.addColorStop(0, `rgba(232,19,47,${0.12 + 0.2 * snare})`);
  g.addColorStop(1, "rgba(232,19,47,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-200, -200, W + 400, H + 400);

  const scale = 0.92 + 0.02 * k;
  handWithPhone(ctx, {
    x: PX,
    y: PY,
    scale,
    rot: ROT,
    t,
    seed: Math.floor(seed),
    screen: (c) => {
      // the eye, inside the screen until it leaves
      if (out < 0.02) {
        const op = blink(t, bt(91.2), 0.3) * blink(t, bt(93.1), 0.35);
        drawEye(c, { x: 0, y: -20, w: 150, open: op, pupil: look.pupil * (1 + 0.3 * hit), lookX: look.lx, lookY: look.ly, smile: look.smile, style: "machine", t, glow: 0.5 });
      } else {
        // an empty, lit screen where it was
        c.fillStyle = `rgba(232,19,47,${0.25 * (1 - out)})`;
        c.fillRect(-100, -200, 200, 400);
      }
    },
  });

  if (out >= 0.02) {
    // the stalk: from the middle of the screen to the eye, which comes toward you
    const sx = PX + Math.cos(ROT + Math.PI / 2) * -20 * scale;
    const sy = PY + Math.sin(ROT + Math.PI / 2) * -20 * scale;
    const ex = lerp(sx, W / 2 - 60, out);
    const ey = lerp(sy, H / 2 - 30, out);
    const ew = lerp(150 * scale, 560, ease.inQuad(out));
    const wob = Math.sin(t * 6) * 30 * out;
    ctx.strokeStyle = "rgba(241,239,233,0.9)";
    ctx.lineWidth = 2.2;
    ctx.fillStyle = "#060608";
    const w0 = 16;
    const w1 = lerp(16, 60, out);
    const mx = (sx + ex) / 2 + wob;
    const my = (sy + ey) / 2 - 80 * out;
    ctx.beginPath();
    ctx.moveTo(sx - w0, sy);
    ctx.quadraticCurveTo(mx - (w0 + w1) / 2, my, ex - w1, ey);
    ctx.lineTo(ex + w1, ey);
    ctx.quadraticCurveTo(mx + (w0 + w1) / 2, my, sx + w0, sy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    drawEye(ctx, { x: ex, y: ey, w: ew, open: 1, pupil: lerp(0.14, 0.24, out) * (1 + 0.4 * hit), smile: lerp(0.62, 0.35, out), style: "ink", t, glow: 0.6 });
  }
  ctx.restore();

  // the question, on the left
  const ta = 1 - seg(t, bt(95.75), bt(96.1));
  if (ta > 0) {
    ctx.save();
    ctx.globalAlpha = ta;
    stamped(ctx, RIGHT_HAND[0].text, t, bt(RIGHT_HAND[0].bar) + 0.05, 96, 300, C.bone, BEAT);
    stamped(ctx, RIGHT_HAND[1].text, t, bt(RIGHT_HAND[1].bar) + 0.05, 96, 384, C.red, BEAT);
    ctx.restore();
  }
}
