/** Canvas helpers shared by every scene. Everything is a pure function of its arguments (and of t). */
import { H, W } from "../theme";
import { clamp, hash01, mulberry32 } from "./math";

export type Ctx = CanvasRenderingContext2D;

// ------------------------------------------------------------------------------------------ offscreen buffers
const pool = new Map<string, HTMLCanvasElement>();
/** A cached offscreen canvas the size of the backing store, with the logical 1280×720 transform set. */
export function buffer(key: string, dpr: number, clear = true): { cv: HTMLCanvasElement; ctx: Ctx } {
  let cv = pool.get(key);
  if (!cv) {
    cv = document.createElement("canvas");
    pool.set(key, cv);
  }
  const pw = Math.round(W * dpr);
  const ph = Math.round(H * dpr);
  if (cv.width !== pw || cv.height !== ph) {
    cv.width = pw;
    cv.height = ph;
  }
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  if (clear) ctx.clearRect(0, 0, pw, ph);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { cv, ctx };
}

/** Something expensive and static (a skyline, a texture), drawn once per key into its own canvas. */
const statics = new Map<string, HTMLCanvasElement>();
export function cached(key: string, w: number, h: number, dpr: number, paint: (ctx: Ctx) => void): HTMLCanvasElement {
  const k = `${key}@${dpr}`;
  let cv = statics.get(k);
  if (cv) return cv;
  cv = document.createElement("canvas");
  cv.width = Math.ceil(w * dpr);
  cv.height = Math.ceil(h * dpr);
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paint(ctx);
  statics.set(k, cv);
  return cv;
}

// ------------------------------------------------------------------------------------------ type
export function font(ctx: Ctx, family: string, size: number, weight = 400, spacing = 0) {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.letterSpacing = `${spacing}px`;
}

/** Characters of a string (code points, so CJK and punctuation count as one each). */
export const chars = (s: string) => [...s];

/** Width of a string in the current font. */
export const measure = (ctx: Ctx, s: string) => ctx.measureText(s).width;

/**
 * Draw text with a chromatic split: a red copy one way, a cyan copy the other, the text itself on top.
 * `split` is in pixels; 0 draws plain text.
 */
export function splitText(ctx: Ctx, s: string, x: number, y: number, color: string, split: number, alpha = 1) {
  ctx.save();
  if (split > 0.05) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = "rgba(255,30,60,1)";
    ctx.fillText(s, x - split, y);
    ctx.fillStyle = "rgba(0,200,255,0.9)";
    ctx.fillText(s, x + split, y + split * 0.2);
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Rounded rectangle path. */
export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ------------------------------------------------------------------------------------------ post effects
let grainTile: HTMLCanvasElement | null = null;
function grain() {
  if (grainTile) return grainTile;
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 256;
  const g = cv.getContext("2d")!;
  const img = g.createImageData(256, 256);
  const r = mulberry32(4242);
  for (let i = 0; i < 256 * 256; i++) {
    const v = Math.floor(128 + (r() + r() + r() - 1.5) * 120);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = cv;
  return cv;
}

/** Film grain: a noise tile, jumped to a new offset every frame. */
export function drawGrain(ctx: Ctx, t: number, amount: number) {
  if (amount <= 0) return;
  const f = Math.floor(t * 30);
  const pat = ctx.createPattern(grain(), "repeat")!;
  const ox = Math.floor(hash01(f, 1) * 256);
  const oy = Math.floor(hash01(f, 2) * 256);
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = amount;
  ctx.translate(-ox, -oy);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
}

export function vignette(ctx: Ctx, amount: number, color = "0,0,0") {
  if (amount <= 0) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},${amount})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/**
 * Horizontal slice displacement of whatever is on `ctx` (copied through a buffer).
 * `amount` 0…1; `seed` changes the slices.
 */
export function sliceGlitch(ctx: Ctx, dpr: number, amount: number, seed: number) {
  if (amount <= 0.01) return;
  const { cv } = buffer("glitch-src", dpr);
  const bctx = cv.getContext("2d")!;
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.drawImage(ctx.canvas, 0, 0);
  const n = 3 + Math.floor(amount * 12);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < n; i++) {
    const y = Math.floor(hash01(i, seed) * cv.height);
    const h = Math.floor((0.01 + hash01(i, seed + 1) * 0.08 * amount) * cv.height);
    const dx = (hash01(i, seed + 2) - 0.5) * 0.25 * amount * cv.width;
    ctx.drawImage(cv, 0, y, cv.width, h, dx, y, cv.width, h);
  }
  ctx.restore();
}

/** Full-frame colour wash (flashes). */
export function wash(ctx: Ctx, color: string, alpha: number, mode: GlobalCompositeOperation = "source-over") {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = clamp(alpha);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
