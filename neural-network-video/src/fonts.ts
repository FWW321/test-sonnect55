import "katex/dist/katex.min.css";
import { loadFont } from "@remotion/fonts";
import { useSyncExternalStore } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

/**
 * Fonts ship inside public/fonts (built by scripts/fetch-fonts.mjs) and KaTeX's math faces come
 * with the katex package, so rendering never depends on a font CDN.
 *
 * Canvas text is drawn imperatively, so a frame must not be drawn before the faces exist:
 * `useFontsReady()` gates every <Canvas>, and a module-level delayRender holds the frame
 * capture until the same promise resolves.
 */
export const FONT_SANS = '"Inter", "Noto Sans SC", system-ui, sans-serif';
export const FONT_CJK = '"Noto Sans SC", "Inter", system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono", "Noto Sans SC", ui-monospace, monospace';

const KATEX_FACES = [
  "16px KaTeX_Main",
  "bold 16px KaTeX_Main",
  "italic 16px KaTeX_Math",
  "16px KaTeX_Size1",
  "16px KaTeX_Size2",
  "16px KaTeX_AMS",
];

const handle = delayRender("Loading fonts");
let ready = false;
const listeners = new Set<() => void>();

export const fontsReady: Promise<void> = Promise.all([
  loadFont({
    family: "Inter",
    url: staticFile("fonts/Inter-VF.woff2"),
    weight: "100 900",
    format: "woff2",
  }),
  loadFont({
    family: "JetBrains Mono",
    url: staticFile("fonts/JetBrainsMono-VF.woff2"),
    weight: "100 800",
    format: "woff2",
  }),
  loadFont({
    family: "Noto Sans SC",
    url: staticFile("fonts/NotoSansSC-VF.woff2"),
    weight: "100 900",
    format: "woff2",
  }),
])
  .then(() => Promise.all(KATEX_FACES.map((f) => document.fonts.load(f, "0123456789abcxyz∂∑=+"))))
  .then(() => document.fonts.ready)
  .then(() => {
    ready = true;
    continueRender(handle);
    listeners.forEach((l) => l());
  });

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useFontsReady = () =>
  useSyncExternalStore(
    subscribe,
    () => ready,
    () => false,
  );
