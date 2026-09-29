/**
 * The city by the water: three layers of procedural skyline (seeded, so the same city every frame),
 * painted once per palette into a cached image. Palettes: the pastel morning, the rose of the chorus,
 * and the dark world (black towers, red windows), plus a version whose windows are eyes.
 */
import { Ctx, cached } from "../lib/draw";
import { TAU, hash01, lerp, mulberry32 } from "../lib/math";
import { W } from "../theme";

export const WL = 452; // the waterline

export type Palette = "day" | "rose" | "dark";

interface Building {
  x: number;
  w: number;
  h: number;
  step?: { w: number; h: number };
  antenna?: number;
  tower?: boolean;
}

function layer(seed: number, minH: number, maxH: number, minW: number, maxW: number): Building[] {
  const r = mulberry32(seed);
  const out: Building[] = [];
  let x = -40;
  while (x < W + 40) {
    const w = lerp(minW, maxW, r());
    const h = lerp(minH, maxH, Math.pow(r(), 1.3));
    const b: Building = { x, w, h };
    if (r() < 0.35) b.step = { w: w * lerp(0.4, 0.75, r()), h: h * lerp(0.08, 0.22, r()) };
    if (r() < 0.22) b.antenna = lerp(10, 34, r());
    out.push(b);
    x += w + (r() < 0.25 ? lerp(2, 12, r()) : 0);
  }
  return out;
}

const FAR = layer(11, 80, 200, 24, 58);
const MID = layer(23, 50, 150, 34, 78);
const NEAR = layer(37, 28, 88, 50, 112);
// a low district where the sun comes up, so it clears the roofs early
for (const L of [FAR, MID, NEAR]) for (const b of L) if (b.x + b.w > 190 && b.x < 470) b.h *= 0.55;
// a television tower gives the city a face
MID.push({ x: 918, w: 16, h: 262, tower: true });

const LAYERS: { b: Building[]; key: "far" | "mid" | "near"; win: number }[] = [
  { b: FAR, key: "far", win: 0.35 },
  { b: MID, key: "mid", win: 0.6 },
  { b: NEAR, key: "near", win: 1 },
];

const COLORS: Record<Palette, { far: string; mid: string; near: string; edge: string; win: string; winOff: string; lit: number }> = {
  day: { far: "#cfd2e4", mid: "#b3b9d4", near: "#949fc1", edge: "rgba(255,240,225,0.55)", win: "#fff3d6", winOff: "rgba(255,255,255,0.16)", lit: 0.1 },
  rose: { far: "#e2c2cf", mid: "#c99bb3", near: "#a8738f", edge: "rgba(255,220,220,0.55)", win: "#ffe2d6", winOff: "rgba(255,255,255,0.12)", lit: 0.28 },
  dark: { far: "#17151b", mid: "#0f0e12", near: "#08080a", edge: "rgba(232,19,47,0.35)", win: "#e8132f", winOff: "rgba(255,255,255,0.025)", lit: 0.2 },
};

function paintBuilding(ctx: Ctx, b: Building, base: number, color: string, edge: string) {
  ctx.fillStyle = color;
  if (b.tower) {
    // shaft, two spheres, needle
    const cx = b.x + b.w / 2;
    ctx.fillRect(cx - 5, base - b.h * 0.72, 10, b.h * 0.72);
    ctx.fillRect(cx - 14, base - b.h * 0.28, 4, b.h * 0.28);
    ctx.fillRect(cx + 10, base - b.h * 0.28, 4, b.h * 0.28);
    ctx.beginPath();
    ctx.arc(cx, base - b.h * 0.3, 17, 0, TAU);
    ctx.arc(cx, base - b.h * 0.72, 12, 0, TAU);
    ctx.fill();
    ctx.fillRect(cx - 1.5, base - b.h, 3, b.h * 0.3);
    return;
  }
  ctx.fillRect(b.x, base - b.h, b.w, b.h);
  if (b.step) ctx.fillRect(b.x + (b.w - b.step.w) / 2, base - b.h - b.step.h, b.step.w, b.step.h);
  if (b.antenna) {
    const top = base - b.h - (b.step?.h ?? 0);
    ctx.fillRect(b.x + b.w * 0.5 - 1, top - b.antenna, 2, b.antenna);
  }
  // the sun is low on the left: a lit edge on every west face
  ctx.fillStyle = edge;
  ctx.fillRect(b.x, base - b.h, 1.5, b.h);
}

function paintWindows(ctx: Ctx, b: Building, base: number, seed: number, pal: (typeof COLORS)[Palette], mode: "plain" | "eyes", density: number) {
  if (b.tower) return;
  const gx = 7;
  const gy = 9;
  const cols = Math.floor((b.w - 6) / gx);
  const rows = Math.floor((b.h - 10) / gy);
  const ox = b.x + (b.w - cols * gx) / 2 + 1.5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hsh = hash01(seed * 7919 + r * 131 + c, 3);
      const x = ox + c * gx;
      const y = base - b.h + 8 + r * gy;
      const lit = hsh < pal.lit * density;
      if (mode === "eyes") {
        // every window an eye: a tiny almond with a red iris
        ctx.fillStyle = "rgba(241,239,233,0.9)";
        ctx.beginPath();
        ctx.ellipse(x + 2, y + 2.5, 2.6, 1.3, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#e8132f";
        ctx.beginPath();
        ctx.arc(x + 2 + (hsh - 0.5) * 1.4, y + 2.5, 1.05, 0, TAU);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = lit ? pal.win : pal.winOff;
      ctx.fillRect(x, y, 3, 4.5);
    }
  }
}

