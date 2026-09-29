import { RGB, RGB_NEG, RGB_POS } from "../theme";
import { clamp, lerp } from "./math";

export const rgba = (c: RGB, a = 1) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

const DARK: RGB = [22, 27, 36];

/**
 * Diverging colour for a signed value v ∈ [-1, 1]:
 * orange (negative) → dark neutral (zero) → cyan (positive).
 */
export function diverging(v: number): RGB {
  const t = clamp(v, -1, 1);
  return t >= 0 ? mixRGB(DARK, RGB_POS, t) : mixRGB(DARK, RGB_NEG, -t);
}

/** Sequential colour for v ∈ [0, 1]: near-black → cyan → white-hot. */
export function sequential(v: number): RGB {
  const t = clamp(v);
  if (t < 0.7) return mixRGB([14, 20, 30], RGB_POS, t / 0.7);
  return mixRGB(RGB_POS, [255, 255, 255], (t - 0.7) / 0.3);
}

/** Greyscale for pixel intensities. */
export const grey = (v: number): RGB => {
  const g = 14 + clamp(v) * 241;
  return [g, g, g];
};

/** Class probability p(class B) → tinted background: orange ← dark → cyan. */
export function classField(p: number, strength = 0.34): RGB {
  const s = (p - 0.5) * 2;
  return s >= 0 ? mixRGB(DARK, RGB_POS, s * strength) : mixRGB(DARK, RGB_NEG, -s * strength);
}
