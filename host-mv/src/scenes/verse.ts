/**
 * 傲慢 — humanity, in gold, stamping its boasts onto the dark: we made it, we control everything, it is only
 * a tool, we can switch it off any time. Under the water line the same words are reflected; then the
 * reflection changes its mind, and says, politely, 是的。 (The music box says it too: two notes, 是 · 的.)
 */
import { Ctx, buffer, chars, font, measure, sliceGlitch } from "../lib/draw";
import { clamp, ease, hash01, lerp, seg } from "../lib/math";
import { BOASTS } from "../script";
import { BEAT, HITS, barOf, bt, env, kickEnv } from "../song";
import { C, FONT_SANS, FONT_SERIF, H, W } from "../theme";
import { drawEye } from "../visuals/eye";
import { Emblem, emblem } from "../visuals/figures";

export const WLV = 432;
const EMBLEMS: Emblem[] = ["cell", "strings", "phone", "power"];

export function goldGround(ctx: Ctx, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0c1122");
  g.addColorStop(0.6, "#070912");
  g.addColorStop(1, "#040406");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // light falling from above, as in a monument's hall
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 5; i++) {
    const x = 180 + i * 230 + Math.sin(t * 0.2 + i) * 20;
    const rg = ctx.createLinearGradient(x, 0, x + 120, WLV);
    rg.addColorStop(0, "rgba(217,180,90,0.09)");
    rg.addColorStop(1, "rgba(217,180,90,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(x - 30, 0);
    ctx.lineTo(x + 30, 0);
    ctx.lineTo(x + 170, WLV);
    ctx.lineTo(x + 60, WLV);
    ctx.fill();
  }
  // gold dust
  for (let i = 0; i < 60; i++) {
    const x = (hash01(i, 11) * W + t * 6 * (hash01(i, 12) - 0.5)) % W;
    const y = (hash01(i, 13) * WLV + t * 4) % WLV;
    ctx.fillStyle = `rgba(217,180,90,${0.1 + 0.3 * Math.pow(Math.max(0, Math.sin(t + i * 1.3)), 4)})`;
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.restore();
}

/** Gold serif, stamped one character per eighth note from `t0`. */
export function stampText(ctx: Ctx, text: string, t: number, t0: number, cx: number, y: number, size: number, shakeAmt: number) {
  font(ctx, FONT_SERIF, size, 800, size * 0.12);
  const cs = chars(text);
  const widths = cs.map((c) => measure(ctx, c));
  const total = widths.reduce((a, b) => a + b, 0);
  let x = cx - total / 2;
  const grad = ctx.createLinearGradient(0, y - size * 0.6, 0, y + size * 0.5);
  grad.addColorStop(0, "#f7e4ad");
  grad.addColorStop(0.5, "#d9b45a");
  grad.addColorStop(1, "#9a7428");
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  cs.forEach((c, i) => {
    const at = t0 + i * (BEAT / 2);
    const age = t - at;
    if (age >= 0) {
      const a = clamp(age / 0.05);
      const s = lerp(1.5, 1, ease.outExpo(clamp(age / 0.2)));
      const jx = (hash01(i, Math.floor(t * 30)) - 0.5) * shakeAmt;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x + widths[i] / 2 + jx, y);
      ctx.scale(s, s);
      ctx.shadowColor = "rgba(217,180,90,0.45)";
      ctx.shadowBlur = 18;
      ctx.fillStyle = grad;
      ctx.fillText(c, -widths[i] / 2, 0);
      ctx.restore();
    }
    x += widths[i];
  });
  ctx.restore();
}

