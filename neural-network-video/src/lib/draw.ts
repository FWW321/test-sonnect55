/** Canvas 2D drawing primitives shared by every chapter. All coordinates are logical (1280×720) pixels. */
import { FONT_CJK, FONT_MONO, FONT_SANS } from "../fonts";
import { C, RGB, RGB_POS } from "../theme";
import { rgba } from "./color";
import { clamp } from "./math";

type Ctx = CanvasRenderingContext2D;

export const FONTS = { sans: FONT_SANS, cjk: FONT_CJK, mono: FONT_MONO };

// ------------------------------------------------------------------ shapes

export interface ShapeStyle {
  fill?: string;
  stroke?: string;
  lw?: number;
  alpha?: number;
}

export function circle(ctx: Ctx, x: number, y: number, r: number, s: ShapeStyle = {}) {
  if (r <= 0) return;
  const a = ctx.globalAlpha;
  if (s.alpha !== undefined) ctx.globalAlpha = a * s.alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (s.fill) {
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
  if (s.stroke) {
    ctx.lineWidth = s.lw ?? 1;
    ctx.strokeStyle = s.stroke;
    ctx.stroke();
  }
  ctx.globalAlpha = a;
}

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, s: ShapeStyle = {}) {
  const a = ctx.globalAlpha;
  if (s.alpha !== undefined) ctx.globalAlpha = a * s.alpha;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (s.fill) {
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
  if (s.stroke) {
    ctx.lineWidth = s.lw ?? 1;
    ctx.strokeStyle = s.stroke;
    ctx.stroke();
  }
  ctx.globalAlpha = a;
}

export interface LineStyle {
  color?: string;
  lw?: number;
  alpha?: number;
  dash?: number[];
  cap?: CanvasLineCap;
}

export function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, s: LineStyle = {}) {
  const a = ctx.globalAlpha;
  if (s.alpha !== undefined) ctx.globalAlpha = a * s.alpha;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = s.color ?? C.text;
  ctx.lineWidth = s.lw ?? 1;
  ctx.lineCap = s.cap ?? "butt";
  if (s.dash) ctx.setLineDash(s.dash);
  ctx.stroke();
  if (s.dash) ctx.setLineDash([]);
  ctx.globalAlpha = a;
}

export function polyline(ctx: Ctx, pts: ArrayLike<number>, s: LineStyle & { close?: boolean; fill?: string } = {}) {
  const n = pts.length / 2;
  if (n < 2) return;
  const a = ctx.globalAlpha;
  if (s.alpha !== undefined) ctx.globalAlpha = a * s.alpha;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[2 * i], pts[2 * i + 1]);
  if (s.close) ctx.closePath();
  if (s.fill) {
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
  if (s.color) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.lw ?? 1;
    ctx.lineCap = s.cap ?? "round";
    ctx.lineJoin = "round";
    if (s.dash) ctx.setLineDash(s.dash);
    ctx.stroke();
    if (s.dash) ctx.setLineDash([]);
  }
  ctx.globalAlpha = a;
}

export function arrow(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  s: LineStyle & { head?: number } = {},
) {
  const a = ctx.globalAlpha;
  if (s.alpha !== undefined) ctx.globalAlpha = a * s.alpha;
  const head = s.head ?? 9;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const bx = x2 - Math.cos(ang) * Math.min(head * 0.8, len * 0.5);
  const by = y2 - Math.sin(ang) * Math.min(head * 0.8, len * 0.5);
  ctx.strokeStyle = s.color ?? C.text;
  ctx.fillStyle = s.color ?? C.text;
  ctx.lineWidth = s.lw ?? 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(ang - 0.42), y2 - head * Math.sin(ang - 0.42));
  ctx.lineTo(x2 - head * Math.cos(ang + 0.42), y2 - head * Math.sin(ang + 0.42));
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = a;
}

// ------------------------------------------------------------------ glow (cheap, sprite based)

const glowCache = new Map<string, HTMLCanvasElement>();
function glowSprite(c: RGB): HTMLCanvasElement {
  const key = `${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])}`;
  let sp = glowCache.get(key);
  if (!sp) {
    // Procedural profile with a long soft tail, plus ±½-LSB dither on alpha so the halo does not
    // band on a near-black background (8-bit gradients otherwise show concentric rings).
    const S = 160;
    sp = document.createElement("canvas");
    sp.width = sp.height = S;
    const g = sp.getContext("2d")!;
    const img = g.createImageData(S, S);
    const R = S / 2;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const r = Math.hypot(x + 0.5 - R, y + 0.5 - R) / R;
        const fall = Math.max(0, 1 - r * r);
        const prof = (0.62 * Math.exp(-r * r * 38) + 0.38 * Math.exp(-r * r * 6.5)) * fall * fall;
        const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1; // deterministic hash noise
        const a = Math.max(0, Math.min(255, prof * 255 + (Math.abs(n) - 0.5) * 1.6));
        const o = 4 * (y * S + x);
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = a;
      }
    }
    g.putImageData(img, 0, 0);
    glowCache.set(key, sp);
  }
  return sp;
}

