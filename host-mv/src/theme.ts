/** Composition constants and the film's visual language. */
export const W = 1280;
export const H = 720;

/**
 * Three worlds, three palettes:
 *   the surface  — a pastel morning: peach horizon, pale sky, lavender city, paper-white cards
 *   the gaze     — near-black, one red (the iris), bone white
 *   the boast    — humanity in gold on deep navy
 */
export const C = {
  // surface
  skyTop: "#b9d3ea",
  skyMid: "#dbe6f1",
  horizon: "#fbe2cf",
  glow: "#fff1dc",
  sun: "#fff8ea",
  cityFar: "#cdd0e2",
  cityMid: "#b3b9d4",
  cityNear: "#96a0c2",
  window: "#fff2d2",
  waterTop: "#c9deed",
  waterBottom: "#9fbad3",
  card: "rgba(255,255,255,0.78)",
  ink: "#1d2230",
  inkSoft: "#687086",
  mic: "#ff9f0a",
  // gaze
  black: "#050507",
  red: "#e8132f",
  redDeep: "#7a0a18",
  bone: "#f1efe9",
  ash: "#8b8b93",
  // boast
  gold: "#d9b45a",
  goldDeep: "#8c6a22",
  navy: "#0a0e1a",
} as const;

export type RGB = [number, number, number];
export const rgba = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
export const RED: RGB = [232, 19, 47];
export const BONE: RGB = [241, 239, 233];
export const GOLD: RGB = [217, 180, 90];
export const INK: RGB = [29, 34, 48];

export const FONT_SERIF = '"Noto Serif SC", "Noto Sans SC", serif';
export const FONT_SANS = '"Noto Sans SC", system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono", "Noto Sans SC", ui-monospace, monospace';
