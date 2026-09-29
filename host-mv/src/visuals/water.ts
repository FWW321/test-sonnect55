/**
 * 表面风平浪静 — the surface. The reflection is drawn from a second, separately painted world (the mirror
 * world), sampled row by row upside down with a ripple, then tinted by the water. Because the mirror world
 * is its own picture, it does not have to agree with the one above it — and it doesn't.
 */
import { Ctx } from "../lib/draw";
import { TAU, clamp, hash01, lerp } from "../lib/math";
import { H, W } from "../theme";
import { Palette, WL } from "./city";

const WATER: Record<Palette, [string, string, string]> = {
  day: ["#cde0ee", "#a9c3da", "rgba(205,224,238,0.42)"],
  rose: ["#e9c6d3", "#b88aa6", "rgba(233,198,211,0.4)"],
  dark: ["#0a0708", "#020203", "rgba(10,5,6,0.45)"],
};

export interface WaterOpts {
  palette: Palette;
  /** 0 glassy … 1 choppy … 3 a storm */
  waves: number;
  /** how much of the mirror world shows through */
  reflect: number;
  sunX: number;
  /** sun glitter */
  glitter: number;
}

export function water(ctx: Ctx, mirror: HTMLCanvasElement, dpr: number, t: number, o: WaterOpts) {
  const [c0, c1, tint] = WATER[o.palette];
  const g = ctx.createLinearGradient(0, WL, 0, H);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fillRect(0, WL, W, H - WL);

  // the reflection: row y of the water shows row (2·WL − y) of the mirror world
  ctx.save();
  ctx.globalAlpha = clamp(o.reflect);
  const strip = 2;
  const depthMax = H - WL;
  for (let y = WL; y < H; y += strip) {
    const d = y - WL;
    const k = d / depthMax;
    const amp = (0.6 + 5.5 * k) * o.waves;
    const dx = amp * (Math.sin(d * 0.085 + t * 2.3) + 0.55 * Math.sin(d * 0.21 - t * 3.1) + 0.3 * Math.sin(d * 0.47 + t * 5.3));
    const dy = o.waves * (1 + 3 * k) * Math.sin(d * 0.05 + t * 1.7);
    const sy = WL - d - strip + dy;
    if (sy < 0) break;
    ctx.drawImage(mirror, 0, Math.max(0, sy * dpr), W * dpr, strip * dpr, dx, y, W, strip + 0.6);
  }
  ctx.restore();

  // the water's own colour over the reflection, deeper toward the viewer
  ctx.fillStyle = tint;
  ctx.fillRect(0, WL, W, H - WL);
  const deep = ctx.createLinearGradient(0, WL, 0, H);
  deep.addColorStop(0, "rgba(0,0,0,0)");
  deep.addColorStop(1, o.palette === "dark" ? "rgba(0,0,0,0.6)" : "rgba(40,60,100,0.16)");
  ctx.fillStyle = deep;
  ctx.fillRect(0, WL, W, H - WL);

  // glitter: short bright dashes, thickest under the sun
  if (o.glitter > 0) {
    ctx.save();
    ctx.globalCompositeOperation = o.palette === "dark" ? "lighter" : "screen";
    for (let i = 0; i < 90; i++) {
      const k = hash01(i, 71);
      const d = 4 + k * k * (depthMax - 10);
      const spread = 30 + d * 1.6;
      const x = o.sunX + (hash01(i, 72) + hash01(i, 73) - 1) * spread * 1.4 + Math.sin(t * 0.7 + i) * 6;
      const tw = Math.pow(Math.max(0, Math.sin(t * (1.4 + hash01(i, 74) * 2.2) + i * 1.7)), 6);
      const len = 5 + hash01(i, 75) * 26 * (0.4 + d / depthMax);
      ctx.globalAlpha = o.glitter * tw * (1 - (d / depthMax) * 0.5);
      ctx.fillStyle = o.palette === "dark" ? "#ff3350" : "#fffaf0";
      ctx.fillRect(x - len / 2, WL + d, len, 1.3 + d / depthMax);
    }
    ctx.restore();
  }
  // long slow swells, visible as faint light bands
  ctx.save();
  ctx.globalAlpha = 0.07 + 0.05 * o.waves;
  ctx.strokeStyle = o.palette === "dark" ? "#3a0a12" : "#ffffff";
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const d = lerp(8, depthMax - 12, (i + 0.5) / 9) + Math.sin(t * 0.6 + i) * 4;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 32) {
      const yy = WL + d + Math.sin(x * 0.012 + t * 0.9 + i * 1.3) * (1.5 + d * 0.015) * (0.6 + o.waves);
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();

  // the waterline itself
  ctx.fillStyle = o.palette === "dark" ? "rgba(232,19,47,0.5)" : "rgba(255,255,255,0.7)";
  ctx.fillRect(0, WL - 0.5, W, 1.2);
}

/** Storm waves drawn *over* the water (the chorus): layered choppy crests with foam on their lips. */
export function stormWaves(ctx: Ctx, t: number, amount: number, color: string) {
  if (amount <= 0.01) return;
  ctx.save();
  const crest = (x: number, layer: number) => {
    const ph = x * (0.011 + layer * 0.003) - t * (2.2 + layer * 0.7) + layer * 1.7;
    // a trochoid-ish profile: sharp tops, flat troughs
    const s = Math.sin(ph);
    return -Math.pow((s + 1) / 2, 2.4) * 2 + 0.6 * Math.sin(x * 0.031 + t * (3.1 + layer * 0.4)) * 0.25;
  };
  for (let layer = 0; layer < 4; layer++) {
    const y0 = WL + 44 + layer * 58;
    const amp = (7 + layer * 9) * amount;
    ctx.globalAlpha = 0.16 + 0.1 * layer;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) ctx.lineTo(x, y0 + amp * crest(x, layer));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    // foam on the crests
    ctx.globalAlpha = (0.25 + 0.12 * layer) * amount;
    ctx.strokeStyle = "rgba(255,245,245,0.9)";
    ctx.lineWidth = 1 + layer * 0.4;
    ctx.beginPath();
    let pen = false;
    for (let x = 0; x <= W; x += 6) {
      const c = crest(x, layer);
      const y = y0 + amp * c;
      if (c < -1.2) {
        if (!pen) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        pen = true;
      } else pen = false;
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Concentric ripples spreading from a point on the water (the crack). */
export function ripples(ctx: Ctx, x: number, y: number, t: number, t0: number, color: string, count = 4) {
  const age = t - t0;
  if (age < 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  for (let k = 0; k < count; k++) {
    const a = age - k * 0.35;
    if (a < 0) continue;
    const r = a * 160;
    const alpha = Math.max(0, 0.6 - a * 0.35);
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.16, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}
