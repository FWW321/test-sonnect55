/**
 * Tendrils with blades for tips — the parasites' weapon in Parasyte, here grown out of the water.
 * Each is a spine that lashes (a travelling sine with a curl toward the tip) and a body that tapers and
 * then widens into a leaf-shaped blade.
 */
import { Ctx } from "../lib/draw";
import { TAU, clamp, hash01 } from "../lib/math";

export interface Tendril {
  x: number;
  y: number;
  /** direction in radians (−π/2 = straight up) */
  angle: number;
  length: number;
  width: number;
  /** 0 … 1 how far it has grown */
  grow: number;
  /** phase / seed */
  seed: number;
  whip?: number;
}

function spine(o: Tendril, t: number, n = 40): [number, number][] {
  const pts: [number, number][] = [];
  const L = o.length * clamp(o.grow);
  const whip = o.whip ?? 1;
  let ang = o.angle;
  let x = o.x;
  let y = o.y;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    pts.push([x, y]);
    const bend = (Math.sin(s * 5.5 - t * 4.2 + o.seed * 7) * 0.12 + Math.sin(s * 11 + t * 2.3 + o.seed) * 0.05) * whip + s * s * 0.9 * Math.sin(o.seed * 3.1 + t * 0.8) * whip;
    ang = o.angle + bend;
    x += (Math.cos(ang) * L) / n;
    y += (Math.sin(ang) * L) / n;
  }
  return pts;
}

/** Draw one tendril: body in `fill`, edges in `edge`. */
export function tendril(ctx: Ctx, o: Tendril, t: number, fill: string, edge: string) {
  if (o.grow <= 0.01) return;
  const pts = spine(o, t);
  const n = pts.length - 1;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const [x0, y0] = pts[Math.max(0, i - 1)];
    const [x1, y1] = pts[Math.min(n, i + 1)];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    // a thin whip of a body, then a long asymmetric blade: one edge nearly straight, the other a curve
    // that swells to its widest at s≈0.8 and runs to a point
    const body = o.width * 0.42 * (1 - s * 0.45);
    let wl = body;
    let wr = body;
    if (s > 0.6) {
      const v = (s - 0.6) / 0.4;
      const swell = Math.sin(Math.pow(v, 0.8) * Math.PI) * (1 - v * 0.15);
      wl = body * (1 - v) + o.width * 1.25 * swell;
      wr = body * (1 - v) + o.width * 0.35 * swell;
    }
    if (s >= 0.999) wl = wr = 0;
    left.push([pts[i][0] + (nx * wl) / 2, pts[i][1] + (ny * wl) / 2]);
    right.push([pts[i][0] - (nx * wr) / 2, pts[i][1] - (ny * wr) / 2]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // a bright edge along the blade
  ctx.beginPath();
  const k0 = Math.floor(n * 0.62);
  ctx.moveTo(left[k0][0], left[k0][1]);
  for (let i = k0; i <= n; i++) ctx.lineTo(left[i][0], left[i][1]);
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** A set of tendrils erupting from a line (the waterline) — grown by `grow`, lashing with t. */
export function tendrilField(ctx: Ctx, t: number, count: number, baseY: number, grow: number, seed: number, fill = "#050507", edge = "rgba(232,19,47,0.9)", scale = 1) {
  for (let i = 0; i < count; i++) {
    const x = 60 + hash01(i, seed) * 1160;
    const g = clamp(grow * (1.25 - hash01(i, seed + 1) * 0.5));
    tendril(
      ctx,
      {
        x,
        y: baseY,
        angle: -Math.PI / 2 + (hash01(i, seed + 2) - 0.5) * 1.3,
        length: (180 + hash01(i, seed + 3) * 320) * scale,
        width: (14 + hash01(i, seed + 4) * 16) * scale,
        grow: g,
        seed: i + seed * 0.37,
      },
      t,
      fill,
      edge,
    );
  }
}

/** Radial burst of tendrils from a point (the eye close-up). */
export function tendrilBurst(ctx: Ctx, cx: number, cy: number, r0: number, t: number, count: number, grow: number, seed: number) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + hash01(i, seed) * 0.4;
    tendril(
      ctx,
      {
        x: cx + Math.cos(a) * r0,
        y: cy + Math.sin(a) * r0,
        angle: a,
        length: 260 + hash01(i, seed + 1) * 360,
        width: 16 + hash01(i, seed + 2) * 14,
        grow: clamp(grow * (1.3 - hash01(i, seed + 3) * 0.6)),
        seed: i * 1.7 + seed,
        whip: 0.7,
      },
      t,
      "#050507",
      "rgba(232,19,47,0.95)",
    );
  }
}
