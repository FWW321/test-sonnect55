/**
 * The score of 《宿主》: every event in src/song.ts, synthesised from nothing.
 *
 *   npm run score   →  out/host.wav  →  public/audio/host.m4a (AAC, via Remotion's bundled ffmpeg)
 *
 * No samples and no Math.random — every oscillator, noise source and reverb is written here, and the
 * same inputs give the same bytes. The instruments:
 *
 *   music box   additive tines (1 · 2 · 5.4 · 8.9 · 13.3), a pin click, a lot of room
 *   chime       the assistant's notification: two glassy tones a fourth apart
 *   lead / pad  supersaws (7 and 5 detuned band-limited saws), filter envelopes, a trance gate
 *   arp         a plucked pair of saws; the filter opens over the build
 *   bass        a sine sub under a filtered saw, lightly saturated
 *   guitar      drop-D power chords: saw strings with a pick bend → palm-mute filter → two-stage clipper →
 *               post-gate, double-tracked left/right, then a cabinet (scoop, presence, 24 dB/oct top cut)
 *   choir       saws with vibrato through vowel formants ("a" and "o")
 *   drums       synthesised kick, snare, clap, toms, and 808-style metallic cymbals
 *   fx          drone, clock, typewriter keys, birds, heartbeats, risers, reverse cymbals, impacts, glitches
 *
 * Then: sidechain ducking from the kick, a ping-pong delay, an 8-line feedback-delay-network reverb,
 * two tape stops and a stutter on the master, a lookahead limiter, and a loudness report per section.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clamp, mulberry32 } from "../src/lib/math";
import { TYPED_LINES } from "../src/script";
import { BEAT, DURATION, FX, Fx, NOTES, Note, SECTIONS, STEP, bt, sectionAt } from "../src/song";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SR = 48000;
const N = Math.ceil(DURATION * SR);
const TAU = Math.PI * 2;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const cents = (c: number) => Math.pow(2, c / 1200);
const t0wall = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0wall) / 1000).toFixed(1)}s] ${s}`);

// ============================================================================================ buses
interface Bus {
  name: string;
  L: Float32Array;
  R: Float32Array;
}
const bus = (name: string): Bus => ({ name, L: new Float32Array(N), R: new Float32Array(N) });
const BOX = bus("box");
const CHIME = bus("chime");
const LEAD = bus("lead");
const ARP = bus("arp");
const PAD = bus("pad");
const WARM = bus("warm");
const BASS = bus("bass");
const GTR = bus("gtr");
const CHOIR = bus("choir");
const KICK = bus("kick");
const DRUM = bus("drum"); // snare, clap, toms
const CYM = bus("cym"); // hats, cymbals, shaker
const FXB = bus("fx"); // one-shot effects
const AMB = bus("amb"); // beds: room, city, drone, rumble

const panGains = (p: number): [number, number] => {
  const a = ((clamp(p, -1, 1) + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
};

// Tape stops cut everything that was sounding (the "power cut"): notes are truncated at the cut and
// the reverb and delay are emptied there, so nothing from before the stop leaks into what follows.
const CUTS = FX.filter((f) => f.kind === "tapestop")
  .map((f) => f.t + f.dur)
  .sort((a, b) => a - b);
const cutAfter = (t: number) => {
  for (const c of CUTS) if (c > t) return c;
  return DURATION;
};
/** Sample range [i0, i1) for an event at t lasting len seconds, clipped at the next cut and at the end. */
function span(t: number, len: number): [number, number] {
  const i0 = Math.max(0, Math.round(t * SR));
  const i1 = Math.min(N, Math.round(Math.min(t + len, cutAfter(t)) * SR));
  return [i0, Math.max(i0, i1)];
}

// ============================================================================================ primitives
/** Band-limited sawtooth (PolyBLEP). p in [0,1), dt = f / SR. */
function blepSaw(p: number, dt: number) {
  let v = 2 * p - 1;
  if (p < dt) {
    const x = p / dt;
    v -= x + x - x * x - 1;
  } else if (p > 1 - dt) {
    const x = (p - 1) / dt;
    v -= x * x + x + x + 1;
  }
  return v;
}

/** Topology-preserving-transform state-variable filter (Zavalishin). Stable under fast modulation. */
class SVF {
  ic1 = 0;
  ic2 = 0;
  a1 = 0;
  a2 = 0;
  a3 = 0;
  k = 1;
  low = 0;
  band = 0;
  high = 0;
  constructor(fc = 1000, q = 0.707) {
    this.set(fc, q);
  }
  set(fc: number, q: number) {
    const g = Math.tan((Math.PI * clamp(fc, 10, SR * 0.46)) / SR);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  tick(x: number) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.low = v2;
    this.band = v1;
    this.high = x - this.k * v1 - v2;
    return v2;
  }
}

/** RBJ biquad, for fixed EQ on the buses. */
class Biquad {
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;
  x1 = 0;
  x2 = 0;
  y1 = 0;
  y2 = 0;
  static make(type: "lp" | "hp" | "peak" | "lowshelf" | "highshelf" | "bp", f: number, q = 0.707, db = 0) {
    const b = new Biquad();
    const w = (TAU * f) / SR;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const A = Math.pow(10, db / 40);
    const alpha = sw / (2 * q);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (type) {
      case "lp":
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case "hp":
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case "bp":
        b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case "peak":
        b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
        break;
      case "lowshelf": {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 - (A - 1) * cw + s); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s);
        a0 = A + 1 + (A - 1) * cw + s; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s;
        break;
      }
      case "highshelf": {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 + (A - 1) * cw + s); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s);
        a0 = A + 1 - (A - 1) * cw + s; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s;
        break;
      }
    }
    b.b0 = b0 / a0; b.b1 = b1 / a0; b.b2 = b2 / a0; b.a1 = a1 / a0; b.a2 = a2 / a0;
    return b;
  }
  tick(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}
type EqSpec = [Parameters<typeof Biquad.make>[0], number, number?, number?];
function eqBus(b: Bus, chain: EqSpec[]) {
  for (const ch of [b.L, b.R]) {
    const fs = chain.map(([type, f, q, db]) => Biquad.make(type, f, q ?? 0.707, db ?? 0));
    for (let i = 0; i < N; i++) {
      let x = ch[i];
      for (let k = 0; k < fs.length; k++) x = fs[k].tick(x);
      ch[i] = x;
    }
  }
}

/** Seeded white noise in (−1, 1). */
const noiseGen = (seed: number) => {
  const r = mulberry32(seed);
  return () => r() * 2 - 1;
};

// ============================================================================================ instruments
// ------------------------------------------------------------------------------ music box
function musicbox(n: Note, idx: number) {
  const r = mulberry32(1000 + idx);
  const f0 = mtof(n.midi) * cents((n.cents ?? 0) + (r() - 0.5) * 5);
  const tau = 1.5 * Math.pow(440 / f0, 0.4);
  const t = n.t + (r() - 0.5) * 0.008;
  const [i0, i1] = span(t, Math.min(tau * 5.5, 7));
  const P: [number, number, number][] = [
    [1, 1, tau],
    [2, 0.05, tau * 0.3],
    [5.4, 0.2, 0.08],
    [8.9, 0.09, 0.04],
    [13.3, 0.045, 0.022],
  ];
  const parts = P.filter(([ratio]) => f0 * ratio < 17000).map(([ratio, amp, tp]) => {
    const c = 2 * Math.sin((Math.PI * f0 * ratio) / SR);
    const th = r() * TAU;
    return { c, s: Math.sin(th), co: Math.cos(th), amp, env: 1, dec: Math.exp(-1 / (tp * SR)) };
  });
  const [gL, gR] = panGains(clamp((n.midi - 82) / 16, -0.55, 0.55) + (r() - 0.5) * 0.2);
  const nz = noiseGen(77 + idx);
  const att = 0.0012 * SR;
  const sec = sectionAt(n.t + 0.01).id;
  const g = n.vel * 0.3 * (sec === "breakdown" ? 2.4 : sec === "verse" ? 2 : 1);
  for (let i = i0, k = 0; i < i1; i++, k++) {
    let y = 0;
    for (let p = 0; p < parts.length; p++) {
      const q = parts[p];
      q.s += q.c * q.co;
      q.co -= q.c * q.s;
      y += q.s * q.amp * q.env;
      q.env *= q.dec;
    }
    if (k < att) y *= k / att;
    if (k < 120) y += nz() * 0.12 * (1 - k / 120);
    y *= g;
    BOX.L[i] += y * gL;
    BOX.R[i] += y * gR;
  }
}

