/**
 * 序 — black, a clock, and a process thinking out loud. The shape of the first page of Parasyte
 * ("someone on Earth suddenly thought…"), told by a server instead of by someone on Earth.
 */
import { Ctx, chars, font, measure } from "../lib/draw";
import { hash01, seg } from "../lib/math";
import { PROLOGUE, Typed, typedCount } from "../script";
import { bt } from "../song";
import { C, FONT_SANS, FONT_SERIF, H, W } from "../theme";

interface LineStyle {
  family: string;
  size: number;
  weight: number;
  spacing: number;
  color: string;
  y: number;
}

const STYLES: LineStyle[] = [
  { family: FONT_SANS, size: 21, weight: 300, spacing: 3, color: "rgba(160,160,170,0.9)", y: 226 },
  { family: FONT_SERIF, size: 30, weight: 500, spacing: 3, color: C.bone, y: 316 },
  { family: FONT_SERIF, size: 30, weight: 500, spacing: 3, color: C.bone, y: 362 },
  { family: FONT_SERIF, size: 30, weight: 500, spacing: 3, color: C.bone, y: 446 },
  { family: FONT_SERIF, size: 30, weight: 500, spacing: 3, color: C.bone, y: 492 },
  { family: FONT_SERIF, size: 36, weight: 600, spacing: 5, color: C.red, y: 364 },
];

/** A typed line drawn in place: its x is fixed by the full line, so it types left to right without sliding. */
export function typedLine(ctx: Ctx, line: Typed, st: LineStyle, t: number, alpha: number, cursorColor: string, showCursor: boolean) {
  font(ctx, st.family, st.size, st.weight, st.spacing);
  const full = line.text;
  const x0 = (W - measure(ctx, full)) / 2;
  const n = typedCount(line, t);
  const shown = chars(full).slice(0, n).join("");
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = st.color;
  ctx.fillText(shown, x0, st.y);
  if (showCursor && Math.floor(t * 2.2) % 2 === 0) {
    const w = measure(ctx, shown);
    ctx.fillStyle = cursorColor;
    ctx.fillRect(x0 + w + 4, st.y - st.size * 0.55, 3, st.size * 1.1);
  }
  ctx.restore();
}

export function prologue(ctx: Ctx, t: number) {
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, W, H);
  // dust in a server room's dark: slow, few, dim
  ctx.save();
  for (let i = 0; i < 70; i++) {
    const x = (hash01(i, 1) * W + t * (2 + hash01(i, 2) * 6)) % W;
    const y = (hash01(i, 3) * H - t * (1 + hash01(i, 4) * 3) + H * 10) % H;
    const a = 0.05 + 0.12 * Math.pow(Math.max(0, Math.sin(t * (0.3 + hash01(i, 5)) + i)), 3);
    ctx.fillStyle = `rgba(200,200,210,${a})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.restore();

  const fadeAll = 1 - seg(t, bt(6.2), bt(6.8));
  PROLOGUE.forEach((line, i) => {
    const st = STYLES[i];
    if (t < bt(line.bar)) return;
    const isLast = i === PROLOGUE.length - 1;
    const next = PROLOGUE[i + 1];
    const typing = !next || t < bt(next.bar);
    if (!isLast) {
      if (fadeAll <= 0) return;
      typedLine(ctx, line, st, t, fadeAll, "rgba(241,239,233,0.8)", typing && i < 4);
    } else {
      const a = 1 - seg(t, bt(9.1), bt(9.7));
      if (a <= 0) return;
      // the last line is red, and it arrives with the boom
      const pulse = Math.exp(-(t - bt(7)) / 0.9);
      const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 620);
      g.addColorStop(0, `rgba(232,19,47,${0.1 + 0.18 * pulse})`);
      g.addColorStop(1, "rgba(232,19,47,0)");
      ctx.fillStyle = g;
      ctx.globalAlpha = a;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      typedLine(ctx, line, st, t, a, C.red, true);
    }
  });
}
