import { useLayoutEffect, useRef } from "react";
import { useFontsReady } from "../fonts";
import { H, W } from "../theme";
import { useGF } from "./time";

export interface DrawArgs {
  ctx: CanvasRenderingContext2D;
  /** Master-timeline frame; fractional inside motion-blur sub-samples. */
  gf: number;
  w: number;
  h: number;
  dpr: number;
}

export interface MotionBlur {
  /** Sub-frame samples averaged into one output frame (1 = off). */
  samples: number;
  /** Shutter length in frames (0.5 ≈ a 180° shutter at 1 frame). */
  shutter: number;
}

export interface CanvasProps {
  draw: (a: DrawArgs) => void;
  blur?: MotionBlur;
  /** Extra alpha for the whole layer (envelope of a chapter). */
  opacity?: number;
}

let scratch: HTMLCanvasElement | null = null;
const getScratch = (pw: number, ph: number) => {
  if (!scratch) scratch = document.createElement("canvas");
  if (scratch.width !== pw) scratch.width = pw;
  if (scratch.height !== ph) scratch.height = ph;
  return scratch;
};

/**
 * A 1280×720 canvas that redraws every frame as a pure function of the master frame.
 * The backing store follows devicePixelRatio, so `remotion render --scale=1.5` gives a crisp 1080p.
 * With `blur`, the scene is drawn at several fractional times and averaged — real temporal
 * motion blur, the way onetake averages samples across a shutter.
 */
export const Canvas: React.FC<CanvasProps> = ({ draw, blur, opacity = 1 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const gf = useGF();
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

    const samples = blur ? Math.max(1, Math.round(blur.samples)) : 1;
    if (samples <= 1) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      draw({ ctx, gf, w: W, h: H, dpr });
      return;
    }
    const off = getScratch(pw, ph);
    const octx = off.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    for (let i = 0; i < samples; i++) {
      const g = gf + ((i + 0.5) / samples - 0.5) * (blur?.shutter ?? 0);
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, W, H);
      draw({ ctx: octx, gf: g, w: W, h: H, dpr });
      ctx.globalAlpha = 1 / (i + 1); // running average of premultiplied RGBA
      ctx.drawImage(off, 0, 0);
    }
    ctx.globalAlpha = 1;
  });

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity }}
    />
  );
};