// ------------------------------------------------------------------------------ notification chime
function chime(n: Note, idx: number) {
  [0, 5].forEach((semi, j) => {
    const f0 = mtof(n.midi + semi) * cents(j === 1 ? (n.cents ?? 0) : 0);
    const [i0, i1] = span(n.t + j * 0.085, 2.2);
    const r = mulberry32(2000 + idx * 2 + j);
    const parts = [
      [1, 1, 0.5],
      [2.76, 0.22, 0.1],
      [5.4, 0.06, 0.04],
    ].map(([ratio, amp, tp]) => {
      const c = 2 * Math.sin((Math.PI * f0 * ratio) / SR);
      const th = r() * TAU;
      return { c, s: Math.sin(th), co: Math.cos(th), amp, env: 1, dec: Math.exp(-1 / (tp * SR)) };
    });
    const [gL, gR] = panGains(j ? 0.12 : -0.12);
    const g = n.vel * (j ? 0.26 : 0.22);
    for (let i = i0, k = 0; i < i1; i++, k++) {
      let y = 0;
      for (const q of parts) {
        q.s += q.c * q.co;
        q.co -= q.c * q.s;
        y += q.s * q.amp * q.env;
        q.env *= q.dec;
      }
      y *= g * Math.min(1, k / 90);
      CHIME.L[i] += y * gL;
      CHIME.R[i] += y * gR;
    }
  });
}

// ------------------------------------------------------------------------------ supersaws
interface SawVoice {
  p: number;
  dt: number;
  gL: number;
  gR: number;
}
function sawVoices(f0: number, det: number[], pans: number[], r: () => number, amp = 1): SawVoice[] {
  return det.map((c, v) => {
    const [gL, gR] = panGains(pans[v]);
    const a = (v === (det.length - 1) / 2 ? 1 : 0.75) * amp;
    return { p: r(), dt: (f0 * cents(c + (r() - 0.5) * 2)) / SR, gL: gL * a, gR: gR * a };
  });
}

function lead(n: Note, idx: number) {
  const r = mulberry32(5000 + idx);
  const f0 = mtof(n.midi);
  const rel = 0.14;
  const [i0, i1] = span(n.t, n.dur + rel);
  const vs = sawVoices(f0, [-26, -16, -7, 0, 7, 16, 26], [-0.85, -0.55, -0.25, 0, 0.25, 0.55, 0.85], r);
  const oct = n.octave ?? 0;
  if (oct > 0) vs.push(...sawVoices(f0 * 2, [-17, -7, 0, 7, 17], [-0.7, -0.3, 0, 0.3, 0.7], r, 0.62 * oct));
  const fl = new SVF(4000, 0.8);
  const fr = new SVF(4000, 0.8);
  const key = Math.pow(f0 / 440, 0.3);
  const durS = n.dur * SR;
  const relS = rel * SR;
  const g = n.vel * 0.075;
  const vib = { s: 0, c: 1, w: 2 * Math.sin((Math.PI * 5.6) / SR) };
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const tl = k / SR;
    if ((k & 15) === 0) {
      const fc = (2400 + 6000 * Math.exp(-tl / 0.22)) * key;
      fl.set(fc, 0.8);
      fr.set(fc, 0.8);
    }
    // delayed vibrato on long notes
    vib.s += vib.w * vib.c;
    vib.c -= vib.w * vib.s;
    const vd = tl > 0.32 ? Math.min(1, (tl - 0.32) / 0.3) * 0.0075 * vib.s : 0;
    let l = 0;
    let rr = 0;
    for (let v = 0; v < vs.length; v++) {
      const o = vs[v];
      const dt = o.dt * (1 + vd);
      o.p += dt;
      if (o.p >= 1) o.p -= 1;
      const y = blepSaw(o.p, dt);
      l += y * o.gL;
      rr += y * o.gR;
    }
    let a = Math.min(1, k / (0.005 * SR));
    if (k > durS) a *= Math.exp(-(k - durS) / (relS * 0.3));
    if (n.gate) {
      const ph = ((i / SR) / STEP) % 1;
      a *= ph < 0.62 ? 1 : ph < 0.66 ? 1 - ((ph - 0.62) / 0.04) * 0.8 : ph > 0.97 ? 0.2 + ((ph - 0.97) / 0.03) * 0.8 : 0.2;
    }
    LEAD.L[i] += fl.tick(l) * a * g;
    LEAD.R[i] += fr.tick(rr) * a * g;
  }
}

/** Where the build's filter is (0 closed … 1 open). */
const buildOpen = (t: number) => clamp((t - bt(30)) / (bt(37.75) - bt(30)));

function pad(n: Note, idx: number) {
  const r = mulberry32(6000 + idx);
  const f0 = mtof(n.midi);
  const rel = 0.3;
  const [i0, i1] = span(n.t, n.dur + rel);
  const vs = sawVoices(f0, [-15, -7, 0, 7, 15], [-0.8, -0.4, 0, 0.4, 0.8], r);
  const sec = sectionAt(n.t + 0.01).id;
  const fc = sec === "build" ? 500 + 2600 * buildOpen(n.t) ** 1.5 : sec === "verse" ? (n.midi < 60 ? 900 : 1500) : sec === "chorus" ? 3400 : 2600;
  const fl = new SVF(fc, 0.7);
  const fr = new SVF(fc, 0.7);
  const durS = n.dur * SR;
  const att = 0.07 * SR;
  const g = n.vel * 0.05;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    let l = 0;
    let rr = 0;
    for (let v = 0; v < vs.length; v++) {
      const o = vs[v];
      o.p += o.dt;
      if (o.p >= 1) o.p -= 1;
      const y = blepSaw(o.p, o.dt);
      l += y * o.gL;
      rr += y * o.gR;
    }
    let a = Math.min(1, k / att);
    if (k > durS) a *= Math.exp(-(k - durS) / (rel * SR * 0.3));
    PAD.L[i] += fl.tick(l) * a * g;
    PAD.R[i] += fr.tick(rr) * a * g;
  }
}

function warm(n: Note, idx: number) {
  const r = mulberry32(6500 + idx);
  const f0 = mtof(n.midi);
  const rel = 0.9;
  const [i0, i1] = span(n.t, n.dur + rel);
  const vs = sawVoices(f0, [-7, 0, 7], [-0.5, 0, 0.5], r);
  const fl = new SVF(820, 0.6);
  const fr = new SVF(820, 0.6);
  const durS = n.dur * SR;
  const att = 0.35 * SR;
  const g = n.vel * 0.07;
  let ph = r();
  const dts = f0 / SR;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    let l = 0;
    let rr = 0;
    for (let v = 0; v < vs.length; v++) {
      const o = vs[v];
      o.p += o.dt;
      if (o.p >= 1) o.p -= 1;
      const y = blepSaw(o.p, o.dt);
      l += y * o.gL;
      rr += y * o.gR;
    }
    ph += dts;
    if (ph >= 1) ph -= 1;
    const tri = 4 * Math.abs(ph - 0.5) - 1;
    let a = Math.min(1, k / att);
    a = a * a * (3 - 2 * a);
    if (k > durS) a *= Math.exp(-(k - durS) / (rel * SR * 0.35));
    WARM.L[i] += (fl.tick(l) + tri * 0.4) * a * g;
    WARM.R[i] += (fr.tick(rr) + tri * 0.4) * a * g;
  }
}

