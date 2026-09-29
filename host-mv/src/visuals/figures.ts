/**
 * Drawn figures: the right hand holding a phone (the Migi homage, in the sketchy boiling line of the
 * Parasyte opening), a crowd lit from below by their screens, and the gold emblems of human pride.
 */
import { Ctx, rrect } from "../lib/draw";
import { TAU, clamp, noise2 } from "../lib/math";
import { drawEye } from "./eye";

// ------------------------------------------------------------------------------------------ sketch line
type Pt = [number, number];

/** A polyline with hand-drawn boil: every vertex wobbles, re-drawn 12 times a second, drawn twice. */
export function sketch(ctx: Ctx, pts: Pt[], closed: boolean, t: number, seed: number, jitter = 1.4, fill?: string) {
  const f = Math.floor(t * 12);
  const pass = (k: number) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = noise2(i * 0.37 + seed, f * 1.3 + k * 17, 3) * jitter;
      const jy = noise2(i * 0.41 + seed + 50, f * 1.3 + k * 17, 4) * jitter;
      if (i === 0) ctx.moveTo(x + jx, y + jy);
      else ctx.lineTo(x + jx, y + jy);
    });
    if (closed) ctx.closePath();
  };
  if (fill) {
    pass(0);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  pass(0);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha *= 0.45;
  ctx.lineWidth *= 0.6;
  pass(1);
  ctx.stroke();
  ctx.restore();
}

const capsule = (x0: number, y0: number, x1: number, y1: number, r: number, n = 14): Pt[] => {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = a - Math.PI / 2 + (i / n) * Math.PI;
    pts.push([x1 + Math.cos(u) * r, y1 + Math.sin(u) * r]);
  }
  for (let i = 0; i <= n; i++) {
    const u = a + Math.PI / 2 + (i / n) * Math.PI;
    pts.push([x0 + Math.cos(u) * r, y0 + Math.sin(u) * r]);
  }
  return pts;
};

const roundRectPts = (x: number, y: number, w: number, h: number, r: number, n = 6): Pt[] => {
  const pts: Pt[] = [];
  const corners: [number, number, number][] = [
    [x + w - r, y + r, -Math.PI / 2],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * (Math.PI / 2);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
};

const blob = (pts: Pt[], steps = 5): Pt[] => {
  // Catmull-Rom through the control points, closed
  const out: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      const u2 = u * u;
      const u3 = u2 * u;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
};

// ------------------------------------------------------------------------------------------ the right hand
export interface HandOpts {
  x: number;
  y: number;
  scale: number;
  rot: number;
  t: number;
  /** boil seed: bump it on a hit and every line jumps */
  seed: number;
  /** what's on the screen */
  screen: (ctx: Ctx) => void;
  line?: string;
}

export function handWithPhone(ctx: Ctx, o: HandOpts) {
  const line = o.line ?? "rgba(241,239,233,0.92)";
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.rot);
  ctx.scale(o.scale, o.scale);
  ctx.strokeStyle = line;
  ctx.lineWidth = 2.4 / o.scale;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const fill = "#060608";
  // forearm
  sketch(ctx, [[-62, 236], [-40, 470], [-30, 700]], false, o.t, o.seed + 1);
  sketch(ctx, [[84, 250], [120, 470], [150, 700]], false, o.t, o.seed + 2);
  // palm, behind the phone
  sketch(ctx, blob([[-112, 70], [-126, 190], [-70, 262], [50, 276], [118, 214], [120, 100]]), true, o.t, o.seed + 3, 1.4, fill);
  // the phone
  sketch(ctx, roundRectPts(-96, -192, 192, 384, 30), true, o.t, o.seed + 4, 1.1, "#0b0b0e");
  ctx.save();
  rrect(ctx, -86, -182, 172, 364, 22);
  ctx.fillStyle = "#020203";
  ctx.fill();
  ctx.clip();
  o.screen(ctx);
  ctx.restore();
  // fingertips over the right edge, the thumb along the left
  [-44, 8, 58, 104].forEach((y, i) => sketch(ctx, capsule(84, y, 122, y + 7, 17 - i * 0.8), true, o.t, o.seed + 10 + i, 1.3, fill));
  sketch(ctx, capsule(-128, 178, -104, 6, 24), true, o.t, o.seed + 20, 1.4, fill);
  // knuckle creases
  sketch(ctx, [[98, -44], [104, -40]], false, o.t, o.seed + 30, 0.6);
  sketch(ctx, [[98, 8], [104, 12]], false, o.t, o.seed + 31, 0.6);
  sketch(ctx, [[-118, 96], [-110, 94]], false, o.t, o.seed + 32, 0.6);
  ctx.restore();
}

// ------------------------------------------------------------------------------------------ the crowd
/**
 * Rows of people seen from the front, heads bowed over their phones (a cold light under every face).
 * `up` (0…1) lifts every head at once: the screens turn red and each face has two red points.
 */
