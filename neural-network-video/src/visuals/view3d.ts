/** A minimal orthographic 3-D view: yaw about the vertical axis, pitch 0 = straight down. */
import { line, polyline } from "../lib/draw";

type Ctx = CanvasRenderingContext2D;
export type V3 = [number, number, number];

export interface Cam3 {
  yaw: number;
  /** 0 → looking straight down onto the xy-plane (z toward the viewer); π/2 → side view. */
  pitch: number;
  scale: number;
  cx: number;
  cy: number;
}

export function project(c: Cam3, [x, y, z]: V3): { x: number; y: number; depth: number } {
  const cy = Math.cos(c.yaw);
  const sy = Math.sin(c.yaw);
  const X = x * cy - y * sy;
  const Y = x * sy + y * cy;
  const cp = Math.cos(c.pitch);
  const sp = Math.sin(c.pitch);
  return {
    x: c.cx + c.scale * X,
    y: c.cy - c.scale * (Y * cp + z * sp),
    depth: z * cp - Y * sp,
  };
}

/** Unit vector (world coordinates) pointing from the scene towards the viewer. */
export function viewVector(c: Cam3): V3 {
  return [-Math.sin(c.pitch) * Math.sin(c.yaw), -Math.sin(c.pitch) * Math.cos(c.yaw), Math.cos(c.pitch)];
}

export function drawBox(ctx: Ctx, c: Cam3, h: number, color: string, lw = 1, alpha = 1) {
  const P: V3[] = [];
  for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) P.push([x, y, z]);
  const E = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (const [a, b] of E) {
    const pa = project(c, P[a]);
    const pb = project(c, P[b]);
    line(ctx, pa.x, pa.y, pb.x, pb.y, { color, lw, alpha });
  }
}

export function drawPolygon(ctx: Ctx, c: Cam3, pts: V3[], fill: string, stroke: string, lw = 1.2, alpha = 1) {
  const flat: number[] = [];
  for (const p of pts) {
    const q = project(c, p);
    flat.push(q.x, q.y);
  }
  polyline(ctx, flat, { close: true, fill, color: stroke, lw, alpha });
}