// ------------------------------------------------------------------------------ arp
function arp(n: Note, idx: number) {
  const r = mulberry32(7000 + idx);
  const f0 = mtof(n.midi);
  const [i0, i1] = span(n.t, n.dur + 0.06);
  const d1 = (f0 * cents(7)) / SR;
  const d2 = (f0 * cents(-7)) / SR;
  let p1 = r();
  let p2 = r();
  const sec = sectionAt(n.t + 0.01).id;
  const base = sec === "build" ? 380 * Math.pow(18, buildOpen(n.t) ** 1.2) : sec === "verse" ? 1500 : 2800;
  const f = new SVF(base, 1.4);
  const step = Math.round(n.t / STEP);
  const [gL, gR] = panGains(step % 2 ? 0.35 : -0.35);
  const g = n.vel * 0.2;
  const durS = n.dur * SR;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    if ((k & 15) === 0) f.set(base * (0.35 + 3.2 * Math.exp(-k / (0.05 * SR))), 1.4);
    p1 += d1;
    if (p1 >= 1) p1 -= 1;
    p2 += d2;
    if (p2 >= 1) p2 -= 1;
    const x = blepSaw(p1, d1) + blepSaw(p2, d2);
    let a = Math.min(1, k / 60) * Math.exp(-k / (0.13 * SR));
    if (k > durS) a *= Math.exp(-(k - durS) / (0.01 * SR));
    const y = f.tick(x) * a * g;
    ARP.L[i] += y * gL;
    ARP.R[i] += y * gR;
  }
}

// ------------------------------------------------------------------------------ bass
function bass(n: Note, idx: number) {
  const r = mulberry32(8000 + idx);
  const f0 = mtof(n.midi);
  const soft = sectionAt(n.t + 0.01).id === "daily";
  const [i0, i1] = span(n.t, n.dur + 0.04);
  const dt = f0 / SR;
  let p = r();
  let ps = p;
  const f = new SVF(600, 1.1);
  const durS = n.dur * SR;
  const g = n.vel * (soft ? 0.22 : 0.3);
  for (let i = i0, k = 0; i < i1; i++, k++) {
    if ((k & 15) === 0) f.set(soft ? 260 : 170 + 1100 * Math.exp(-k / (0.07 * SR)), 1.1);
    p += dt;
    if (p >= 1) p -= 1;
    ps += dt;
    if (ps >= 1) ps -= 1;
    const sub = Math.sin(TAU * ps);
    const mid = f.tick(blepSaw(p, dt));
    let a = Math.min(1, k / (0.003 * SR));
    if (k > durS) a *= Math.exp(-(k - durS) / (0.008 * SR));
    const y = Math.tanh((sub * (soft ? 0.8 : 0.5) + mid * (soft ? 0.25 : 0.75)) * 1.3) * a * g;
    BASS.L[i] += y;
    BASS.R[i] += y;
  }
}

// ------------------------------------------------------------------------------ guitar (the chugs)
function chug(n: Note, idx: number) {
  const open = !n.mute;
  for (let side = 0; side < 2; side++) {
    const r = mulberry32(9000 + idx * 2 + side);
    const t = n.t + (r() - 0.5) * 0.005;
    const rel = open ? 0.03 : 0.012;
    const [i0, i1] = span(t, n.dur + rel);
    const strings = [0, 7, 12].map((iv, s) => ({
      p: r(),
      f: mtof(n.midi + iv) * cents((side ? 4 : -4) + (r() - 0.5) * 3),
      a: [1, 0.85, 0.6][s],
    }));
    const di = new SVF(open ? 3000 : 460 + 260 * n.vel, 0.62);
    let hpx = 0;
    let hpy = 0;
    const hpc = Math.exp((-TAU * 110) / SR);
    const drive = open ? 13 : 20;
    const durS = n.dur * SR;
    const relS = rel * SR;
    const tauD = (open ? 1.6 : 0.075) * SR;
    const g = n.vel * 0.16;
    const out = side ? GTR.R : GTR.L;
    const bleed = side ? GTR.L : GTR.R;
    for (let i = i0, k = 0; i < i1; i++, k++) {
      const bend = 1 + 0.013 * Math.exp(-k / (0.012 * SR));
      let x = 0;
      for (let s = 0; s < 3; s++) {
        const st = strings[s];
        const dt = (st.f * bend) / SR;
        st.p += dt;
        if (st.p >= 1) st.p -= 1;
        x += blepSaw(st.p, dt) * st.a;
      }
      // pick envelope into the amp
      let e = Math.min(1, k / (0.0009 * SR)) * Math.exp(-k / tauD);
      x = di.tick(x) * e;
      // tighten the low end before the gain
      hpy = hpc * (hpy + x - hpx);
      hpx = x;
      let y = Math.tanh(hpy * drive + 0.12) - 0.1194;
      y = Math.tanh(y * 2.4) * 0.8;
      // gate after the gain, so the tail stops dead (that is what makes a chug a chug)
      let gate = 1;
      if (k > durS) gate = Math.exp(-(k - durS) / (relS * 0.3));
      y *= gate * g;
      out[i] += y;
      bleed[i] += y * 0.12;
    }
  }
}

// ------------------------------------------------------------------------------ choir
const FORMANTS: Record<"a" | "o", [number, number, number][]> = {
  a: [[780, 1, 80], [1150, 0.5, 90], [2800, 0.12, 130]],
  o: [[450, 1, 70], [800, 0.35, 80], [2830, 0.06, 110]],
};
function choir(n: Note, idx: number) {
  const r = mulberry32(11000 + idx);
  const f0 = mtof(n.midi);
  const rel = 0.6;
  const [i0, i1] = span(n.t, n.dur + rel);
  const voices = [-9, 0, 8, -3].map((c, v) => ({
    p: r(),
    dt: (f0 * cents(c)) / SR,
    vs: 0,
    vc: 1,
    vw: 2 * Math.sin((Math.PI * (4.7 + 0.45 * v + r() * 0.3)) / SR),
    pan: [-0.6, 0.1, 0.6, -0.1][v],
  }));
  voices.forEach((v) => {
    const th = r() * TAU;
    v.vs = Math.sin(th);
    v.vc = Math.cos(th);
  });
  const form = FORMANTS[n.vowel ?? "a"];
  const bankL = form.map(([f, , bw]) => new SVF(f, f / bw));
  const bankR = form.map(([f, , bw]) => new SVF(f, f / bw));
  const nz = noiseGen(12000 + idx);
  const durS = n.dur * SR;
  const att = 0.4 * SR;
  const g = n.vel * 0.55;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    let l = 0;
    let rr = 0;
    for (const v of voices) {
      v.vs += v.vw * v.vc;
      v.vc -= v.vw * v.vs;
      const dt = v.dt * (1 + 0.0095 * v.vs);
      v.p += dt;
      if (v.p >= 1) v.p -= 1;
      const y = blepSaw(v.p, dt);
      const [gL, gR] = [0.5 - v.pan * 0.4, 0.5 + v.pan * 0.4];
      l += y * gL;
      rr += y * gR;
    }
    const br = nz() * 0.18;
    l += br;
    rr += br;
    let yl = 0;
    let yr = 0;
    for (let f = 0; f < form.length; f++) {
      bankL[f].tick(l);
      bankR[f].tick(rr);
      yl += bankL[f].band * form[f][1];
      yr += bankR[f].band * form[f][1];
    }
    let a = Math.min(1, k / att);
    a = a * a * (3 - 2 * a);
    if (k > durS) a *= Math.exp(-(k - durS) / (rel * SR * 0.35));
    CHOIR.L[i] += yl * a * g;
    CHOIR.R[i] += yr * a * g;
  }
}

// ------------------------------------------------------------------------------ drums
const KICKS = NOTES.filter((n) => n.inst === "kick").map((n) => n.t);
function kick(n: Note, idx: number) {
  const next = KICKS.find((t) => t > n.t + 0.001) ?? n.t + 1;
  const gap = next - n.t;
  const soft = sectionAt(n.t + 0.01).id === "daily";
  const tau = soft ? 0.22 : clamp(gap * 0.55, 0.05, 0.2);
  const [i0, i1] = span(n.t, Math.min(tau * 5, gap + 0.02, 1.2));
  const nz = noiseGen(13000 + idx);
  const hp = new SVF(soft ? 1200 : 2500, 0.7);
  let ph = 0;
  let clickPh = 0;
  const g = n.vel * 0.9;
  const endFade = (i1 - i0) - 0.004 * SR;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const tl = k / SR;
    const f = 48 + (soft ? 90 : 140) * Math.exp(-tl / 0.028) + 30 * Math.exp(-tl / 0.004);
    ph += f / SR;
    let y = Math.sin(TAU * ph) * Math.exp(-tl / tau);
    if (!soft && k < 0.006 * SR) {
      clickPh += 3400 / SR;
      y += (hp.tick(nz()) * 0.9 + Math.sin(TAU * clickPh) * 0.35) * (1 - k / (0.006 * SR));
    } else if (soft && k < 0.004 * SR) y += hp.tick(nz()) * 0.2 * (1 - k / (0.004 * SR));
    y = Math.tanh(y * 1.6) * g;
    if (k > endFade) y *= Math.max(0, 1 - (k - endFade) / (0.004 * SR));
    KICK.L[i] += y;
    KICK.R[i] += y;
  }
}

