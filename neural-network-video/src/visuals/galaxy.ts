/**
 * A galaxy of dots — one dot per parameter (or per thousand, or per few million). Positive weights are cyan, negative
 * orange, the dense core is white. Deterministic; drawn as batches of tiny squares so 60 000 dots stay cheap.
 */
import { gaussian, mulberry32 } from "../lib/math";
import { glow } from "../lib/draw";
import { RGB_POS } from "../theme";

type Ctx = CanvasRenderingContext2D;

export const G_N = 60000;

const memo = <T,>(f: () => T) => {
  let v: T | undefined;
  return () => (v ??= f());
};

export const galaxy = memo(() => {
  const rng = mulberry32(7);
  const x = new Float32Array(G_N);
  const y = new Float32Array(G_N);
  const cls = new Uint8Array(G_N); // 0 cyan, 1 orange, 2 white
  const sz = new Float32Array(G_N);
  for (let i = 0; i < G_N; i++) {
    let px: number;
    let py: number;
    if (rng() < 0.2) {
      // bulge
      const r = Math.abs(gaussian(rng)) * 0.13;
      const a = rng() * Math.PI * 2;
      px = r * Math.cos(a);
      py = r * Math.sin(a) * 0.8;
      cls[i] = rng() < 0.55 ? 2 : rng() < 0.5 ? 0 : 1;
    } else {
      const r = Math.pow(rng(), 0.7);
      const arm = i % 2;
      const a = arm * Math.PI + r * 4.6 + gaussian(rng) * 0.34 * (1.15 - 0.6 * r);
      px = r * Math.cos(a);
      py = r * Math.sin(a) * 0.62;
      cls[i] = rng() < 0.5 ? 0 : 1;
    }
    x[i] = px;
    y[i] = py;
    sz[i] = 0.8 + rng() * 1.1;
  }
  return { x, y, cls, sz };
});

const COLORS = ["76,201,240", "255,138,61", "236,242,250"];

/** Draw the first `count` dots of the galaxy centred at (cx, cy) with outer radius R (px). */
export function drawGalaxy(ctx: Ctx, cx: number, cy: number, R: number, count: number, alpha: number, o: { size?: number } = {}) {
  if (alpha <= 0.004 || R < 0.8) return;
  const g = galaxy();
  const n = Math.min(G_N, Math.max(0, Math.round(count)));
  // small galaxies draw a subset (the rest would land on the same pixels)
  const stride = R < 8 ? 40 : R < 24 ? 12 : R < 60 ? 3 : 1;
  const k = o.size ?? Math.max(0.9, Math.min(1.5, R / 110));
  const a0 = ctx.globalAlpha;
  for (let c = 0; c < 3; c++) {
    ctx.beginPath();
    for (let i = c === 0 ? 0 : 0; i < n; i += stride) {
      if (g.cls[i] !== c) continue;
      const s = g.sz[i] * k;
      ctx.rect(cx + g.x[i] * R - s / 2, cy + g.y[i] * R - s / 2, s, s);
    }
    ctx.fillStyle = `rgba(${COLORS[c]},${(c === 2 ? 0.85 : 0.72) * alpha * a0})`;
    ctx.fill();
  }
  // the bright core
  glow(ctx, cx, cy, Math.max(6, R * 0.5), RGB_POS, Math.min(1, 0.2 + (R < 40 ? 0.7 : 0.05)) * alpha);
  ctx.globalAlpha = a0;
}
