/** Small, dependency-free numeric helpers. Pure and deterministic — safe in Node and in the browser. */
export const TAU = Math.PI * 2;

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => (x - a) / (b - a);
export const remap = (x: number, a: number, b: number, c: number, d: number) =>
  lerp(c, d, clamp(invLerp(a, b, x)));

export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Easing curves on [0,1]. */
export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  in: (t: number) => t * t * t,
  inQuad: (t: number) => t * t,
  /** remocn's house curve: cubic-bezier(0.22, 1, 0.36, 1) — a soft, long-tailed ease-out. */
  soft: (t: number) => cubicBezier(0.22, 1, 0.36, 1, t),
  /** Gentle overshoot for a settle. */
  outBack: (t: number) => {
    const c1 = 1.2;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

/** Progress of `x` through [a, b], clamped and eased. The workhorse of every timeline. */
export const seg = (x: number, a: number, b: number, e: (t: number) => number = ease.inOut) =>
  e(clamp((x - a) / (b - a)));

/** cubic-bezier(x1,y1,x2,y2) evaluated at time t (Newton + bisection, like CSS). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (s: number) => ((ax * s + bx) * s + cx) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  let s = t;
  for (let i = 0; i < 6; i++) {
    const err = sx(s) - t;
    if (Math.abs(err) < 1e-6) break;
    const d = dx(s);
    if (Math.abs(d) < 1e-6) break;
    s -= err / d;
  }
  if (s < 0 || s > 1) {
    let lo = 0;
    let hi = 1;
    s = t;
    for (let i = 0; i < 24; i++) {
      const v = sx(s);
      if (Math.abs(v - t) < 1e-6) break;
      if (v < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
  }
  return ((ay * s + by) * s + cy) * s;
}

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
export const relu = (z: number) => (z > 0 ? z : 0);

/** mulberry32: tiny seeded PRNG. Never use Math.random() in a render. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal from any uniform generator (Box–Muller). */
export function gaussian(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

/** Stateless hash → [0,1). Handy for per-index deterministic jitter without carrying an RNG. */
export function hash01(i: number, seed = 0): number {
  let x = (Math.imul(i | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

export const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Seconds → frames at the film's frame rate. */
export const sec = (s: number, fps = 30) => Math.round(s * fps);

/** Format with fixed decimals, using a true minus sign for negatives. */
export const fmt = (x: number, d = 2) => {
  let s = x.toFixed(d);
  if (/^-0(\.0*)?$/.test(s)) s = s.slice(1); // never print "−0.00"
  return s.startsWith("-") ? "−" + s.slice(1) : s;
};

/** 12345 → "12,345" */
export const thousands = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Piecewise interpolation through [time, value] keys with an easing on every span. */
export function keyframes(t: number, keys: [number, number][], e: (t: number) => number = ease.inOutSine): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    if (t <= t1) return lerp(v0, v1, e(clamp((t - t0) / (t1 - t0))));
  }
  return keys[keys.length - 1][1];
}