function snare(n: Note, idx: number) {
  const [i0, i1] = span(n.t, 0.6);
  const nz = noiseGen(14000 + idx);
  const bp = new SVF(2600, 0.6);
  const hp = new SVF(700, 0.7);
  const f0 = 185 * cents(n.cents ?? 0);
  let ph = 0;
  const g = n.vel * 0.55;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const tl = k / SR;
    ph += (f0 * (1 + 0.35 * Math.exp(-tl / 0.012))) / SR;
    const tone = Math.sin(TAU * ph) * Math.exp(-tl / 0.075);
    const w = nz();
    bp.tick(w);
    hp.tick(w);
    const noise = (bp.band * 1.3 + hp.high * 0.5) * Math.exp(-tl / 0.15);
    let y = tone * 0.75 + noise * 0.9;
    if (k < 48) y += w * (1 - k / 48) * 0.8;
    y = Math.tanh(y * 1.4) * g;
    DRUM.L[i] += y;
    DRUM.R[i] += y;
  }
}

function clap(n: Note, idx: number) {
  const [i0, i1] = span(n.t, 0.4);
  const nz = noiseGen(15000 + idx);
  const bp = new SVF(1150, 1.6);
  const g = n.vel * 0.45;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const tl = k / SR;
    const bursts = [0, 0.011, 0.022].reduce((s, o) => s + (tl >= o && tl < o + 0.009 ? Math.exp(-(tl - o) / 0.003) : 0), 0);
    const tail = tl >= 0.022 ? Math.exp(-(tl - 0.022) / 0.1) : 0;
    bp.tick(nz());
    const y = bp.band * 2.2 * (bursts + tail * 0.7) * g;
    DRUM.L[i] += y * 0.9;
    DRUM.R[i] += y;
  }
}

function tom(n: Note, idx: number) {
  const barStart = Math.floor(n.t / (BEAT * 4)) * BEAT * 4;
  const s = Math.round((n.t - barStart) / STEP);
  const f0 = 210 * Math.pow(0.5, s / 16);
  const [i0, i1] = span(n.t, 0.5);
  const nz = noiseGen(16000 + idx);
  const bp = new SVF(f0 * 3, 1);
  let ph = 0;
  const pan = 0.5 - s / 16;
  const [gL, gR] = panGains(pan);
  const g = n.vel * 0.6;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const tl = k / SR;
    ph += (f0 * (1 + 0.5 * Math.exp(-tl / 0.02))) / SR;
    let y = Math.sin(TAU * ph) * Math.exp(-tl / 0.2);
    bp.tick(nz());
    y += bp.band * Math.exp(-tl / 0.03) * 0.8;
    y = Math.tanh(y * 1.3) * g;
    DRUM.L[i] += y * gL;
    DRUM.R[i] += y * gR;
  }
}

// 808-style metal: six square oscillators at inharmonic frequencies
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
function metalVoice(scale: number, r: () => number) {
  return METAL.map((f) => ({ p: r(), dt: (f * scale * (1 + (r() - 0.5) * 0.02)) / SR }));
}
function cymbal(n: Note, idx: number, kind: "hat" | "ohat" | "crash" | "china" | "ride" | "shaker") {
  const P = {
    hat: { tau: 0.03, hp: 7500, scale: 1.7, noise: 0.5, gain: 0.22, len: 0.15, width: 0.2 },
    ohat: { tau: 0.2, hp: 6800, scale: 1.7, noise: 0.55, gain: 0.2, len: 0.7, width: 0.25 },
    crash: { tau: 1.05, hp: 3800, scale: 2.3, noise: 0.9, gain: 0.3, len: 3.5, width: 0.8 },
    china: { tau: 0.42, hp: 2300, scale: 1.4, noise: 1, gain: 0.26, len: 1.6, width: 0.5 },
    ride: { tau: 0.5, hp: 4800, scale: 3, noise: 0.3, gain: 0.14, len: 1.5, width: 0.3 },
    shaker: { tau: 0.035, hp: 6000, scale: 1, noise: 1, gain: 0.18, len: 0.12, width: 0.4 },
  }[kind];
  const [i0, i1] = span(n.t, P.len);
  const rL = mulberry32(17000 + idx * 2);
  const rR = mulberry32(17001 + idx * 2);
  const vl = metalVoice(P.scale, rL);
  const vr = metalVoice(P.scale * 1.013, rR);
  const nl = noiseGen(18000 + idx * 2);
  const nr = noiseGen(18001 + idx * 2);
  const hl = new SVF(P.hp, 0.8);
  const hr = new SVF(P.hp, 0.8);
  const bell = kind === "ride" ? { c: 2 * Math.sin((Math.PI * 3150) / SR), s: 0, co: 1 } : null;
  const att = kind === "shaker" ? 0.006 * SR : 0.0008 * SR;
  const g = n.vel * P.gain;
  const [pl, pr] = [0.5 + P.width * 0.5, 0.5 - P.width * 0.5];
  for (let i = i0, k = 0; i < i1; i++, k++) {
    let ml = 0;
    let mr = 0;
    if (kind !== "shaker") {
      for (let v = 0; v < 6; v++) {
        const a = vl[v];
        a.p += a.dt;
        if (a.p >= 1) a.p -= 1;
        ml += a.p < 0.5 ? 1 : -1;
        const b = vr[v];
        b.p += b.dt;
        if (b.p >= 1) b.p -= 1;
        mr += b.p < 0.5 ? 1 : -1;
      }
      ml /= 6;
      mr /= 6;
    }
    let xl = ml * (1 - P.noise * 0.5) + nl() * P.noise;
    let xr = mr * (1 - P.noise * 0.5) + nr() * P.noise;
    if (kind === "china") {
      xl = Math.tanh(xl * ml * 3);
      xr = Math.tanh(xr * mr * 3);
    }
    const e = Math.min(1, k / att) * Math.exp(-k / (P.tau * SR));
    hl.tick(xl);
    hr.tick(xr);
    let yl = hl.high;
    let yr = hr.high;
    if (bell) {
      bell.s += bell.c * bell.co;
      bell.co -= bell.c * bell.s;
      const be = bell.s * 0.35 * Math.exp(-k / (0.35 * SR));
      yl += be;
      yr += be;
    }
    CYM.L[i] += (yl * pl + yr * (1 - pl)) * e * g;
    CYM.R[i] += (yr * (1 - pr) + yl * pr) * e * g;
  }
}

// ============================================================================================ effects
function fxDrone(f: Fx, idx: number) {
  const [i0, i1] = span(f.t, f.dur);
  const len = i1 - i0;
  const r = mulberry32(20000 + idx);
  const osc = [26, 38, 45, 50].map((m, j) => ({ p: r(), dt: (mtof(m) * cents((r() - 0.5) * 8)) / SR, a: [0.9, 0.55, 0.3, 0.18][j] }));
  const fl = new SVF(260, 0.9);
  const fr = new SVF(260, 0.9);
  let lfo = 0;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const u = k / len;
    if ((k & 63) === 0) {
      lfo = Math.sin(TAU * 0.07 * (k / SR));
      const fc = 180 + 260 * u + 90 * lfo;
      fl.set(fc, 0.9);
      fr.set(fc * 1.08, 0.9);
    }
    let x = 0;
    for (let j = 0; j < osc.length; j++) {
      const o = osc[j];
      o.p += o.dt;
      if (o.p >= 1) o.p -= 1;
      x += (j === 0 ? Math.sin(TAU * o.p) : blepSaw(o.p, o.dt)) * o.a;
    }
    const env = Math.min(1, u / 0.3) * Math.min(1, (1 - u) / 0.15);
    const y = x * env * f.vel * 0.05;
    AMB.L[i] += fl.tick(y);
    AMB.R[i] += fr.tick(y);
  }
}

