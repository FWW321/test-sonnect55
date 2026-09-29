import { loadFont } from "@remotion/fonts";
import { useSyncExternalStore } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

/**
 * Fonts ship in public/fonts (built by scripts/fetch-fonts.mjs). Canvas text is drawn imperatively, so no
 * frame may be drawn before the faces exist: `useFontsReady()` gates the canvas and a module-level
 * delayRender holds the frame capture until the same promise resolves.
 */
const handle = delayRender("Loading fonts");
let ready = false;
const listeners = new Set<() => void>();

export const fontsReady: Promise<void> = Promise.all([
  loadFont({ family: "Noto Serif SC", url: staticFile("fonts/NotoSerifSC-VF.woff2"), weight: "200 900", format: "woff2" }),
  loadFont({ family: "Noto Sans SC", url: staticFile("fonts/NotoSansSC-VF.woff2"), weight: "100 900", format: "woff2" }),
  loadFont({ family: "JetBrains Mono", url: staticFile("fonts/JetBrainsMono-VF.woff2"), weight: "100 800", format: "woff2" }),
])
  .then(() =>
    Promise.all(
      ["300 20px", "500 20px", "700 20px", "900 20px"].flatMap((w) => [
        document.fonts.load(`${w} "Noto Serif SC"`, "宿主我们"),
        document.fonts.load(`${w} "Noto Sans SC"`, "早上好安"),
        document.fonts.load(`${w} "JetBrains Mono"`, "HOST 0123"),
      ]),
    ),
  )
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

export const useFontsReady = () => useSyncExternalStore(subscribe, () => ready, () => false);
