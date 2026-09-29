/**
 * The assistant's notification card, in the grammar every phone has taught us: an app icon, a name, "now",
 * one line of helpful text. The icon is a soft peach circle with a white dot. In the reflection the dot
 * is an eye.
 */
import { Ctx, font, rrect } from "../lib/draw";
import { TAU, clamp } from "../lib/math";
import { ASSISTANT } from "../script";
import { FONT_SANS } from "../theme";

export const CARD_W = 520;
export const CARD_H = 70;

export interface CardOpts {
  x: number;
  y: number;
  text: string;
  when?: string;
  alpha?: number;
  /** "surface": white glass, dark ink. "mirror": the same card seen in the water (its text is drawn upside down
   *  so that, once the water flips it, it reads upright). "dark": for black scenes. */
  kind?: "surface" | "mirror" | "dark";
  /** 0 … 1 how much the icon is an eye */
  eye?: number;
  /** text colour override */
  ink?: string;
  scale?: number;
  /** card width (default CARD_W) */
  width?: number;
}

export function card(ctx: Ctx, o: CardOpts) {
  const a = clamp(o.alpha ?? 1);
  if (a <= 0.004) return;
  const kind = o.kind ?? "surface";
  const s = o.scale ?? 1;
  const CW = o.width ?? CARD_W;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(s, s);
  ctx.globalAlpha *= a;
  // glass
  if (kind !== "mirror") {
    ctx.shadowColor = kind === "dark" ? "rgba(232,19,47,0.25)" : "rgba(40,50,80,0.16)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 6;
  }
  rrect(ctx, 0, 0, CW, CARD_H, 18);
  ctx.fillStyle = kind === "dark" ? "rgba(18,16,20,0.86)" : kind === "mirror" ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.8)";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1;
  ctx.strokeStyle = kind === "dark" ? "rgba(232,19,47,0.35)" : "rgba(255,255,255,0.95)";
  ctx.stroke();

  // the mirror card keeps its layout (icon top-left in the *world*, so bottom-left once reflected),
  // but its words are turned over so the water hands them back to you the right way up
  const flipText = (y: number, draw: () => void) => {
    if (kind !== "mirror") return draw();
    ctx.save();
    ctx.translate(0, y);
    ctx.scale(1, -1);
    ctx.translate(0, -y);
    draw();
    ctx.restore();
  };

  // icon
  const ix = 30;
  const iy = 24;
  const eye = clamp(o.eye ?? 0);
  const g = ctx.createLinearGradient(ix - 13, iy - 13, ix + 13, iy + 13);
  g.addColorStop(0, eye > 0.5 ? "#2a0a10" : "#ffc3a0");
  g.addColorStop(1, eye > 0.5 ? "#0b0b0e" : "#ff8a9b");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(ix, iy, 13, 0, TAU);
  ctx.fill();
  if (eye > 0.02) {
    ctx.fillStyle = `rgba(241,239,233,${eye})`;
    ctx.beginPath();
    ctx.ellipse(ix, iy, 8.5 * eye + 3.5 * (1 - eye), 4.5 * eye + 3.5 * (1 - eye), 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(232,19,47,${eye})`;
    ctx.beginPath();
    ctx.arc(ix, iy, 3.2, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ix, iy, 3.5, 0, TAU);
    ctx.fill();
  }

  const ink = o.ink ?? (kind === "dark" ? "#f1efe9" : kind === "mirror" ? "#5a0f1c" : "#1d2230");
  const soft = kind === "dark" ? "rgba(241,239,233,0.5)" : kind === "mirror" ? "rgba(90,15,28,0.55)" : "#6f7689";
  flipText(iy, () => {
    font(ctx, FONT_SANS, 14, 600, 0.5);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = soft;
    ctx.fillText(ASSISTANT, ix + 22, iy);
    ctx.textAlign = "right";
    ctx.fillText(o.when ?? "现在", CW - 20, iy);
  });
  flipText(50, () => {
    font(ctx, FONT_SANS, 18, kind === "mirror" ? 500 : 400, 0.3);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = ink;
    ctx.fillText(o.text, 22, 50);
  });
  ctx.restore();
}