function fxRumble(f: Fx) {
  const [i0, i1] = span(f.t, f.dur);
  const len = i1 - i0;
  let p1 = 0;
  let p2 = 0;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const u = k / len;
    p1 += mtof(38) / SR;
    p2 += mtof(26) / SR;
    const trem = 0.8 + 0.2 * Math.sin(TAU * 0.4 * (k / SR));
    const y = (Math.sin(TAU * p1) * 0.6 + Math.sin(TAU * p2) * 0.8) * u * u * trem * f.vel * 0.09;
    AMB.L[i] += y;
    AMB.R[i] += y;
  }
}

function fxRoom(f: Fx, idx: number) {
  const [i0, i1] = span(f.t, f.dur);
  const nl = noiseGen(21000 + idx);
  const nr = noiseGen(21500 + idx);
  let bl = 0;
  let br = 0;
  const hl = new SVF(3000, 0.5);
  const hr = new SVF(3000, 0.5);
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const u = k / (i1 - i0);
    bl = bl * 0.995 + nl() * 0.05;
    br = br * 0.995 + nr() * 0.05;
    const env = Math.min(1, k / SR) * Math.min(1, (i1 - i) / SR);
    AMB.L[i] += (bl * 0.2 + hl.tick(nl()) * 0.003) * env * f.vel * (0.9 + 0.1 * Math.sin(u * 40));
    AMB.R[i] += (br * 0.2 + hr.tick(nr()) * 0.003) * env * f.vel;
  }
}

function fxCity(f: Fx, idx: number) {
  const [i0, i1] = span(f.t, f.dur);
  const nl = noiseGen(22000 + idx);
  const nr = noiseGen(22500 + idx);
  const fl = new SVF(500, 0.6);
  const fr = new SVF(520, 0.6);
  const cars = [0.18, 0.47, 0.71].map((c, j) => ({ c, w: 0.05 + 0.02 * j, pan: [-0.6, 0.5, -0.1][j] }));
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const u = k / (i1 - i0);
    let swell = 0.55;
    let pan = 0;
    for (const c of cars) {
      const d = (u - c.c) / c.w;
      const s = Math.exp(-d * d);
      swell += s * 0.9;
      pan += s * c.pan * (d < 0 ? -1 : 1);
    }
    if ((k & 63) === 0) {
      fl.set(380 + 500 * swell, 0.6);
      fr.set(400 + 500 * swell, 0.6);
    }
    const env = Math.min(1, k / (1.2 * SR)) * Math.min(1, (i1 - i) / (0.3 * SR));
    const g = env * f.vel * 0.05 * swell;
    AMB.L[i] += fl.tick(nl()) * g * (1 - pan * 0.4);
    AMB.R[i] += fr.tick(nr()) * g * (1 + pan * 0.4);
  }
}

function fxTick(f: Fx, idx: number) {
  const [i0, i1] = span(f.t, 0.06);
  const nz = noiseGen(23000 + idx);
  const bp = new SVF(f.a ? 2500 : 3300, 5);
  let ph = 0;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    ph += (f.a ? 1100 : 1350) / SR;
    bp.tick(nz());
    const y = (bp.band * 2.5 * Math.exp(-k / (0.006 * SR)) + Math.sin(TAU * ph) * 0.4 * Math.exp(-k / (0.004 * SR))) * f.vel * 0.16;
    FXB.L[i] += y * (f.a ? 0.8 : 1);
    FXB.R[i] += y * (f.a ? 1 : 0.8);
  }
}

function fxType(t: number, idx: number, vel: number) {
  const r = mulberry32(24000 + idx);
  const [i0, i1] = span(t + (r() - 0.5) * 0.012, 0.09);
  const nz = noiseGen(24500 + idx);
  const bp = new SVF(1800 + r() * 900, 1.6);
  let ph = 0;
  const f0 = 130 + r() * 40;
  const rel = 0.03 + r() * 0.015;
  const [gL, gR] = panGains((r() - 0.5) * 0.3);
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const tl = k / SR;
    ph += f0 / SR;
    bp.tick(nz());
    let y = bp.band * 2.2 * Math.exp(-tl / 0.004) + Math.sin(TAU * ph) * 0.5 * Math.exp(-tl / 0.012);
    if (tl > rel) y += bp.band * 0.9 * Math.exp(-(tl - rel) / 0.003);
    y *= vel * 0.2;
    FXB.L[i] += y * gL;
    FXB.R[i] += y * gR;
  }
}

function fxBird(f: Fx, idx: number) {
  const r = mulberry32(25000 + (f.a ?? idx));
  const chirps = 2 + Math.floor(r() * 3);
  const base = 2900 + r() * 1300;
  const [gL, gR] = panGains((r() - 0.5) * 1.3);
  let t = f.t;
  for (let c = 0; c < chirps; c++) {
    const len = 0.045 + r() * 0.05;
    const up = r() < 0.5;
    const [i0, i1] = span(t, len);
    let ph = 0;
    for (let i = i0, k = 0; i < i1; i++, k++) {
      const u = k / (i1 - i0);
      const fr = base * (up ? 1 + 0.35 * Math.sin(Math.PI * u) : 1.3 - 0.4 * u);
      ph += fr / SR;
      const y = Math.sin(TAU * ph) * Math.pow(Math.sin(Math.PI * u), 1.5) * f.vel * 0.06;
      FXB.L[i] += y * gL;
      FXB.R[i] += y * gR;
    }
    t += len + 0.03 + r() * 0.06;
  }
}

function fxBlip(f: Fx) {
  const fr = [1568, 1760, 1976, 2217, 2637][f.a ?? 0];
  [0, 0.07].forEach((o, j) => {
    const [i0, i1] = span(f.t + o, 0.08);
    let ph = 0;
    for (let i = i0, k = 0; i < i1; i++, k++) {
      ph += (fr * (j ? 1.5 : 1)) / SR;
      const y = Math.sin(TAU * ph) * Math.exp(-k / (0.025 * SR)) * Math.min(1, k / 48) * f.vel * 0.1;
      FXB.L[i] += y;
      FXB.R[i] += y;
    }
  });
}

function fxGlitch(f: Fx, idx: number) {
  const r = mulberry32(26000 + idx);
  let t = f.t;
  while (t < f.t + f.dur) {
    const len = 0.008 + r() * 0.03;
    const kind = r();
    const fr = 180 + r() * 3000;
    const [i0, i1] = span(t, len);
    const nz = noiseGen(26500 + Math.floor(t * 1000));
    let ph = 0;
    let held = 0;
    const hold = 2 + Math.floor(r() * 24);
    const pan = (r() - 0.5) * 1.4;
    const [gL, gR] = panGains(pan);
    for (let i = i0, k = 0; i < i1; i++, k++) {
      ph += fr / SR;
      let y: number;
      if (kind < 0.4) y = (ph % 1) < 0.5 ? 1 : -1;
      else if (kind < 0.75) {
        if (k % hold === 0) held = nz();
        y = held;
      } else y = Math.sin(TAU * ph) > 0.2 ? 1 : 0;
      const e = Math.min(1, k / 24) * Math.min(1, (i1 - i) / 24);
      y *= e * f.vel * 0.12;
      FXB.L[i] += y * gL;
      FXB.R[i] += y * gR;
    }
    t += len + (r() < 0.3 ? r() * 0.03 : 0);
  }
}

function fxHeart(f: Fx) {
  [0, 0.19].forEach((o, j) => {
    const [i0, i1] = span(f.t + o, 0.45);
    let ph = 0;
    const lp = new SVF(160, 0.7);
    for (let i = i0, k = 0; i < i1; i++, k++) {
      const tl = k / SR;
      ph += (40 + 30 * Math.exp(-tl / 0.03)) / SR;
      const y = lp.tick(Math.sin(TAU * ph)) * Math.exp(-tl / 0.09) * Math.min(1, k / 96) * f.vel * (j ? 0.55 : 0.8);
      FXB.L[i] += y;
      FXB.R[i] += y;
    }
  });
}

