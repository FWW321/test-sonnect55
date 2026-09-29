/**
 * The eye. It is the film's one recurring character: the sun's reflection in the morning, the thing in
 * the build, the power symbol, the phone in your right hand, the sun itself in the end.
 *
 * Its pupil is a camera aperture (six blades that turn as they close) and its iris is part lens, part
 * fibre — an eye that is also a camera. With `slit` it becomes a predator's; with `smile` the lower lid
 * rises, the way Migi's eye smiles.
 */
import { Ctx } from "../lib/draw";
import { TAU, clamp, hash01 } from "../lib/math";

export type EyeStyle = "machine" | "sun" | "gold" | "ink";

export interface EyeOpts {
  x: number;
  y: number;
  /** corner-to-corner width */
  w: number;
  /** 0 closed … 1 open */
  open: number;
  lookX?: number;
  lookY?: number;
  /** pupil radius as a fraction of the iris radius */
  pupil?: number;
  /** 0 round aperture … 1 vertical slit */
  slit?: number;
  /** 0 … 1: the lower lid rises (a smiling eye) */
  smile?: number;
  style?: EyeStyle;
  alpha?: number;
  /** seconds, for the slow turn of the iris rings */
  t?: number;
  glow?: number;
  irisScale?: number;
  /** 0…1 how much of the iris is visible through the sclera colour (the sun hides it) */
  reveal?: number;
  lineWidth?: number;
}

const PAL: Record<EyeStyle, { sclera: string; line: string; iris: [string, string, string]; fibre: string; pupil: string }> = {
  machine: { sclera: "#0c0b0e", line: "rgba(241,239,233,0.85)", iris: ["#ff6a3d", "#e8132f", "#3d0008"], fibre: "rgba(255,190,170,", pupil: "#030304" },
  sun: { sclera: "#fff8ea", line: "rgba(255,214,170,0.9)", iris: ["#ffd2a8", "#ff9c7a", "#e0605a"], fibre: "rgba(255,255,255,", pupil: "#4a1a22" },
  gold: { sclera: "#0d1120", line: "rgba(217,180,90,1)", iris: ["#f5dc9a", "#d9b45a", "#6b4d14"], fibre: "rgba(255,240,200,", pupil: "#07090f" },
  ink: { sclera: "#f4f2ec", line: "rgba(10,10,12,1)", iris: ["#ff5a3c", "#d0102a", "#40000a"], fibre: "rgba(255,210,200,", pupil: "#050505" },
};

/** The almond opening. */
function lidPath(ctx: Ctx, x: number, y: number, w: number, h: number, smile: number) {
  const L = x - w / 2;
  const R = x + w / 2;
  ctx.beginPath();
  ctx.moveTo(L, y);
  ctx.bezierCurveTo(x - w * 0.26, y - h, x + w * 0.26, y - h, R, y);
  const lo = h * 0.62 - smile * h * 1.35;
  ctx.bezierCurveTo(x + w * 0.26, y + lo, x - w * 0.26, y + lo, L, y);
  ctx.closePath();
}

