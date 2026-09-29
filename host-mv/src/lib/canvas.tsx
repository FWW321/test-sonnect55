import { useLayoutEffect, useRef } from "react";
import { useCurrentFrame } from "remotion";
import { useFontsReady } from "../fonts";
import { FPS } from "../song";
import { H, W } from "../theme";

export type Draw = (ctx: CanvasRenderingContext2D, t: number, dpr: number) => void;

/**
 * A 1280×720 canvas redrawn every frame as a pure function of time (frame / 30 s). The backing store follows
 * devicePixelRatio, so `remotion render --scale=1.5` gives a crisp 1920×1080.
 */
export const FilmCanvas: React.FC<{ draw: Draw; offset?: number }> = ({ draw, offset = 0 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame() + offset;
  const ready = useFontsReady();

  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv || !ready) return;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(W * dpr);
    const ph = Math.round(H * dpr);
    if (cv.width !== pw) cv.width = pw;
    if (cv.height !== ph) cv.height = ph;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, frame / FPS, dpr);
  });

  return <canvas ref={ref} width={W} height={H} style={{ position: "absolute", left: 0, top: 0, width: W, height: H }} />;
};
