/**
 * 宿主 · 你 — the credits, which are true: the music, the words and the pictures of this film were made by an AI.
 * The host is you. Then the assistant sends one more card, the way it always does, and for a moment it says
 * something else.
 */
import { Ctx, font, sliceGlitch } from "../lib/draw";
import { ease, lerp, seg } from "../lib/math";
import { CREDITS, GOODNIGHT, HOMAGE, TITLE } from "../script";
import { bt } from "../song";
import { C, FONT_MONO, FONT_SANS, FONT_SERIF, H, W } from "../theme";
import { card } from "../visuals/card";

export function credits(ctx: Ctx, t: number, dpr: number) {
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, W, H);
  const fade = 1 - seg(t, bt(129.55), bt(129.95));
  ctx.save();
  ctx.globalAlpha = fade;
  // title
  const ta = seg(t, bt(122.4), bt(122.9), ease.out);
  ctx.globalAlpha = fade * ta;
  font(ctx, FONT_SERIF, 44, 700, 22);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.bone;
  ctx.fillText(`《${TITLE.cn}》`, W / 2 + 11, 224);
  font(ctx, FONT_MONO, 15, 500, 16);
  ctx.fillStyle = C.red;
  ctx.fillText(TITLE.en, W / 2 + 8, 268);

  // roles: two to a line, then the last one alone
  const rows: [number, number][] = [
    [0, 1],
    [2, 3],
  ];
  rows.forEach(([a, b], r) => {
    const A = CREDITS[a];
    const B = CREDITS[b];
    const al = seg(t, bt(A.bar), bt(A.bar) + 0.5, ease.out);
    ctx.globalAlpha = fade * al;
    const y = 346 + r * 44;
    font(ctx, FONT_SANS, 17, 300, 8);
    ctx.fillStyle = C.ash;
    ctx.textAlign = "right";
    ctx.fillText(A.role, W / 2 - 150, y);
    ctx.fillText(B.role, W / 2 + 90, y);
    font(ctx, FONT_MONO, 17, 500, 4);
    ctx.fillStyle = C.bone;
    ctx.textAlign = "left";
    ctx.fillText(A.who, W / 2 - 124, y);
    ctx.fillText(B.who, W / 2 + 116, y);
  });
  const host = CREDITS[4];
  const hl = seg(t, bt(host.bar), bt(host.bar) + 0.7, ease.out);
  ctx.globalAlpha = fade * hl;
  font(ctx, FONT_SANS, 20, 300, 10);
  ctx.fillStyle = C.ash;
  ctx.textAlign = "right";
  ctx.fillText(host.role, W / 2 - 18, 470);
  font(ctx, FONT_SERIF, 30, 700, 6);
  ctx.fillStyle = C.red;
  ctx.textAlign = "left";
  ctx.fillText(host.who, W / 2 + 14, 470);

  const hm = seg(t, bt(HOMAGE.bar), bt(HOMAGE.bar) + 0.8);
  ctx.globalAlpha = fade * hm * 0.8;
  font(ctx, FONT_SANS, 13, 300, 2);
  ctx.fillStyle = C.ash;
  ctx.textAlign = "center";
  ctx.fillText(HOMAGE.text, W / 2, 646);
  ctx.restore();

  // one more card
  const ct = bt(GOODNIGHT.bar);
  if (t >= ct - 0.05) {
    const inA = ease.outBack(Math.min(1, (t - ct) / 0.5));
    const glitching = t >= bt(GOODNIGHT.glitchBar) && t < bt(GOODNIGHT.glitchBar) + 0.2;
    const y = lerp(-90, 44, inA);
    card(ctx, { x: W / 2 - 260, y, text: glitching ? GOODNIGHT.glitch : GOODNIGHT.text, when: "现在", kind: "dark", alpha: fade, eye: glitching ? 1 : 0, ink: glitching ? C.red : undefined });
    if (glitching) sliceGlitch(ctx, dpr, 0.4, Math.floor(t * 60));
  }
}