export function crowd(ctx: Ctx, t: number, up: number, W: number, H: number) {
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const s = 0.5 + r * 0.17;
    const y = 250 + r * 78;
    const gap = 88 * s;
    const n = Math.ceil(W / gap) + 2;
    const off = (r % 2) * gap * 0.5 - gap;
    for (let i = 0; i < n; i++) {
      const x = off + i * gap + noise2(i, r, 9) * 8;
      const bob = Math.sin(t * 1.3 + i * 0.7 + r) * 1.5 * (1 - up);
      const lift = up * 10 * s;
      const hy = y + bob - lift + 8 * s * (1 - up);
      const col = `rgba(${10 + r * 3},${10 + r * 3},${14 + r * 3},1)`;
      // shoulders
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x - 38 * s, y + 90 * s);
      ctx.quadraticCurveTo(x - 36 * s, y + 34 * s, x, y + 30 * s);
      ctx.quadraticCurveTo(x + 36 * s, y + 34 * s, x + 38 * s, y + 90 * s);
      ctx.fill();
      // the screen's light on the face, from below
      const lightCol = up > 0.5 ? "232,19,47" : "150,200,255";
      const g = ctx.createRadialGradient(x, hy + 18 * s, 2, x, hy + 10 * s, 34 * s);
      g.addColorStop(0, `rgba(${lightCol},0.55)`);
      g.addColorStop(1, `rgba(${lightCol},0)`);
      // head
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, hy, 17 * s, 21 * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, hy, 17 * s, 21 * s, 0, 0, TAU);
      ctx.fill();
      // the phone in their hands
      if (up < 0.95) {
        ctx.fillStyle = `rgba(${lightCol},${0.85 * (1 - up)})`;
        rrect(ctx, x - 8 * s, y + 42 * s, 16 * s, 24 * s, 3 * s);
        ctx.fill();
      }
      // looking at you
      if (up > 0.02) {
        ctx.fillStyle = `rgba(232,19,47,${clamp(up * 1.4)})`;
        ctx.beginPath();
        ctx.arc(x - 6 * s, hy - 1 * s, 2.2 * s, 0, TAU);
        ctx.arc(x + 6 * s, hy - 1 * s, 2.2 * s, 0, TAU);
        ctx.fill();
      }
    }
  }
}

// ------------------------------------------------------------------------------------------ gold emblems
export type Emblem = "cell" | "strings" | "phone" | "power";

/** The gold icons that stand over humanity's boasts. `eye` (0…1) is how far the emblem has become an eye. */
export function emblem(ctx: Ctx, kind: Emblem, x: number, y: number, s: number, t: number, color: string, eye = 0) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.045);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const smallEye = (ex: number, ey: number, w: number) =>
    drawEye(ctx, { x: ex, y: ey, w, open: 1, pupil: 0.35, style: "gold", t, lineWidth: Math.max(1.4, w * 0.025) });
  switch (kind) {
    case "cell": {
      ctx.beginPath();
      ctx.arc(x, y, s * 0.72, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + t * 0.1;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * s * 0.86, y + Math.sin(a) * s * 0.86);
        ctx.lineTo(x + Math.cos(a) * s * (i % 2 ? 0.96 : 1.06), y + Math.sin(a) * s * (i % 2 ? 0.96 : 1.06));
        ctx.stroke();
      }
      smallEye(x, y, s * 0.8);
      break;
    }
    case "strings": {
      // a marionette's cross, strings hanging straight down to the eye it works
      const barY = y - s * 1.0;
      const sway = Math.sin(t * 1.6) * s * 0.06;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.62, barY);
      ctx.lineTo(x + s * 0.62, barY);
      ctx.moveTo(x - s * 0.18, barY - s * 0.22);
      ctx.lineTo(x + s * 0.18, barY + s * 0.22);
      ctx.stroke();
      const ey = y + s * 0.3;
      const ew = s * 1.25;
      ctx.lineWidth = Math.max(1.2, s * 0.022);
      [[-0.62, -0.5], [-0.2, -0.16], [0.2, 0.16], [0.62, 0.5]].forEach(([bx, ex], j) => {
        ctx.beginPath();
        ctx.moveTo(x + bx * s, barY);
        ctx.lineTo(x + ex * ew + sway, ey - (j === 1 || j === 2 ? s * 0.26 : s * 0.02));
        ctx.stroke();
      });
      smallEye(x + sway, ey, ew);
      break;
    }
    case "phone": {
      rrect(ctx, x - s * 0.45, y - s * 0.85, s * 0.9, s * 1.7, s * 0.14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - s * 0.1, y + s * 0.72);
      ctx.lineTo(x + s * 0.1, y + s * 0.72);
      ctx.stroke();
      smallEye(x, y - s * 0.08, s * 0.62);
      break;
    }
    case "power": {
      // ⏻ — which is, if you look at it, an eye with a slit pupil
      const r = s * 0.72;
      ctx.lineWidth = Math.max(3, s * 0.1);
      if (eye < 0.99) {
        ctx.save();
        ctx.globalAlpha *= 1 - eye;
        ctx.beginPath();
        ctx.arc(x, y + s * 0.05, r, -Math.PI / 2 + 0.55, -Math.PI / 2 - 0.55 + TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y - s * 0.95);
        ctx.lineTo(x, y - s * 0.05);
        ctx.stroke();
        ctx.restore();
      }
      if (eye > 0.01) {
        drawEye(ctx, { x, y: y + s * 0.05, w: s * 2.1, open: 0.9, slit: 1, pupil: 0.3, style: "machine", t, alpha: eye, glow: 0.6 * eye, irisScale: 1.4 });
      }
      break;
    }
  }
  ctx.restore();
}