function fxRiser(f: Fx, idx: number) {
  const [i0, i1] = span(f.t, f.dur);
  const len = i1 - i0;
  const nl = noiseGen(27000 + idx);
  const nr = noiseGen(27500 + idx);
  const bl = new SVF(300, 1.3);
  const br = new SVF(300, 1.3);
  const lp = new SVF(4000, 0.7);
  let ph = 0;
  let vib = 0;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const u = k / len;
    if ((k & 31) === 0) {
      const fc = 250 * Math.pow(9000 / 250, Math.pow(u, 1.3));
      bl.set(fc, 1.3);
      br.set(fc * 1.05, 1.3);
    }
    vib += (4 + 18 * u) / SR;
    const m = 50 + 36 * u * u + 0.3 * Math.sin(TAU * vib);
    const dt = mtof(m) / SR;
    ph += dt;
    if (ph >= 1) ph -= 1;
    const saw = lp.tick(blepSaw(ph, dt)) * 0.3;
    const a = Math.pow(u, 2.2) * f.vel * 0.3;
    const fade = Math.min(1, (i1 - i) / (0.01 * SR));
    bl.tick(nl());
    br.tick(nr());
    FXB.L[i] += (bl.band * 1.5 + saw) * a * fade;
    FXB.R[i] += (br.band * 1.5 + saw) * a * fade;
  }
}

function fxRevCym(f: Fx, idx: number) {
  const [i0, i1] = span(f.t, f.dur);
  const len = i1 - i0;
  const nl = noiseGen(28000 + idx);
  const nr = noiseGen(28500 + idx);
  const hl = new SVF(3500, 0.7);
  const hr = new SVF(3500, 0.7);
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const toEnd = (len - k) / SR;
    const e = Math.exp(-toEnd / (f.dur * 0.35)) * Math.min(1, (len - k) / (0.004 * SR));
    hl.tick(nl());
    hr.tick(nr());
    FXB.L[i] += hl.high * e * f.vel * 0.28;
    FXB.R[i] += hr.high * e * f.vel * 0.28;
  }
}

function fxBoom(f: Fx, idx: number) {
  const [i0, i1] = span(f.t, f.dur);
  const nz = noiseGen(29000 + idx);
  const lp = new SVF(900, 0.7);
  let ph = 0;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const tl = k / SR;
    ph += (30 + 38 * Math.exp(-tl / 0.22)) / SR;
    let y = Math.sin(TAU * ph) * Math.exp(-tl / (f.dur * 0.3));
    y += lp.tick(nz()) * Math.exp(-tl / 0.12) * 0.7;
    y = Math.tanh(y * 1.5) * Math.min(1, k / 64) * f.vel * 0.55;
    FXB.L[i] += y;
    FXB.R[i] += y;
  }
}

function fxSubdrop(f: Fx) {
  const [i0, i1] = span(f.t, f.dur);
  let ph = 0;
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const u = k / (i1 - i0);
    ph += (90 * Math.pow(32 / 90, Math.pow(u, 0.6))) / SR;
    const y = Math.tanh(Math.sin(TAU * ph) * 1.8) * (1 - u) * Math.min(1, k / 96) * f.vel * 0.5;
    FXB.L[i] += y;
    FXB.R[i] += y;
  }
}

function fxSwell(f: Fx, idx: number) {
  const [i0, i1] = span(f.t, f.dur);
  const len = i1 - i0;
  const nz = noiseGen(30000 + idx);
  const bp = new SVF(600, 0.8);
  const tones = [62, 69, 74].map((m) => ({ p: 0, dt: mtof(m) / SR }));
  for (let i = i0, k = 0; i < i1; i++, k++) {
    const u = k / len;
    if ((k & 31) === 0) bp.set(400 + 3500 * u * u, 0.8);
    bp.tick(nz());
    let x = bp.band * 0.8;
    for (const t of tones) {
      t.p += t.dt;
      x += Math.sin(TAU * t.p) * 0.12;
    }
    const e = Math.exp(5 * (u - 1)) * Math.min(1, (len - k) / (0.015 * SR));
    FXB.L[i] += x * e * f.vel * 0.25;
    FXB.R[i] += x * e * f.vel * 0.25;
  }
}

