/**
 * Lazily-built, memoised data shared by chapters: the trained digit network, the hero digit, and
 * helpers that turn a forward pass into per-layer activations. Everything is deterministic.
 */
import raw from "../data/digit-net.json";
import { Act, Net } from "../nn/mlp";
import { renderDigit } from "../nn/digits";

const memo = <T,>(f: () => T) => {
  let v: T | undefined;
  return () => (v ??= f());
};

export const digitNet = memo(() => new Net(raw.sizes, raw.acts as Act[], raw.params));

/** The clean '7' the film opens on. */
export const heroImage = memo(() => renderDigit(raw.hero.digit, raw.hero.seed, { wobble: raw.hero.wobble }));

/** One confidently-recognised example of each digit, wobble as in the training data. */
export const showcaseImage = (d: number) => {
  const s = raw.showcase.find((x) => x.digit === d) ?? raw.showcase[0];
  return renderDigit(s.digit, s.seed);
};

export const PARAM_COUNT = raw.params.length; // 13 002
export const TEST_ACC = raw.testAcc;

export interface Forward {
  /** a[0] = input (784), a[1] = hidden 1 (16), a[2] = hidden 2 (16), a[3] = softmax output (10). */
  a: Float64Array[];
  /** Pre-activations of layers 0..2. */
  z: Float64Array[];
  probs: Float64Array;
  pred: number;
}

const fwdCache = new Map<string, Forward>();

/** Forward pass with copies of every layer's activations (safe to keep between frames). */
export function forwardDigit(img: Float32Array | Float64Array, key: string): Forward {
  const hit = fwdCache.get(key);
  if (hit) return hit;
  const net = digitNet();
  const cache = net.makeCache();
  const out = net.forward(img, cache);
  const f: Forward = {
    a: cache.a.map((x) => Float64Array.from(x)),
    z: cache.z.map((x) => Float64Array.from(x)),
    probs: Float64Array.from(out),
    pred: out.reduce((best, v, i, arr) => (v > arr[best] ? i : best), 0),
  };
  fwdCache.set(key, f);
  return f;
}