/**
 * Additive light. Reserved for *data* — an activation, a signal pulse — never for headings.
 * `r` is the radius of the visible halo.
 */
export function glow(ctx: Ctx, x: number, y: number, r: number, c: RGB = RGB_POS, alpha = 1) {
  if (r <= 0 || alpha <= 0) return;
  const a = ctx.globalAlpha;
  const op = ctx.globalCompositeOperation;
  ctx.globalAlpha = a * clamp(alpha);
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(glowSprite(c), x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = op;
  ctx.globalAlpha = a;
}

// ------------------------------------------------------------------ text

export interface TextStyle {
  size?: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  font?: "sans" | "cjk" | "mono";
  alpha?: number;
  italic?: boolean;
}

export function text(ctx: Ctx, s: string, x: number, y: number, st: TextStyle = {}) {
  const a = ctx.globalAlpha;
  if (st.alpha !== undefined) ctx.globalAlpha = a * st.alpha;
  ctx.font = `${st.italic ? "italic " : ""}${st.weight ?? 500} ${st.size ?? 16}px ${FONTS[st.font ?? "cjk"]}`;
  ctx.fillStyle = st.color ?? C.text;
  ctx.textAlign = st.align ?? "left";
  ctx.textBaseline = st.base ?? "alphabetic";
  ctx.fillText(s, x, y);
  ctx.globalAlpha = a;
}

// ------------------------------------------------------------------ rasters

const rasterCache = new Map<string, HTMLCanvasElement>();

/**
 * Paint an nx×ny scalar field as a heat-map into the rectangle (x, y, w, h).
 * `smooth` uses bilinear up-scaling (fields); off gives crisp cells (pixel art, digits).
 */
export function heatmap(
  ctx: Ctx,
  values: ArrayLike<number>,
  nx: number,
  ny: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: (v: number) => RGB,
  opts: { smooth?: boolean; alpha?: number } = {},
) {
  const key = `${nx}x${ny}`;
  let cv = rasterCache.get(key);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = nx;
    cv.height = ny;
    rasterCache.set(key, cv);
  }
  const g = cv.getContext("2d")!;
  const img = g.createImageData(nx, ny);
  const d = img.data;
  for (let i = 0; i < nx * ny; i++) {
    const c = color(values[i]);
    d[4 * i] = c[0];
    d[4 * i + 1] = c[1];
    d[4 * i + 2] = c[2];
    d[4 * i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const a = ctx.globalAlpha;
  if (opts.alpha !== undefined) ctx.globalAlpha = a * opts.alpha;
  ctx.imageSmoothingEnabled = !!opts.smooth;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cv, x, y, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = a;
}

// ------------------------------------------------------------------ camera

export interface Camera {
  /** World point at the centre of the screen. */
  x: number;
  y: number;
  zoom: number;
}

export const applyCamera = (ctx: Ctx, cam: Camera, w = 1280, h = 720) => {
  ctx.translate(w / 2, h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
};

/** Signal pulse: a bright dot with a short comet tail travelling along a segment at progress p ∈ [0,1]. */
export function pulse(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  p: number,
  c: RGB = RGB_POS,
  size = 3,
  alpha = 1,
) {
  if (p <= 0 || p >= 1) return;
  const x = x1 + (x2 - x1) * p;
  const y = y1 + (y2 - y1) * p;
  const tail = 0.16;
  const p0 = Math.max(0, p - tail);
  const tx = x1 + (x2 - x1) * p0;
  const ty = y1 + (y2 - y1) * p0;
  const g = ctx.createLinearGradient(tx, ty, x, y);
  g.addColorStop(0, rgba(c, 0));
  g.addColorStop(1, rgba(c, 0.85 * alpha));
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x, y);
  ctx.strokeStyle = g;
  ctx.lineWidth = size * 0.9;
  ctx.lineCap = "round";
  ctx.stroke();
  glow(ctx, x, y, size * 3.4, c, 0.9 * alpha);
  circle(ctx, x, y, size * 0.55, { fill: rgba([255, 255, 255], alpha) });
}
