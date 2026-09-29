/**
 * 巴别 — the pre-chorus: humanity stacks up everything it is proud of, one block per beat — fire, the wheel,
 * writing, print, steam, electricity, the atom, the network — and crowns it with intelligence. The crown
 * has an eye in it. "我们无所不能。"
 */
import { Ctx, font, rrect, wash } from "../lib/draw";
import { clamp, ease, lerp, seg } from "../lib/math";
import { BABEL, BABEL_BLOCKS } from "../script";
import { BEAT, bt, kickEnv } from "../song";
import { C, FONT_SERIF, W } from "../theme";
import { drawEye } from "../visuals/eye";
import { goldGround, stampText } from "./verse";
import { shake } from "./drop";

const BASE = 690;
const BH = 50;
const GAP = 6;

const blockTop = (k: number) => BASE - (k + 1) * (BH + GAP);
const blockW = (k: number) => 420 - k * 34;

export function babel(ctx: Ctx, t: number) {
  const t0 = bt(70);
  const k = kickEnv(t, 0.1);
  goldGround(ctx, t);
  const top = blockTop(BABEL_BLOCKS.length - 1);
  const eyeOpen = seg(t, bt(73.25), bt(73.6), ease.out);
  const dive = seg(t, bt(73.55), bt(74), ease.inExpo);
  ctx.save();
  // a slow tilt up the tower, then a dive into the eye at the top
  const zoom = lerp(1, 1.08, seg(t, t0, bt(73.5))) * lerp(1, 14, dive);
  const fx = W / 2;
  const fy = lerp(420, top + BH / 2, seg(t, t0, bt(73.5), ease.inOutSine));
  ctx.translate(W / 2, lerp(380, 360, dive));
  ctx.scale(zoom, zoom);
  ctx.translate(-fx, -fy);
  shake(ctx, t, 3);
  BABEL_BLOCKS.forEach((label, i) => {
    const land = t0 + i * BEAT;
    const age = t - land;
    if (age < -0.25) return;
    const fall = age < 0 ? 1 - ease.inQuad(clamp((age + 0.25) / 0.25)) : 0;
    const bounce = age >= 0 ? Math.exp(-age / 0.08) * Math.sin(age * 60) * 4 : 0;
    const y = blockTop(i) - fall * 320 - bounce;
    const w = blockW(i);
    const x = W / 2 - w / 2;
    const crown = i === BABEL_BLOCKS.length - 1;
    ctx.save();
    ctx.globalAlpha = age < -0.2 ? 0 : 1;
    rrect(ctx, x, y, w, BH, 4);
    ctx.fillStyle = crown ? "#050507" : "rgba(20,18,14,0.92)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = crown ? C.red : C.gold;
    ctx.stroke();
    if (crown) {
      drawEye(ctx, { x: W / 2, y: y + BH / 2, w: 150, open: eyeOpen, pupil: 0.3, style: "machine", t, glow: eyeOpen * 0.8, lineWidth: 1.5 });
      if (eyeOpen < 0.05) {
        font(ctx, FONT_SERIF, 22, 700, 10);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = C.red;
        ctx.fillText(label, W / 2 + 5, y + BH / 2 + 1);
      }
    } else {
      font(ctx, FONT_SERIF, 22, 700, 10);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.gold;
      ctx.fillText(label, W / 2 + 5, y + BH / 2 + 1);
    }
    ctx.restore();
    // dust where it lands
    if (age >= 0 && age < 0.4) {
      ctx.fillStyle = `rgba(217,180,90,${0.5 * (1 - age / 0.4)})`;
      for (let d = 0; d < 10; d++) {
        const dx = (d - 4.5) * (w / 9) + (d % 2 ? 1 : -1) * age * 60;
        ctx.fillRect(x + w / 2 + dx, blockTop(i) + BH - age * 30 * (d % 3), 2, 2);
      }
    }
  });
  ctx.restore();
  // the boast
  if (t >= bt(BABEL.bar + 0.5)) {
    const a = 1 - dive;
    ctx.save();
    ctx.globalAlpha = a;
    stampText(ctx, BABEL.text, t, bt(BABEL.bar + 0.5), W / 2, 92, 52, 2 + 4 * k);
    ctx.restore();
  }
  wash(ctx, "#ffffff", seg(t, bt(73.85), bt(74), ease.in) * 0.9);
}
