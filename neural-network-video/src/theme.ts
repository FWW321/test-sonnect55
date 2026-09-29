/** Composition constants and the visual language of the film. */
export const FPS = 30;
export const W = 1280;
export const H = 720;

/**
 * Palette. remocn's craft rules ask for one neutral base and restrained colour, so the film
 * uses a near-black stage, off-white type, and exactly two *semantic* hues:
 *   cyan   → signal: activation, forward flow, positive weight, class B
 *   orange → error: loss, gradient, backward flow, negative weight, class A
 * Colour is never decoration — it always encodes a sign or a direction.
 */
export const C = {
  bg: "#07090d",
  panel: "#0e1218",
  line: "#1c2330",
  grid: "rgba(255,255,255,0.055)",
  text: "#f2f5fa",
  dim: "#9aa4b5",
  faint: "#5a6476",
  pos: "#4cc9f0",
  neg: "#ff8a3d",
  white: "#ffffff",
} as const;

export type RGB = [number, number, number];
export const RGB_POS: RGB = [76, 201, 240];
export const RGB_NEG: RGB = [255, 138, 61];
export const RGB_WHITE: RGB = [255, 255, 255];
export const RGB_DIM: RGB = [154, 164, 181];
export const RGB_BG: RGB = [7, 9, 13];

/** Vertical band reserved for narration captions; scenes draw above it. */
export const CAPTION_Y = 636;
