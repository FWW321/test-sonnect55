/** Small, dependency-free numeric helpers. Pure and deterministic: safe in Node (the score) and in the browser (the picture). */
export const TAU = Math.PI * 2;

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Easing curves on [0,1]. */
export const ease = {
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  in: (t: number) => t * t * t,
  inQuad: (t: number) => t * t,
  inExpo: (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outBack: (t: number) => {
    const c1 = 1.4;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

/** Progress of `x` through [a, b], clamped and eased. The workhorse of every timeline. */
export const seg = (x: number, a: number, b: number, e: (t: number) => number = ease.inOut) => e(clamp((x - a) / (b - a)));

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

/** mulberry32: tiny seeded PRNG. Never use Math.random() in a render or in the score. */
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

/** Stateless hash → [0,1). Per-index deterministic jitter without carrying an RNG. */
export function hash01(i: number, seed = 0): number {
  let x = (Math.imul(i | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}
/** Signed variant, (−1, 1). */
export const hashS = (i: number, seed = 0) => hash01(i, seed) * 2 - 1;

/** Smooth 1-D value noise in (−1, 1): cheap, stateless, continuous in x. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hashS(i, seed), hashS(i + 1, seed), u);
}

/** 2-D value noise in (−1, 1). */
export function noise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => hashS(a * 374761 + b * 668265, seed);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), ux), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), ux), uy);
}