/** The whole skyline for a palette (and optionally eyes for windows), as a cached image of the band above the waterline. */
export function skyline(dpr: number, palette: Palette, mode: "plain" | "eyes" = "plain") {
  const top = WL - 330;
  return {
    top,
    img: cached(`skyline-${palette}-${mode}`, W, 330, dpr, (ctx) => {
      ctx.translate(0, -top);
      const pal = COLORS[palette];
      LAYERS.forEach(({ b, key, win }, li) => {
        const base = WL - (2 - li) * 3; // the far layer sits a touch lower: haze
        b.forEach((bd, i) => {
          paintBuilding(ctx, bd, base, pal[key], pal.edge);
          if (li > 0 || mode === "eyes") paintWindows(ctx, bd, base, li * 1000 + i, pal, mode, win);
        });
        // atmospheric haze between layers
        if (li < 2) {
          const hz = ctx.createLinearGradient(0, WL - 260, 0, WL);
          const c = palette === "dark" ? "5,5,7" : palette === "rose" ? "255,225,225" : "251,226,207";
          hz.addColorStop(0, `rgba(${c},0)`);
          hz.addColorStop(1, `rgba(${c},${palette === "dark" ? 0.25 : 0.35})`);
          ctx.fillStyle = hz;
          ctx.fillRect(0, WL - 330, W, 330);
        }
      });
    }),
  };
}

// ------------------------------------------------------------------------------------------ sky, sun, clouds, birds
const SKY: Record<Palette, [string, string, string]> = {
  day: ["#b9d3ea", "#dbe6f1", "#fbe2cf"],
  rose: ["#c9a7c9", "#f1c7d0", "#ffd9c4"],
  dark: ["#020203", "#0d0507", "#3a0710"],
};

export function sky(ctx: Ctx, palette: Palette) {
  const [top, mid, bottom] = SKY[palette];
  const g = ctx.createLinearGradient(0, 0, 0, WL);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, WL);
}

export function sunGlow(ctx: Ctx, x: number, y: number, r: number, color = "255,241,220", amount = 1) {
  const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 7);
  g.addColorStop(0, `rgba(${color},${0.75 * amount})`);
  g.addColorStop(0.3, `rgba(${color},${0.25 * amount})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
}

export function clouds(ctx: Ctx, t: number, color: string, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) {
    const y = 90 + hash01(i, 40) * 190;
    const speed = 3 + hash01(i, 41) * 5;
    const w = 120 + hash01(i, 42) * 220;
    const x = ((hash01(i, 43) * (W + 400) + t * speed) % (W + 400)) - 200;
    ctx.globalAlpha = alpha * (0.25 + hash01(i, 44) * 0.3);
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.ellipse(x + (k - 2) * w * 0.18, y + Math.abs(k - 2) * 3, w * (0.22 - Math.abs(k - 2) * 0.03), 11 - Math.abs(k - 2) * 2, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A flock crossing the sky: bird i flies from `t0` for `dur` seconds. With `rigid`, the wings never move. */
export const FLOCK = [
  { t0: 15.6, dur: 14, y: 170, dir: 1, size: 1 },
  { t0: 16.1, dur: 14.5, y: 188, dir: 1, size: 0.8 },
  { t0: 16.4, dur: 15, y: 160, dir: 1, size: 0.7 },
  { t0: 24.5, dur: 12, y: 240, dir: -1, size: 0.9 },
  { t0: 25.2, dur: 12.5, y: 228, dir: -1, size: 0.75 },
  { t0: 172.5, dur: 12, y: 176, dir: 1, size: 1 },
  { t0: 173.0, dur: 12.4, y: 196, dir: 1, size: 0.8 },
];

export function birds(ctx: Ctx, t: number, color: string, rigid: boolean, freezeAt = Infinity) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  FLOCK.forEach((b, i) => {
    const tt = Math.min(t, freezeAt);
    const u = (tt - b.t0) / b.dur;
    if (u < 0 || u > 1) return;
    const x = b.dir > 0 ? lerp(-40, W + 40, u) : lerp(W + 40, -40, u);
    const y = b.y + Math.sin(u * 9 + i) * 8;
    const s = 9 * b.size;
    const flap = rigid ? 0.15 : Math.sin(tt * 11 + i * 2);
    ctx.lineWidth = 1.6 * b.size;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s * 0.3 * flap - 2);
    ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.5 * flap - 3, x, y);
    ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.5 * flap - 3, x + s, y - s * 0.3 * flap - 2);
    ctx.stroke();
  });
  ctx.restore();
}