// ============================================================================================ render
log(`${NOTES.length} notes, ${FX.length} effects, ${(N / SR).toFixed(1)} s`);
const counts: Record<string, number> = {};
NOTES.forEach((n, idx) => {
  counts[n.inst] = (counts[n.inst] ?? 0) + 1;
  switch (n.inst) {
    case "musicbox": return musicbox(n, idx);
    case "chime": return chime(n, idx);
    case "lead": return lead(n, idx);
    case "pad": return pad(n, idx);
    case "warm": return warm(n, idx);
    case "arp": return arp(n, idx);
    case "bass": return bass(n, idx);
    case "chug": return chug(n, idx);
    case "choir": return choir(n, idx);
    case "kick": return kick(n, idx);
    case "snare": return snare(n, idx);
    case "clap": return clap(n, idx);
    case "tom": return tom(n, idx);
    case "hat":
    case "ohat":
    case "crash":
    case "china":
    case "ride":
    case "shaker":
      return cymbal(n, idx, n.inst);
  }
});
log(`notes rendered: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);

FX.forEach((f, idx) => {
  switch (f.kind) {
    case "drone": return fxDrone(f, idx);
    case "rumble": return fxRumble(f);
    case "room": return fxRoom(f, idx);
    case "city": return fxCity(f, idx);
    case "tick": return fxTick(f, idx);
    case "bird": return fxBird(f, idx);
    case "blip": return fxBlip(f);
    case "glitch": return fxGlitch(f, idx);
    case "heart": return fxHeart(f);
    case "riser": return fxRiser(f, idx);
    case "revcym": return fxRevCym(f, idx);
    case "boom": return fxBoom(f, idx);
    case "subdrop": return fxSubdrop(f);
    case "swell": return fxSwell(f, idx);
  }
});
// the typewriter: one key per character of every typed line
{
  let k = 0;
  for (const line of TYPED_LINES) {
    const chars = [...line.text];
    chars.forEach((ch, j) => {
      if (ch === " ") return;
      const soft = /[，。、？！…—「」]/.test(ch);
      fxType(bt(line.bar) + j / line.cps, k++, soft ? 0.55 : 0.85);
    });
  }
}
log("effects rendered");

// ============================================================================================ mix
// ---- bus EQ
eqBus(GTR, [["hp", 85, 0.7], ["peak", 380, 1.1, -4], ["peak", 1700, 0.9, 3], ["lp", 5200, 0.7], ["lp", 5200, 0.7], ["highshelf", 7000, 0.7, -4]]);
eqBus(PAD, [["hp", 190, 0.7]]);
eqBus(LEAD, [["hp", 220, 0.7], ["peak", 2600, 0.8, 2]]);
eqBus(ARP, [["hp", 300, 0.7]]);
eqBus(CHOIR, [["hp", 160, 0.7]]);
eqBus(BOX, [["hp", 180, 0.7]]);
eqBus(WARM, [["hp", 90, 0.7]]);
eqBus(BASS, [["hp", 32, 0.7], ["lp", 3000, 0.7]]);
eqBus(CYM, [["hp", 300, 0.7]]);
log("bus eq");

// ---- gain staging: each bus measured where it matters and set to a planned level (dBFS RMS)
const rmsDb = (b: Bus, t0: number, t1: number) => {
  let s = 0;
  let n = 0;
  for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i += 3) {
    s += b.L[i] * b.L[i] + b.R[i] * b.R[i];
    n += 2;
  }
  return 10 * Math.log10(s / Math.max(1, n) + 1e-20);
};
const scale = (b: Bus, g: number) => {
  for (let i = 0; i < N; i++) {
    b.L[i] *= g;
    b.R[i] *= g;
  }
};
const DROP: [number, number] = [bt(38), bt(54)];
const peakOf = (b: Bus, t0: number, t1: number) => {
  let pk = 0;
  for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) pk = Math.max(pk, Math.abs(b.L[i]), Math.abs(b.R[i]));
  return pk;
};
const PLAN: [Bus, [number, number], number][] = [
  [KICK, DROP, -17],
  [DRUM, DROP, -20],
  [CYM, DROP, -25],
  [GTR, DROP, -16],
  [BASS, DROP, -17.5],
  [LEAD, DROP, -17.5],
  [PAD, DROP, -25],
  [ARP, DROP, -26],
  [CHOIR, [bt(98), bt(112)], -24],
  [BOX, [bt(10), bt(26)], -23.5],
  [WARM, [bt(18), bt(26)], -31],
];
for (const [b, [a, z], target] of PLAN) {
  const now = rmsDb(b, a, z);
  const g = Math.pow(10, (target - now) / 20);
  scale(b, g);
  log(`  ${b.name.padEnd(6)} ${now.toFixed(1)} dB → ${target} dB (×${g.toFixed(2)})`);
}
{
  // soft-clip the kick at ~9 dB over its RMS: a shorter, harder transient that leaves the limiter alone
  const c = Math.pow(10, (-17 + 9) / 20);
  const before = peakOf(KICK, DROP[0], DROP[1]);
  for (let i = 0; i < N; i++) {
    KICK.L[i] = Math.tanh(KICK.L[i] / c) * c;
    KICK.R[i] = Math.tanh(KICK.R[i] / c) * c;
  }
  log(`  kick   peak ${(20 * Math.log10(before)).toFixed(1)} dB → ${(20 * Math.log10(peakOf(KICK, DROP[0], DROP[1]))).toFixed(1)} dB after the clipper`);
}
{
  // the chime is set by its peak, the effect buses stay where the synth functions put them
  let pk = 0;
  for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(CHIME.L[i]), Math.abs(CHIME.R[i]));
  scale(CHIME, 0.2 / Math.max(pk, 1e-9));
}

// ---- sidechain: the pads, bass, arp and choir breathe with the kicks that fall on the beat
const SC = new Float32Array(N);
{
  const beatKicks = NOTES.filter((n) => {
    if (n.inst !== "kick" || n.vel < 0.7) return false;
    const ph = n.t / BEAT;
    return Math.abs(ph - Math.round(ph)) < 0.02 && sectionAt(n.t + 0.01).id !== "daily";
  }).map((n) => n.t);
  for (const t of beatKicks) {
    const i0 = Math.round(t * SR);
    const len = Math.round(0.33 * SR);
    for (let k = 0; k < len && i0 + k < N; k++) {
      const x = k / SR;
      const d = x < 0.004 ? x / 0.004 : Math.exp(-(x - 0.004) / 0.09);
      if (d > SC[i0 + k]) SC[i0 + k] = d;
    }
  }
  const duck = (b: Bus, depth: number) => {
    for (let i = 0; i < N; i++) {
      const g = 1 - depth * SC[i];
      b.L[i] *= g;
      b.R[i] *= g;
    }
  };
  duck(PAD, 0.6);
  duck(BASS, 0.45);
  duck(ARP, 0.4);
  duck(CHOIR, 0.3);
  duck(LEAD, 0.12);
}
log("sidechain");

// ---- sends
const cutIdx = new Set(CUTS.map((c) => Math.round(c * SR)));
const SENDS: [Bus, number, number][] = [
  // bus, reverb, delay
  [BOX, 0.62, 0.14],
  [CHIME, 0.45, 0.25],
  [LEAD, 0.22, 0.2],
  [ARP, 0.18, 0.18],
  [PAD, 0.3, 0],
  [WARM, 0.35, 0],
  [CHOIR, 0.5, 0],
  [GTR, 0.05, 0],
  [KICK, 0.02, 0],
  [DRUM, 0.2, 0],
  [CYM, 0.1, 0],
  [FXB, 0.3, 0.06],
  [AMB, 0.04, 0],
];

// ping-pong delay, dotted eighth
const DL = new Float32Array(N);
const DR = new Float32Array(N);
{
  const d = Math.round(STEP * 3 * SR);
  const bl = new Float32Array(d);
  const br = new Float32Array(d);
  let pos = 0;
  let lpL = 0;
  let lpR = 0;
  const fb = 0.38;
  const c = Math.exp((-TAU * 3200) / SR);
  for (let i = 0; i < N; i++) {
    if (cutIdx.has(i)) {
      bl.fill(0);
      br.fill(0);
      lpL = lpR = 0;
    }
    let inp = 0;
    for (const [b, , ds] of SENDS) if (ds) inp += (b.L[i] + b.R[i]) * 0.5 * ds;
    const ol = bl[pos];
    const or = br[pos];
    lpL = (1 - c) * ol + c * lpL;
    lpR = (1 - c) * or + c * lpR;
    bl[pos] = inp + lpR * fb;
    br[pos] = lpL * fb;
    DL[i] = ol;
    DR[i] = or;
    if (++pos >= d) pos = 0;
  }
}
log("delay");

// 8-line FDN reverb (Hadamard feedback, damped lines, 2.6 s)
const RL = new Float32Array(N);
const RR = new Float32Array(N);
{
  const lens = [1601, 1867, 2053, 2399, 2687, 3001, 3347, 3739];
  const rt60 = 2.6;
  const gains = lens.map((l) => Math.pow(10, (-3 * l) / (rt60 * SR)));
  const bufs = lens.map((l) => new Float32Array(l));
  const pos = lens.map(() => 0);
  const damp = lens.map(() => 0);
  const dc = Math.exp((-TAU * 5200) / SR);
  const pre = new Float32Array(Math.round(0.022 * SR));
  let pp = 0;
  const hpL = Biquad.make("hp", 220, 0.7);
  const hpR = Biquad.make("hp", 220, 0.7);
  const lpL = Biquad.make("lp", 7500, 0.7);
  const lpR = Biquad.make("lp", 7500, 0.7);
  const v = new Float64Array(8);
  const s8 = 1 / Math.sqrt(8);
  let preR = 0;
  for (let i = 0; i < N; i++) {
    if (cutIdx.has(i)) {
      bufs.forEach((b) => b.fill(0));
      damp.fill(0);
      pre.fill(0);
      preR = 0;
    }
    let inL = 0;
    let inR = 0;
    for (const [b, rs] of SENDS) {
      inL += b.L[i] * rs;
      inR += b.R[i] * rs;
    }
    inL = lpL.tick(hpL.tick(inL));
    inR = lpR.tick(hpR.tick(inR));
    // predelay (left through the line, right one sample later, cheap decorrelation)
    const dl = pre[pp];
    pre[pp] = inL;
    if (++pp >= pre.length) pp = 0;
    const dr = preR;
    preR = inR;
    for (let j = 0; j < 8; j++) {
      const y = bufs[j][pos[j]];
      damp[j] = (1 - dc) * y + dc * damp[j];
      v[j] = damp[j] * gains[j];
    }
    // fast Walsh–Hadamard
    for (let h = 1; h < 8; h <<= 1) {
      for (let a = 0; a < 8; a += h << 1) {
        for (let b = a; b < a + h; b++) {
          const x = v[b];
          const y = v[b + h];
          v[b] = x + y;
          v[b + h] = x - y;
        }
      }
    }
    for (let j = 0; j < 8; j++) {
      const inj = j % 2 ? dr : dl;
      bufs[j][pos[j]] = v[j] * s8 + inj * (j < 4 ? 0.5 : -0.5);
      if (++pos[j] >= lens[j]) pos[j] = 0;
    }
    RL[i] = (bufs[0][pos[0]] - bufs[2][pos[2]] + bufs[4][pos[4]] - bufs[6][pos[6]]) * 0.5;
    RR[i] = (bufs[1][pos[1]] - bufs[3][pos[3]] + bufs[5][pos[5]] - bufs[7][pos[7]]) * 0.5;
  }
}
log("reverb");

// ---- where every bus sits, section by section (dB RMS after gain staging)
{
  const all = [BOX, CHIME, LEAD, ARP, PAD, WARM, BASS, GTR, CHOIR, KICK, DRUM, CYM, FXB, AMB];
  const head = "section    " + all.map((b) => b.name.padStart(6)).join("");
  const rows = SECTIONS.map((s) => s.id.padEnd(11) + all.map((b) => {
    const v = rmsDb(b, bt(s.from), bt(s.from + s.bars));
    return (v < -80 ? "·" : v.toFixed(0)).padStart(6);
  }).join(""));
  const rev = SECTIONS.map((s) => {
    let sum = 0;
    let n = 0;
    for (let i = Math.floor(bt(s.from) * SR); i < Math.floor(bt(s.from + s.bars) * SR); i += 5) {
      sum += RL[i] * RL[i] + RR[i] * RR[i];
      n += 2;
    }
    return `${s.id}:${(10 * Math.log10(sum / n + 1e-20)).toFixed(0)}`;
  });
  log("bus levels:\n  " + head + "\n  " + rows.join("\n  ") + "\n  reverb return " + rev.join(" "));
}

// ---- sum
const ML = new Float32Array(N);
const MR = new Float32Array(N);
{
  const dry = [BOX, CHIME, LEAD, ARP, PAD, WARM, BASS, GTR, CHOIR, KICK, DRUM, CYM, FXB, AMB];
  for (let i = 0; i < N; i++) {
    let l = RL[i] * 0.9 + DL[i] * 0.5;
    let r = RR[i] * 0.9 + DR[i] * 0.5;
    for (const b of dry) {
      l += b.L[i];
      r += b.R[i];
    }
    ML[i] = l;
    MR[i] = r;
  }
}
log("summed");

// ---- master-time effects: stutter, and the two tape stops
for (const f of FX.filter((x) => x.kind === "stutter")) {
  const i0 = Math.round(f.t * SR);
  const len = Math.round(f.dur * SR);
  const srcL = ML.slice(i0, i0 + len);
  const srcR = MR.slice(i0, i0 + len);
  for (let k = 0; k < len; k++) {
    const slice = Math.round(((k < len / 2 ? STEP / 2 : STEP / 4) * SR));
    const j = k % slice;
    const e = Math.min(1, j / 48) * Math.min(1, (slice - j) / 48);
    ML[i0 + k] = srcL[j] * e;
    MR[i0 + k] = srcR[j] * e;
  }
}
for (const f of FX.filter((x) => x.kind === "tapestop")) {
  const i0 = Math.round(f.t * SR);
  const len = Math.round(f.dur * SR);
  const srcL = ML.slice(i0, i0 + len);
  const srcR = MR.slice(i0, i0 + len);
  let p = 0;
  for (let k = 0; k < len; k++) {
    const u = k / len;
    const rate = Math.pow(1 - u, 1.7);
    const j = Math.floor(p);
    const fr = p - j;
    const e = Math.min(1, (len - k) / (0.02 * SR));
    ML[i0 + k] = (srcL[j] * (1 - fr) + srcL[j + 1] * fr) * e;
    MR[i0 + k] = (srcR[j] * (1 - fr) + srcR[j + 1] * fr) * e;
    p += rate;
  }
  // the silence after the stop is total (the buses were already cut at i0 + len)
}
log("tape stops");

// ---- master: DC/rumble high-pass, glue, lookahead limiter
{
  const hl = Biquad.make("hp", 24, 0.7);
  const hr = Biquad.make("hp", 24, 0.7);
  for (let i = 0; i < N; i++) {
    ML[i] = hl.tick(ML[i]);
    MR[i] = hr.tick(MR[i]);
  }
}
// pre-gain: the loudest sections should push the limiter by about 3 dB
const pct = (t0: number, t1: number, q: number) => {
  const a: number[] = [];
  for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i += 7) a.push(Math.max(Math.abs(ML[i]), Math.abs(MR[i])));
  a.sort((x, y) => x - y);
  return a[Math.floor(a.length * q)];
};
const p999 = pct(bt(38), bt(54), 0.999);
const CEIL = Math.pow(10, -1 / 20);
const PRE = (CEIL * 2.2) / p999;
log(`drop 99.9th percentile ${p999.toFixed(3)} → pre-gain ×${PRE.toFixed(2)}`);
// how hard each section leans into the limiter (dB), so the arrangement keeps its shape after mastering
const DRIVE: [number, number][] = [
  [0, -6],
  [bt(10), -4.5],
  [bt(26), -3.5],
  [bt(30), -3],
  [bt(38), 0],
  [bt(54), -1.5],
  [bt(62), -1],
  [bt(70), -0.5],
  [bt(74), 1],
  [bt(90), 0.5],
  [bt(98), 1.5],
  [bt(106), 2],
  [bt(114), -4.5],
  [bt(122), -4],
];
const driveAt = (t: number) => {
  // the build is a crescendo from −3 dB to 0 dB; everything else steps at the section line
  if (t >= bt(30) && t < bt(38)) return -3 + 3 * ((t - bt(30)) / (bt(38) - bt(30)));
  let v = 0;
  for (const [t0, db] of DRIVE) {
    if (t >= t0) v = db;
  }
  return v;
};
{
  // smooth the steps over 40 ms and apply
  let cur = 0;
  const a = 1 - Math.exp(-1 / (0.04 * SR));
  for (let i = 0; i < N; i++) {
    cur += (driveAt(i / SR) - cur) * a;
    const g = Math.pow(10, cur / 20);
    ML[i] *= g;
    MR[i] *= g;
  }
}
{
  // glue: gentle RMS compressor (2:1 over −10 dB)
  let envv = 0;
  const att = Math.exp(-1 / (0.012 * SR));
  const relc = Math.exp(-1 / (0.15 * SR));
  const thr = Math.pow(10, -10 / 20);
  for (let i = 0; i < N; i++) {
    const l = ML[i] * PRE;
    const r = MR[i] * PRE;
    const x = Math.sqrt((l * l + r * r) / 2);
    envv = x > envv ? att * envv + (1 - att) * x : relc * envv + (1 - relc) * x;
    const g = envv > thr ? Math.pow(envv / thr, -0.5) : 1;
    ML[i] = l * g;
    MR[i] = r * g;
  }
}
{
  // lookahead brick-wall limiter at −1 dBFS: the gain each sample needs, ramped in *backwards*
  // (so it is already down when the peak arrives, over ≤ 3 ms), then released forwards over 70 ms
  const la = 0.003 * SR;
  const g = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(Math.abs(ML[i]), Math.abs(MR[i]));
    g[i] = a > CEIL ? CEIL / a : 1;
  }
  for (let i = N - 2; i >= 0; i--) g[i] = Math.min(g[i], g[i + 1] + 1 / la);
  const rel = 1 - Math.exp(-1 / (0.07 * SR));
  for (let i = 1; i < N; i++) g[i] = Math.min(g[i], g[i - 1] + (1 - g[i - 1]) * rel);
  for (let i = 0; i < N; i++) {
    ML[i] = clamp(ML[i] * g[i], -CEIL, CEIL);
    MR[i] = clamp(MR[i] * g[i], -CEIL, CEIL);
  }
}
// a gentle fade-in at the very start and silence at the very end
for (let i = 0; i < Math.round(0.05 * SR); i++) {
  const g = i / (0.05 * SR);
  ML[i] *= g;
  MR[i] *= g;
}
log("master");

// ============================================================================================ report + write
{
  const rows: string[] = [];
  for (const s of SECTIONS) {
    const a = Math.floor(bt(s.from) * SR);
    const z = Math.floor(bt(s.from + s.bars) * SR);
    let sum = 0;
    let pk = 0;
    for (let i = a; i < z; i++) {
      sum += ML[i] * ML[i] + MR[i] * MR[i];
      pk = Math.max(pk, Math.abs(ML[i]), Math.abs(MR[i]));
    }
    const rms = 10 * Math.log10(sum / (2 * (z - a)) + 1e-20);
    rows.push(`${s.id.padEnd(10)} ${rms.toFixed(1).padStart(6)} dB RMS   peak ${(20 * Math.log10(pk + 1e-20)).toFixed(1).padStart(6)} dB`);
  }
  log("loudness by section:\n  " + rows.join("\n  "));
}
const pcm = Buffer.alloc(N * 4);
let clipped = 0;
for (let i = 0; i < N; i++) {
  const l = Math.round(clamp(ML[i], -1, 1) * 32767);
  const r = Math.round(clamp(MR[i], -1, 1) * 32767);
  if (Math.abs(l) >= 32767 || Math.abs(r) >= 32767) clipped++;
  pcm.writeInt16LE(l, i * 4);
  pcm.writeInt16LE(r, i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);
const outDir = join(root, "out");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "host.wav"), Buffer.concat([header, pcm]));
log(`wrote out/host.wav (${((44 + pcm.length) / 1e6).toFixed(0)} MB), clipped samples: ${clipped}`);