export function drawEye(ctx: Ctx, o: EyeOpts) {
  const style = o.style ?? "machine";
  const P = PAL[style];
  const alpha = o.alpha ?? 1;
  if (alpha <= 0.003) return;
  const open = clamp(o.open);
  const smile = clamp(o.smile ?? 0);
  const h = o.w * 0.44 * open;
  const ri = o.w * 0.2 * (o.irisScale ?? 1);
  const cx = o.x + (o.lookX ?? 0) * o.w * 0.17;
  const cy = o.y + (o.lookY ?? 0) * o.w * 0.06 - smile * h * 0.25;
  const t = o.t ?? 0;
  const pupil = clamp(o.pupil ?? 0.35, 0.03, 0.8);
  const slit = clamp(o.slit ?? 0);
  const reveal = o.reveal ?? 1;
  const lw = o.lineWidth ?? Math.max(1.2, o.w * 0.012);

  ctx.save();
  ctx.globalAlpha *= alpha;

  // glow under the eye
  if ((o.glow ?? 0) > 0) {
    const g = ctx.createRadialGradient(cx, cy, ri * 0.2, cx, cy, o.w * 0.9);
    const col = style === "gold" ? "217,180,90" : style === "sun" ? "255,210,160" : "232,19,47";
    g.addColorStop(0, `rgba(${col},${0.55 * (o.glow ?? 0)})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(o.x - o.w, o.y - o.w, o.w * 2, o.w * 2);
  }

  if (open > 0.012) {
    ctx.save();
    lidPath(ctx, o.x, o.y, o.w, h, smile);
    ctx.clip();
    ctx.fillStyle = P.sclera;
    ctx.fillRect(o.x - o.w / 2 - 2, o.y - h - 2, o.w + 4, h * 2 + 4);

    ctx.save();
    ctx.globalAlpha *= reveal;
    // iris
    const g = ctx.createRadialGradient(cx, cy, ri * 0.1, cx, cy, ri);
    g.addColorStop(0, P.iris[0]);
    g.addColorStop(0.55, P.iris[1]);
    g.addColorStop(1, P.iris[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, ri, 0, TAU);
    ctx.fill();
    // fibres: radial strokes from the pupil to the rim
    const nF = 90;
    ctx.lineWidth = Math.max(0.6, ri * 0.012);
    for (let i = 0; i < nF; i++) {
      const a = (i / nF) * TAU + hash01(i, 5) * 0.05;
      const r0 = ri * (pupil + 0.04 + hash01(i, 6) * 0.08);
      const r1 = ri * (0.7 + hash01(i, 7) * 0.28);
      ctx.strokeStyle = P.fibre + (0.08 + hash01(i, 8) * 0.22) + ")";
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    // lens rings, one of them a turning dashed scale
    ctx.lineWidth = Math.max(0.5, ri * 0.01);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(cx, cy, ri * 0.985, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = P.fibre + "0.28)";
    ctx.beginPath();
    ctx.arc(cx, cy, ri * 0.82, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.35);
    ctx.setLineDash([ri * 0.04, ri * 0.06]);
    ctx.strokeStyle = P.fibre + "0.35)";
    ctx.beginPath();
    ctx.arc(0, 0, ri * 0.9, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // pupil: a six-bladed aperture that turns as it closes, or a slit
    const rp = ri * pupil;
    ctx.fillStyle = P.pupil;
    ctx.beginPath();
    if (slit > 0.02) {
      const hw = rp * (1 - 0.82 * slit);
      const hh = Math.min(ri * 0.94, rp * (1 + 2.2 * slit));
      ctx.moveTo(cx, cy - hh);
      ctx.quadraticCurveTo(cx + hw * 2, cy, cx, cy + hh);
      ctx.quadraticCurveTo(cx - hw * 2, cy, cx, cy - hh);
    } else {
      const rot = (1 - pupil) * 1.4 + 0.3;
      for (let k = 0; k < 6; k++) {
        const a = rot + (k / 6) * TAU;
        const px = cx + Math.cos(a) * rp;
        const py = cy + Math.sin(a) * rp;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    ctx.fill();
    if (slit <= 0.02) {
      // blade edges running out from each corner of the aperture
      const rot = (1 - pupil) * 1.4 + 0.3;
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = Math.max(0.6, ri * 0.012);
      for (let k = 0; k < 6; k++) {
        const a = rot + (k / 6) * TAU;
        const px = cx + Math.cos(a) * rp;
        const py = cy + Math.sin(a) * rp;
        const ta = a + Math.PI / 2 + 0.35;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(ta) * ri * 0.55, py + Math.sin(ta) * ri * 0.55);
        ctx.stroke();
      }
    }
    // highlights
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(cx - ri * 0.38, cy - ri * 0.4, ri * 0.13, ri * 0.09, -0.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.arc(cx + ri * 0.3, cy + ri * 0.28, ri * 0.045, 0, TAU);
    ctx.fill();
    ctx.restore();

    // the upper lid's shadow on the eyeball
    const sh = ctx.createLinearGradient(0, o.y - h * 0.8, 0, o.y + h * 0.1);
    sh.addColorStop(0, style === "sun" ? "rgba(200,120,90,0.35)" : "rgba(0,0,0,0.55)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh;
    ctx.fillRect(o.x - o.w / 2, o.y - h, o.w, h * 1.1);
    ctx.restore();
  }

  // lids
  ctx.strokeStyle = P.line;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const L = o.x - o.w / 2;
  const R = o.x + o.w / 2;
  ctx.lineWidth = lw * 1.6;
  ctx.beginPath();
  ctx.moveTo(L, o.y);
  ctx.bezierCurveTo(o.x - o.w * 0.26, o.y - h, o.x + o.w * 0.26, o.y - h, R, o.y);
  ctx.stroke();
  ctx.lineWidth = lw;
  const lo = h * 0.62 - smile * h * 1.35;
  ctx.beginPath();
  ctx.moveTo(L, o.y);
  ctx.bezierCurveTo(o.x - o.w * 0.26, o.y + lo, o.x + o.w * 0.26, o.y + lo, R, o.y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Openness over a blink: fully open, closes over `dur`/2, reopens over `dur`/2 (with the close faster
 * than the open, as real blinks are).
 */
export function blink(t: number, at: number, dur = 0.28) {
  const u = (t - at) / dur;
  if (u <= 0 || u >= 1) return 1;
  return u < 0.4 ? 1 - u / 0.4 : (u - 0.4) / 0.6;
}