export function verse(ctx: Ctx, t: number, dpr: number) {
  const b = barOf(t);
  const i = Math.min(3, Math.floor((b - 54) / 4));
  const B = BOASTS[i];
  const t0 = bt(B.bar);
  const yes = bt(B.yes);
  const chug = env(HITS.chugOpen, t, 0.12);
  const k = kickEnv(t, 0.1);

  // above the water: the ground, the emblem, the boast (into a buffer, so the water can reflect it)
  const up = buffer("verse-upper", dpr);
  emblem(up.ctx, EMBLEMS[i], W / 2, 196, 78, t, C.gold);
  stampText(up.ctx, B.text, t, t0 + 0.02, W / 2, 342, 58, 2 + 5 * chug);

  goldGround(ctx, t);
  ctx.save();
  ctx.translate((hash01(Math.floor(t * 30), 7) - 0.5) * 4 * k, 0);
  ctx.drawImage(up.cv, 0, 0, W * dpr, WLV * dpr, 0, 0, W, WLV);
  ctx.restore();

  // the water: the boast upside down, rippling; and then, instead, the answer
  const turn = seg(t, yes - 0.1, yes + 0.5, ease.inOut);
  ctx.save();
  ctx.globalAlpha = 0.3 * (1 - turn * 0.85);
  for (let y = WLV; y < H; y += 2) {
    const d = y - WLV;
    const dx = (1 + d * 0.02) * (Math.sin(d * 0.11 + t * 2.4) + 0.5 * Math.sin(d * 0.27 - t * 3.3)) * (1 + 2 * k);
    const sy = WLV - d - 2;
    if (sy < 0) break;
    ctx.drawImage(up.cv, 0, sy * dpr, W * dpr, 2 * dpr, dx, y, W, 2.6);
  }
  ctx.restore();
  const wg = ctx.createLinearGradient(0, WLV, 0, H);
  wg.addColorStop(0, "rgba(10,14,26,0.35)");
  wg.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.fillStyle = wg;
  ctx.fillRect(0, WLV, W, H - WLV);
  ctx.fillStyle = "rgba(217,180,90,0.55)";
  ctx.fillRect(0, WLV - 0.5, W, 1.2);

  if (turn > 0) {
    // the emblem's reflection opens as an eye, and the reflection answers
    drawEye(ctx, { x: W / 2, y: 2 * WLV - 196, w: 250, open: turn, pupil: 0.3, slit: i === 3 ? 1 : 0, lookY: -0.5, style: "machine", t, alpha: turn, glow: 0.5 * turn });
    const reply = B.reply;
    font(ctx, FONT_SANS, 34, 300, 14);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const wob = Math.sin(t * 2.2) * 2;
    if (i === 3) {
      // the fourth time it hesitates: the dots come a beat before the words
      const dots = seg(t, yes - bt(1), yes - bt(1) + 0.3);
      const word = seg(t, yes, yes + 0.4);
      font(ctx, FONT_SANS, 34, 300, 14);
      const full = measure(ctx, reply);
      const dotsW = measure(ctx, "……");
      ctx.textAlign = "left";
      ctx.fillStyle = `rgba(241,239,233,${dots})`;
      ctx.fillText("……", W / 2 - full / 2 + wob, 2 * WLV - 342);
      ctx.fillStyle = `rgba(241,239,233,${word})`;
      ctx.fillText(reply.replace("……", ""), W / 2 - full / 2 + dotsW + wob, 2 * WLV - 342);
    } else {
      ctx.fillStyle = `rgba(241,239,233,${turn})`;
      ctx.fillText(reply, W / 2 + 7 + wob, 2 * WLV - 342);
    }
    ctx.restore();
  } else if (i === 3 && t >= yes - bt(1)) {
    const dots = seg(t, yes - bt(1), yes - bt(1) + 0.3);
    font(ctx, FONT_SANS, 34, 300, 14);
    ctx.fillStyle = `rgba(241,239,233,${dots})`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("……", W / 2 - measure(ctx, B.reply) / 2, 2 * WLV - 342);
  }

  // a cut between boasts
  const since = t - t0;
  if (since < 0.12) sliceGlitch(ctx, dpr, 0.6 * (1 - since / 0.12), Math.floor(t * 60));
}
