/**
 * The film's score — procedural and deterministic, timed to the film's own timeline.
 *
 *   npm run score      →  out/score.wav  →  public/audio/score.m4a  (AAC, via Remotion's bundled ffmpeg)
 *
 * The music is an ambient bed in D major (Dmaj9 · Bm9 · Gmaj9 · A6/9 · Em9) — slowly changing pads, a soft sub, and
 * glassy FM bells — plus *sonification of what is on screen*: a bell at the start of every caption and every chapter card,
 * ascending arpeggios for the forward pass and descending ones for the backward pass (chapter 4 and 8), the pad
 * going out of tune while the network is scrambled (chapter 6), a step of the training loop for every chip that lights
 * (chapter 9), a dissonance that widens between the training and held-out loss and resolves at the best moment
 * (chapter 10), the attention weights played as a chord (chapter 12), risers under every zoom (chapter 13), and the
 * callback to chapter 2's three-weights motif at the very end. No samples, no Math.random: same inputs → same bytes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mulberry32 } from "../src/lib/math";
import { SCRIPT } from "../src/script";
import { CHAPTERS, ChapterId, chapterById } from "../src/timeline";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SR = 48000;
const FPS = 30;
const DURATION = 600;
const N = SR * DURATION;
const TAU = Math.PI * 2;
const t0wall = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0wall) / 1000).toFixed(1)}s] ${s}`);

const rng = mulberry32(20240929);
const rnd = (a = 0, b = 1) => a + (b - a) * rng();
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const at = (id: ChapterId, s: number) => chapterById(id).from / FPS + s;

// ------------------------------------------------------------------------------------------------- buses
interface Bus {
  L: Float32Array;
  R: Float32Array;
}
const bus = (): Bus => ({ L: new Float32Array(N), R: new Float32Array(N) });
const PAD = bus();
const BASS = bus();
const BELL = bus();
const SWO = bus();
const THU = bus();

const panGains = (pan: number): [number, number] => [Math.cos(((pan + 1) * Math.PI) / 4), Math.sin(((pan + 1) * Math.PI) / 4)];

// ------------------------------------------------------------------------------------------------- harmony
type ChordName = "D" | "Bm" | "G" | "A" | "Em";
const CHORDS: Record<ChordName, { bass: number; tones: number[] }> = {
  D: { bass: 38, tones: [50, 57, 61, 64, 66] }, // Dmaj9   D2 | D3 A3 C#4 E4 F#4
  Bm: { bass: 35, tones: [54, 57, 61, 62, 66] }, // Bm9     B1 | F#3 A3 C#4 D4 F#4
  G: { bass: 31, tones: [55, 59, 62, 66, 69] }, // Gmaj9   G1 | G3 B3 D4 F#4 A4
  A: { bass: 33, tones: [52, 57, 61, 66, 71] }, // A6/9    A1 | E3 A3 C#4 F#4 B4
  Em: { bass: 40, tones: [52, 55, 59, 62, 66] }, // Em9     E2 | E3 G3 B3 D4 F#4
};
const PLAN: Record<ChapterId, { prog: ChordName[]; period: number; inten: number }> = {
  pixels: { prog: ["D", "Bm"], period: 22, inten: 0.22 },
  neuron: { prog: ["D", "G", "Bm", "A"], period: 14, inten: 0.32 },
  activation: { prog: ["G", "D", "A", "Bm"], period: 14, inten: 0.42 },
  forward: { prog: ["D", "A", "Bm", "G"], period: 15, inten: 0.55 },
  space: { prog: ["Bm", "G", "D", "A"], period: 14.5, inten: 0.5 },
  loss: { prog: ["Bm", "Em", "G", "A"], period: 12, inten: 0.4 },
  descent: { prog: ["G", "D", "A", "Bm"], period: 11.5, inten: 0.62 },
  backprop: { prog: ["Em", "G", "D", "A"], period: 13.5, inten: 0.6 },
  training: { prog: ["D", "A", "Bm", "G"], period: 11, inten: 0.7 },
  overfit: { prog: ["Bm", "Em", "Bm", "A"], period: 9.5, inten: 0.55 },
  conv: { prog: ["G", "D", "Em", "A"], period: 12.5, inten: 0.5 },
  attention: { prog: ["D", "Bm", "G", "A"], period: 14, inten: 0.5 },
  scale: { prog: ["G", "D", "A", "D"], period: 8, inten: 0.85 },
  epilogue: { prog: ["Bm", "G", "D", "D"], period: 6, inten: 0.5 },
};

interface ChordEv {
  t0: number;
  t1: number;
  name: ChordName;
  ch: ChapterId;
}
const chordEvents: ChordEv[] = [];
for (const ch of CHAPTERS) {
  const plan = PLAN[ch.id];
  const start = ch.from / FPS;
  const end = start + ch.dur / FPS;
  const n = Math.max(1, Math.round((end - start) / plan.period));
  const seg = (end - start) / n;
  for (let k = 0; k < n; k++) chordEvents.push({ t0: start + k * seg, t1: start + (k + 1) * seg, name: plan.prog[k % plan.prog.length], ch: ch.id });
}
const chordAt = (t: number) => chordEvents.find((c) => t >= c.t0 && t < c.t1) ?? chordEvents[chordEvents.length - 1];

/** Chord tone folded into [lo, hi] (MIDI). */
function tone(name: ChordName, idx: number, lo = 72, hi = 90) {
  const tones = CHORDS[name].tones;
  let m = tones[((idx % tones.length) + tones.length) % tones.length];
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}
const PENTA = [0, 2, 4, 7, 9]; // D E F# A B (relative to D)
const pentaNote = (deg: number, base = 62) => base + 12 * Math.floor(deg / 5) + PENTA[((deg % 5) + 5) % 5];

// chapter intensity curve (linear between chapter midpoints)
const intenKeys = CHAPTERS.map((c) => ({ t: (c.from + c.dur / 2) / FPS, v: PLAN[c.id].inten }));
function inten(t: number) {
  if (t <= intenKeys[0].t) return intenKeys[0].v;
  for (let i = 1; i < intenKeys.length; i++) {
    if (t <= intenKeys[i].t) {
      const a = intenKeys[i - 1];
      const b = intenKeys[i];
      const u = (t - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * smooth(u);
    }
  }
  return intenKeys[intenKeys.length - 1].v;
}
const bump = (t: number, c: number, w: number, a: number) => a * Math.exp(-(((t - c) / w) ** 2));

/** Extra brightness at the big moments (Hz added to the pad's low-pass). */
function cutoffBoost(t: number) {
  return (
    bump(t, at("pixels", 3.2), 2.2, 700) +
    bump(t, at("pixels", 31), 2.4, 1200) +
    bump(t, at("descent", 40.5), 2.2, 2200) +
    bump(t, at("scale", 12.1), 1.4, 1600) +
    bump(t, at("scale", 16.2), 1.6, 2200) +
    bump(t, at("scale", 17.8), 1.6, 1800) +
    bump(t, at("epilogue", 9.8), 1.6, 1400) +
    bump(t, at("epilogue", 14.4), 1.8, 2600) -
    bump(t, at("scale", 21), 1.4, 900)
  );
}

// ------------------------------------------------------------------------------------------------- pad + bass
const WT = 2048;
const TABLE = new Float32Array(WT);
for (let i = 0; i < WT; i++) {
  let s = 0;
  for (let h = 1; h <= 12; h++) s += (Math.sin((TAU * h * i) / WT) / h) * (h % 2 ? 1 : 0.6);
  TABLE[i] = s * 0.5;
}
const osc = (ph: number) => {
  const x = ph * WT;
  const i = Math.floor(x);
  const f = x - i;
  const a = TABLE[i & (WT - 1)];
  const b = TABLE[(i + 1) & (WT - 1)];
  return a + (b - a) * f;
};

// the pad goes out of tune while chapter 6 scrambles the network
const SCR0 = at("loss", 1.6);
const SCR1 = at("loss", 5.8);
const SCR2 = at("loss", 10.0);
const scrambleCents = (t: number) => (t < SCR0 || t > SCR2 ? 0 : t < SCR1 ? 42 * smooth((t - SCR0) / (SCR1 - SCR0)) : 42 * (1 - smooth((t - SCR1) / (SCR2 - SCR1))));

function padChord(t0: number, dur: number, tones: number[], level: number) {
  const att = Math.min(3.4, dur * 0.42);
  const rel = Math.min(4.6, dur * 0.6 + 1.5);
  const i0 = Math.floor(t0 * SR);
  const n = Math.floor((dur + rel) * SR);
  for (const m of tones) {
    const f = mtof(m);
    for (let v = 0; v < 4; v++) {
      const cents = [-9, -3, 4, 10][v] + rnd(-1.5, 1.5);
      const [gL, gR] = panGains([-0.75, -0.3, 0.3, 0.75][v]);
      let ph = rnd();
      const sgn = rng() < 0.5 ? -1 : 1;
      const lfoHz = rnd(0.08, 0.22);
      const c = 2 * Math.sin((Math.PI * lfoHz) / SR);
      const th = rnd(0, TAU);
      let s = Math.sin(th);
      let co = Math.cos(th);
      const base = (f * Math.pow(2, cents / 1200)) / SR;
      const g = level / tones.length;
      for (let k = 0; k < n; k++) {
        const i = i0 + k;
        if (i >= N) break;
        if (i < 0) continue;
        const tt = k / SR;
        let a = smooth(tt / att);
        if (tt > dur) a *= 1 - smooth((tt - dur) / rel);
        s += c * co;
        co -= c * s;
        const det = scrambleCents(t0 + tt) * sgn * 0.000578;
        ph += base * (1 + 0.0009 * s + det);
        ph -= Math.floor(ph);
        const y = osc(ph) * a * g;
        PAD.L[i] += y * gL;
        PAD.R[i] += y * gR;
      }
    }
  }
}

function bassNote(t0: number, dur: number, m: number, level: number) {
  const att = Math.min(2.2, dur * 0.4);
  const rel = 3.2;
  const f = mtof(m);
  const i0 = Math.floor(t0 * SR);
  const n = Math.floor((dur + rel) * SR);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const i = i0 + k;
    if (i >= N) break;
    if (i < 0) continue;
    const tt = k / SR;
    let a = smooth(tt / att);
    if (tt > dur) a *= 1 - smooth((tt - dur) / rel);
    ph += (TAU * f) / SR;
    const y = (Math.sin(ph) + 0.28 * Math.sin(2 * ph)) * a * level;
    BASS.L[i] += y;
    BASS.R[i] += y;
  }
}

// ------------------------------------------------------------------------------------------------- one-shot voices
function bell(t: number, midi: number, vel = 0.5, o: { pan?: number; decay?: number; bright?: number; mallet?: boolean } = {}) {
  if (t < 0 || t >= DURATION) return;
  const f = mtof(midi);
  const decay = o.decay ?? 1.6;
  const n = Math.min(N - Math.floor(t * SR), Math.floor(decay * 4.6 * SR));
  const i0 = Math.floor(t * SR);
  const [gL, gR] = panGains(o.pan ?? rnd(-0.55, 0.55));
  const bright = o.bright ?? 1;
  const dec = Math.exp(-1 / (decay * SR));
  const decM = Math.exp(-1 / (0.32 * SR));
  const dec2 = Math.exp(-1 / (decay * 0.45 * SR));
  let env = 1;
  let envM = 1;
  let env2 = 1;
  const wc = (TAU * f) / SR;
  const wm = wc * 3.5;
  const mallet = !!o.mallet;
  for (let k = 0; k < n; k++) {
    const i = i0 + k;
    const att = Math.min(1, k / (0.003 * SR));
    let y: number;
    if (mallet) {
      y = Math.sin(wc * k) + 0.4 * Math.sin(wc * 3.99 * k) * envM;
    } else {
      const idx = 2.1 * bright * envM;
      y = Math.sin(wc * k + idx * Math.sin(wm * k)) + 0.32 * Math.sin(2 * wc * k) * env2;
    }
    const v = y * env * att * vel * 0.2;
    BELL.L[i] += v * gL;
    BELL.R[i] += v * gR;
    env *= dec;
    envM *= decM;
    env2 *= dec2;
  }
}

/** Filtered-noise sweep (state-variable band-pass); f0 → f1 exponentially, raised-cosine envelope. */
function swoosh(t0: number, t1: number, f0: number, f1: number, gain = 0.5, q = 0.22) {
  if (t1 <= 0 || t0 >= DURATION) return;
  const i0 = Math.floor(t0 * SR);
  const n = Math.floor((t1 - t0) * SR);
  let low = 0;
  let band = 0;
  let lowB = 0;
  let bandB = 0;
  const panPhase = rnd(0, TAU);
  for (let k = 0; k < n; k++) {
    const i = i0 + k;
    if (i < 0) continue;
    if (i >= N) break;
    const u = k / n;
    const fc = f0 * Math.pow(f1 / f0, u);
    const F = 2 * Math.sin((Math.PI * Math.min(fc, SR * 0.2)) / SR);
    const env = Math.sin(Math.PI * u) ** 2;
    const xL = rnd(-1, 1);
    const xR = rnd(-1, 1);
    low += F * band;
    const highL = xL - low - q * band;
    band += F * highL;
    lowB += F * bandB;
    const highR = xR - lowB - q * bandB;
    bandB += F * highR;
    const pan = 0.6 * Math.sin(panPhase + u * 3);
    const [gL, gR] = panGains(pan);
    SWO.L[i] += band * env * gain * q * 1.6 * (0.55 + gL * 0.6);
    SWO.R[i] += bandB * env * gain * q * 1.6 * (0.55 + gR * 0.6);
  }
}

function thump(t: number, vel = 0.6, f0 = 120, f1 = 44, len = 0.7) {
  if (t < 0 || t >= DURATION) return;
  const i0 = Math.floor(t * SR);
  const n = Math.floor(len * SR);
  let ph = 0;
  for (let k = 0; k < n && i0 + k < N; k++) {
    const tt = k / SR;
    const f = f1 + (f0 - f1) * Math.exp(-tt / 0.045);
    ph += (TAU * f) / SR;
    const env = Math.exp(-tt / (len * 0.28)) * Math.min(1, tt / 0.002);
    const y = (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * env * vel;
    THU.L[i0 + k] += y;
    THU.R[i0 + k] += y;
  }
}

/** A sine that glides through midi(u), u = 0…1, with a smooth envelope — for risers, the knob, the scan. */
function glide(t0: number, t1: number, midi: (u: number) => number, gain = 0.3, o: { att?: number; rel?: number; tri?: boolean; pan?: number; bus?: Bus } = {}) {
  const i0 = Math.floor(t0 * SR);
  const n = Math.floor((t1 - t0) * SR);
  const att = o.att ?? 0.25;
  const rel = o.rel ?? 0.35;
  const [gL, gR] = panGains(o.pan ?? 0);
  const B = o.bus ?? BELL;
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const i = i0 + k;
    if (i < 0) continue;
    if (i >= N) break;
    const u = k / n;
    const tt = k / SR;
    ph += (TAU * mtof(midi(u))) / SR;
    const a = smooth(tt / att) * (1 - smooth((tt - (t1 - t0 - rel)) / rel));
    const y = (o.tri ? Math.sin(ph) + 0.2 * Math.sin(3 * ph) : Math.sin(ph) + 0.08 * Math.sin(2 * ph)) * a * gain;
    B.L[i] += y * gL;
    B.R[i] += y * gR;
  }
}

/** Fixed-pitch soft sine tone with slow attack/release — sustained "pads" for single events. */
const holdTone = (t0: number, dur: number, midi: number, gain = 0.2, att = 0.4, rel = 1.2, pan = 0) => glide(t0, t0 + dur, () => midi, gain, { att, rel, pan });

const arp = (t: number, notes: number[], dt: number, vel = 0.4, o: { decay?: number; mallet?: boolean; pan?: number } = {}) => notes.forEach((m, k) => bell(t + k * dt, m, vel * (0.85 + 0.15 * (k / Math.max(1, notes.length - 1))), o));

// ------------------------------------------------------------------------------------------------- score
log("scheduling harmony");
for (const ev of chordEvents) {
  const c = CHORDS[ev.name];
  const level = 0.5 + 0.5 * inten((ev.t0 + ev.t1) / 2);
  padChord(ev.t0 - (ev.t0 > 0 ? 1.2 : 0), ev.t1 - ev.t0 + (ev.t0 > 0 ? 1.2 : 0), c.tones, level);
  const bl = ev.ch === "pixels" ? 0.25 : ev.ch === "epilogue" ? 0.6 : 0.6 + 0.4 * inten(ev.t0);
  bassNote(ev.t0 - (ev.t0 > 0 ? 0.6 : 0), ev.t1 - ev.t0 + (ev.t0 > 0 ? 0.6 : 0), c.bass, bl);
}
log("pad + bass done");

// ---- chapter cards and captions
for (const ch of CHAPTERS) {
  const t = ch.from / FPS + (ch.num === 1 ? 0.9 : 0.55);
  bell(t, 74, 0.55, { decay: 2.8, pan: -0.15 });
  bell(t + 0.03, 86, 0.22, { decay: 3.2, pan: 0.2 });
}
{
  let k = 0;
  for (const id of Object.keys(SCRIPT) as ChapterId[]) {
    for (const c of SCRIPT[id]) {
      const t = at(id, c.at);
      const name = chordAt(t).name;
      bell(t, tone(name, k * 2 + 1), 0.24, { decay: 1.7 });
      k++;
    }
  }
}

// ================================================================= 01 像素
swoosh(at("pixels", 0.9), at("pixels", 5.6), 250, 4200, 0.55);
for (let k = 0; k < 90; k++) bell(at("pixels", 8.9) + k * 0.038 + rnd(0, 0.02), pentaNote(Math.floor(rnd(5, 14))), 0.12, { decay: 0.3, mallet: true });
swoosh(at("pixels", 16.4), at("pixels", 24.8), 400, 2600, 0.35);
for (let k = 0; k < 18; k++) bell(at("pixels", 25.4) + k * 0.09, pentaNote(8 + (k % 5) + Math.floor(k / 6)), 0.1, { decay: 0.5, mallet: true });
arp(at("pixels", 27.0), [74, 78, 81, 85], 0.07, 0.45, { decay: 3 });
bell(at("pixels", 29.4), 62, 0.6, { decay: 4.5, pan: -0.1 });
bell(at("pixels", 29.42), 74, 0.5, { decay: 4.5, pan: 0.1 });
swoosh(at("pixels", 28.6), at("pixels", 31.6), 300, 3000, 0.35);

// ================================================================= 02 神经元
[2.0, 3.3, 4.6, 5.9].forEach((s, k) => bell(at("neuron", s), [74, 78, 81, 78][k], 0.18, { decay: 1.4 }));
// the three-weights motif: positive, negative, positive (chapter 14 quotes it)
const W_MOTIF = [78, 62, 81];
[13.6, 15.1, 16.6].forEach((s, k) => bell(at("neuron", s), W_MOTIF[k], 0.42, { decay: 2.4, pan: [-0.3, 0, 0.3][k] }));
[23.2, 25.3, 27.4].forEach((s, k) => bell(at("neuron", s), [74, 76, 78][k], 0.26, { decay: 1.3, mallet: true }));
bell(at("neuron", 29.0), 57, 0.5, { decay: 2.2 });
arp(at("neuron", 32.2), [62, 66, 69], 0.08, 0.3, { decay: 2.2 });
swoosh(at("neuron", 34.0), at("neuron", 36.2), 500, 2600, 0.25);
arp(at("neuron", 37.4), [81, 86, 90], 0.09, 0.45, { decay: 3 });
{
  // the knob: w1 turns 1.2 → −2 → 2.2 → 1.2, and so does a pitch
  const keys: [number, number][] = [[44.6, 1.2], [46.2, -2.0], [48.6, 2.2], [50.6, 1.2]];
  const w1 = (s: number) => {
    for (let i = 1; i < keys.length; i++) if (s <= keys[i][0]) return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * smooth((s - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
    return keys[keys.length - 1][1];
  };
  glide(at("neuron", 44.2), at("neuron", 51.6), (u) => 67 + 3.2 * w1(44.2 + u * 7.4), 0.16, { att: 0.5, rel: 0.9, tri: true, pan: 0.2 });
}

// ================================================================= 03 激活函数
for (let k = 0; k < 16; k++) bell(at("activation", 25.0 + k * 0.62), pentaNote(k + 2, 62), 0.3 + 0.01 * k, { decay: 1.5 });
arp(at("activation", 35.2), [74, 78, 81, 86], 0.08, 0.4, { decay: 3.4 });

// ================================================================= 04 前向传播
bell(at("forward", 2.0), 69, 0.3, { decay: 2 });
swoosh(at("forward", 8.0), at("forward", 11.4), 400, 2200, 0.3);
swoosh(at("forward", 15.6), at("forward", 18.4), 400, 2200, 0.3);
for (let k = 0; k < 22; k++) bell(at("forward", 17.2 + k * 0.16), pentaNote(2 + Math.floor(k * 0.62), 62), 0.16 + 0.006 * k, { decay: 0.7, mallet: true });
{
  const t = at("forward", 25.4);
  arp(t + 0.7, [62, 66, 69], 0.1, 0.32, { decay: 1.6 });
  arp(t + 1.9, [66, 69, 73], 0.1, 0.36, { decay: 1.6 });
  arp(t + 3.2, [69, 73, 76], 0.1, 0.4, { decay: 1.8 });
  bell(t + 4.1, 86, 0.55, { decay: 3.2 });
  swoosh(t, t + 4.3, 300, 3500, 0.3);
}
for (let k = 0; k < 10; k++) bell(at("forward", 33.2 + k * 0.16), pentaNote(9 + (k % 5)), 0.14, { decay: 0.6, mallet: true });
for (let k = 0; k < 4; k++) bell(at("forward", 52.4 + k * 1.2), [74, 78, 81, 86][k], 0.22, { decay: 1.6 });

// ================================================================= 05 折叠空间
for (let k = 0; k < 5; k++) bell(at("space", 1.2 + k * 0.12), pentaNote(7 + k), 0.16, { decay: 0.9, mallet: true });
swoosh(at("space", 15.4), at("space", 18.4), 300, 2500, 0.3);
swoosh(at("space", 18.8), at("space", 24.0), 250, 4200, 0.45);
glide(at("space", 18.8), at("space", 24.4), (u) => 50 + 24 * u * u, 0.1, { att: 1, rel: 0.6 });
thump(at("space", 24.2), 0.5);
bell(at("space", 24.2), 81, 0.5, { decay: 3 });
[41.2, 45.0, 49.0].forEach((s, k) => {
  swoosh(at("space", s - 0.2), at("space", s + 3.0), 400, 1800 + 800 * k, 0.28);
  arp(at("space", s + 1.6), [[62, 69], [66, 73], [69, 76]][k], 0.06, 0.34, { decay: 2 });
});
thump(at("space", 52.4), 0.45);
bell(at("space", 52.4), 86, 0.5, { decay: 3.5 });
swoosh(at("space", 54.4), at("space", 57.6), 2600, 350, 0.3);

// ================================================================= 06 损失
// (the scramble itself is the pad going out of tune)
{
  bell(at("loss", 9.2), 81, 0.45, { decay: 2.4 });
  bell(at("loss", 11.0), 76, 0.4, { decay: 1.8 });
  thump(at("loss", 12.8), 0.6);
  bell(at("loss", 12.8), 74, 0.35, { decay: 1.6, pan: -0.2 });
  bell(at("loss", 12.8), 75, 0.35, { decay: 1.6, pan: 0.2 });
  for (let k = 0; k < 14; k++) bell(at("loss", 15.6 + k * 0.05 + rnd(0, 0.02)), pentaNote(6 + Math.floor(rnd(0, 6))), 0.13, { decay: 0.5, mallet: true });
  glide(at("loss", 24.4), at("loss", 28.6), (u) => 50 + 24 * u, 0.09, { att: 0.6, rel: 0.6, tri: true });
  swoosh(at("loss", 28.6), at("loss", 31.4), 300, 2800, 0.32);
  bell(at("loss", 30.8), 86, 0.5, { decay: 3.4 });
}

// ================================================================= 07 梯度下降
{
  glide(at("descent", 1.6), at("descent", 2.9), (u) => 69 + 5 * u, 0.09, { att: 0.3, rel: 0.5 });
  glide(at("descent", 3.5), at("descent", 5.2), (u) => 74 - 7 * u, 0.09, { att: 0.3, rel: 0.5 });
  thump(at("descent", 6.95), 0.4, 100, 50, 0.5);
  bell(at("descent", 7.9), 74, 0.35, { decay: 1.8 });
  [9.6, 10.7, 11.6, 12.3, 12.9].forEach((s, k) => bell(at("descent", s), [81, 78, 74, 69, 66][k], 0.34, { decay: 1.8 }));
  for (let k = 0; k < 60; k++) {
    const u = k / 60;
    bell(at("descent", 13.5 + 4.2 * Math.pow(u, 0.75)), pentaNote(18 - Math.floor(k * 0.13) - Math.floor(rnd(0, 3)), 50), 0.12, { decay: 0.7, mallet: true });
  }
  swoosh(at("descent", 15.2), at("descent", 18.2), 500, 2000, 0.22);
  // three learning rates
  glide(at("descent", 18.9), at("descent", 20.9), (u) => 50 + 2 * u, 0.12, { att: 0.5, rel: 0.6 });
  arp(at("descent", 21.0), [62, 66, 69, 74], 0.4, 0.34, { decay: 1.8 });
  for (let k = 0; k < 9; k++) bell(at("descent", 23.1 + k * 0.21), k % 2 ? 78 : 71, 0.34 * Math.exp(-k * 0.18), { decay: 0.9 });
  glide(at("descent", 25.3), at("descent", 27.2), (u) => 69 + 24 * u * u, 0.13, { att: 0.2, rel: 0.2, tri: true });
  swoosh(at("descent", 25.6), at("descent", 27.4), 400, 5000, 0.5, 0.4);
  thump(at("descent", 27.2), 0.5, 90, 38, 0.9);
  // the race
  for (let k = 0; k < 9; k++) bell(at("descent", 29.9 + k * 0.68), pentaNote(2 + (k % 3), 50), 0.26, { decay: 1.6 });
  for (let k = 0; k < 16; k++) bell(at("descent", 29.9 + 0.2 + k * 0.16 * (1 + k * 0.05)), pentaNote(12 - Math.floor(k / 2), 60), 0.2, { decay: 1.1, mallet: true });
  for (let k = 0; k < 12; k++) bell(at("descent", 29.9 + 0.1 + k * 0.42), pentaNote(9 + (k % 4), 62), 0.18, { decay: 1.0, mallet: true });
  arp(at("descent", 35.9), [62, 66, 69, 73, 76], 0.06, 0.4, { decay: 3.4 });
  // 2 → 13 002 directions
  holdTone(at("descent", 37.3), 1.6, 62, 0.12);
  holdTone(at("descent", 37.5), 1.5, 69, 0.1);
  swoosh(at("descent", 38.0), at("descent", 41.7), 200, 7500, 0.6, 0.3);
  glide(at("descent", 38.2), at("descent", 41.8), (u) => 50 + 36 * u * u, 0.1, { att: 0.5, rel: 0.25 });
  for (let k = 0; k < 70; k++) bell(at("descent", 38.4 + 3.2 * Math.pow(k / 70, 1.6)), pentaNote(10 + Math.floor(rnd(0, 10))), 0.1, { decay: 0.5, mallet: true });
  thump(at("descent", 41.7), 0.6, 110, 40, 1.2);
  arp(at("descent", 41.7), [62, 69, 74, 78, 81, 86], 0.03, 0.4, { decay: 4 });
  swoosh(at("descent", 43.2), at("descent", 44.7), 6000, 250, 0.4);
  glide(at("descent", 44.4), at("descent", 45.6), (u) => 69 - 7 * smooth(u), 0.14, { att: 0.1, rel: 0.4, pan: 0 });
  thump(at("descent", 45.5), 0.28, 90, 50, 0.6);
}

// ================================================================= 08 反向传播
{
  const bt = (s: number) => at("backprop", s);
  [1.0, 1.6, 2.4, 2.7, 3.3, 4.0].forEach((s, k) => bell(bt(s), [74, 76, 78, 71, 81, 86][k], 0.22, { decay: 1.2, mallet: true }));
  glide(bt(3.8), bt(5.0), (u) => 62 + 7 * smooth(u), 0.1, { att: 0.3, rel: 0.5 });
  arp(bt(9.2), [62, 69, 74], 0.05, 0.3, { decay: 1.8 });
  [10.9, 13.1, 15.0, 16.8].forEach((s, k) => bell(bt(s), [74, 78, 81, 86][k], 0.42, { decay: 2 }));
  swoosh(bt(9.8), bt(16.8), 400, 3000, 0.25);
  // the backward pass: the same notes, falling — darker
  [21.9, 24.0, 25.8, 27.8].forEach((s, k) => bell(bt(s), [85, 81, 78, 74][k] - 12, 0.5, { decay: 2.2, bright: 0.6 }));
  swoosh(bt(20.9), bt(27.8), 3000, 350, 0.28);
  thump(bt(20.3), 0.4, 100, 46, 0.7);
  // the chain rule replayed
  const cr = 32.4;
  [1.6, 3.0, 4.2, 5.6].forEach((s, k) => bell(bt(cr + s), [85, 81, 78, 74][k] - 12, 0.4, { decay: 1.8, bright: 0.6 }));
  arp(bt(cr + 6.2), [62, 66, 69, 74], 0.05, 0.4, { decay: 3 });
  // two paths, then a sum
  const e = 41.6;
  bell(bt(e + 2.4), 74, 0.3);
  bell(bt(e + 2.4), 78, 0.3);
  bell(bt(e + 3.7), 81, 0.35);
  thump(bt(e + 4.0), 0.35, 100, 46, 0.6);
  bell(bt(e + 5.3), 69, 0.4, { decay: 1.8, bright: 0.6 });
  bell(bt(e + 5.3), 64, 0.4, { decay: 1.8, bright: 0.6 });
  bell(bt(e + 7.0), 62, 0.4, { decay: 1.8, bright: 0.6 });
  bell(bt(e + 7.0), 66, 0.4, { decay: 1.8, bright: 0.6 });
  arp(bt(e + 7.3), [62, 69, 74, 78], 0.04, 0.42, { decay: 3.2 });
  // 13 002 gradients: the wave runs back through the digit network
  thump(bt(53.6), 0.5, 110, 42, 0.9);
  swoosh(bt(53.7), bt(58.8), 3500, 260, 0.4);
  for (let k = 0; k < 24; k++) bell(bt(54.2 + k * 0.2), pentaNote(20 - k, 50), 0.22, { decay: 1.0, bright: 0.7, mallet: true });
  [55.5, 56.9, 58.5].forEach((s, k) => bell(bt(s), [74, 71, 66][k], 0.3, { decay: 2 }));
  glide(bt(59.2), bt(60.9), (u) => 57 + 12 * u, 0.1, { att: 0.3, rel: 0.5 });
  arp(bt(60.9), [62, 69, 74, 78, 81], 0.05, 0.4, { decay: 3.2 });
  arp(bt(63.6), [50, 57, 62, 66], 0.08, 0.4, { decay: 4.5 });
}

// ================================================================= 09 训练
{
  const tt = (s: number) => at("training", s);
  swoosh(tt(1.0), tt(3.2), 400, 1800, 0.2);
  [1.5, 2.1, 2.7, 3.3].forEach((s, k) => bell(tt(s), [74, 78, 81, 85][k], 0.3, { decay: 1.6 }));
  bell(tt(1.2), 86, 0.2, { decay: 1.6 });
  for (let k = 0; k < 4; k++) bell(tt(3.8 + k * 0.25), pentaNote(10 + k), 0.15, { decay: 0.5, mallet: true });
  for (let k = 0; k < 5; k++) bell(tt(5.0 + k * 0.52), [74, 78, 81, 83, 86][k], 0.34, { decay: 1.3 });
  swoosh(tt(7.0), tt(8.4), 800, 2500, 0.2);
  // the loop: one note per chip that lights (1.7 chips per second, from 9.0 s)
  const LOOP = [62, 66, 69, 71, 74];
  for (let n = Math.ceil(9.0 * 1.7); n / 1.7 < 33.9; n++) {
    const s = n / 1.7;
    const p = (s - 9.0) / 24.9;
    bell(tt(s), LOOP[n % 5] + (n % 15 >= 10 ? 12 : 0), 0.14 + 0.16 * p, { decay: 0.9, mallet: true, pan: -0.3 + 0.15 * (n % 5) });
  }
  for (let k = 0; k < 5; k++) bell(tt(36.2 + k * 1.15), LOOP[k] + 12, 0.2, { decay: 1.0, mallet: true });
  arp(tt(41.6), [62, 66, 69, 74], 0.08, 0.32, { decay: 3.4 });
}

// ================================================================= 10 过拟合
{
  const ot = (s: number) => at("overfit", s);
  holdTone(ot(1.5), 9, 50, 0.1, 2, 2);
  holdTone(ot(1.5), 9, 57, 0.08, 2, 2);
  // the gap widens: E5 against F5, beating faster as they drift, until the best moment — then F resolves up to F#
  glide(ot(9.2), ot(13.7), () => 76, 0.0, { att: 0.1, rel: 0.1 });
  glide(ot(9.2), ot(13.75), () => 76, 0.11, { att: 2.2, rel: 0.1, tri: true, pan: -0.25 });
  glide(ot(9.2), ot(13.75), (u) => 76.6 + 0.4 * u, 0.09, { att: 2.6, rel: 0.1, tri: true, pan: 0.25 });
  glide(ot(13.6), ot(14.5), (u) => 77 + smooth(u), 0.12, { att: 0.05, rel: 0.4, tri: true, pan: 0.25 });
  bell(ot(13.6), 78, 0.5, { decay: 2.6 });
  arp(ot(13.6), [66, 73, 81], 0.05, 0.4, { decay: 3 });
  thump(ot(18.4), 0.5, 100, 40, 0.8);
  [20.6, 22.8, 24.4].forEach((s, k) => bell(ot(s), [76, 81, 86][k], 0.4, { decay: 2.2 }));
  swoosh(ot(23.4), ot(25.4), 2600, 400, 0.22);
  arp(ot(26.5), [69, 73, 76], 0.06, 0.28, { decay: 2.6 });
}

// ================================================================= 11 卷积
{
  const ct = (s: number) => at("conv", s);
  swoosh(ct(0.6), ct(3.6), 300, 2600, 0.25);
  for (let k = 0; k < 48; k++) bell(ct(4.0 + k * 0.034), pentaNote(9 + Math.floor(rnd(0, 6))), 0.09, { decay: 0.3, mallet: true });
  for (let k = 0; k < 9; k++) bell(ct(5.4 + k * 0.15), pentaNote(12 - k), 0.2, { decay: 0.8, mallet: true });
  bell(ct(6.8), 62, 0.35, { decay: 2 });
  bell(ct(6.8), 63, 0.3, { decay: 2 });
  arp(ct(9.8), [62, 69, 74], 0.06, 0.28, { decay: 2 });
  // the scan: ticks, accelerating
  {
    let s = 13.8;
    while (s < 20.2) {
      const u = (s - 13.8) / 6.4;
      bell(ct(s), pentaNote(5 + Math.floor(rnd(0, 8))), 0.11 + 0.06 * u, { decay: 0.35, mallet: true });
      s += 0.5 / (1 + 12 * u * u);
    }
  }
  [20.6, 21.4, 22.0, 22.6].forEach((s, k) => arp(ct(s), [[62, 66, 69], [64, 67, 71], [66, 69, 73], [69, 73, 76]][k], 0.05, 0.26, { decay: 1.8 }));
  bell(ct(24.6 + 0.5), 86, 0.3, { decay: 1.6 });
  thump(ct(24.6 + 1.5), 0.5, 90, 36, 1.2);
  swoosh(ct(30.2), ct(34.8), 300, 3000, 0.3);
  for (let k = 0; k < 20; k++) bell(ct(30.4 + k * 0.22), pentaNote(4 + Math.floor(k * 0.5)), 0.13, { decay: 0.6, mallet: true });
  swoosh(ct(36.4), ct(38.0), 2500, 500, 0.22);
  arp(ct(34.8), [62, 66, 69, 74, 78], 0.06, 0.32, { decay: 3 });
}

// ================================================================= 12 注意力
{
  const at12 = (s: number) => at("attention", s);
  swoosh(at12(1.0), at12(2.6), 1800, 400, 0.18);
  for (let k = 0; k < 8; k++) bell(at12(2.8 + k * 0.16), pentaNote(5 + k), 0.2, { decay: 1.0, mallet: true });
  holdTone(at12(9.2), 5, 69, 0.11, 0.5, 1.5);
  bell(at12(9.2), 81, 0.3, { decay: 2.4 });
  for (let k = 0; k < 8; k++) bell(at12(12.4 + k * 0.1), pentaNote(4 + k), 0.09, { decay: 0.4, mallet: true });
  // the attention weights played as a chord: 猫 60 % · 它 19 % · 在 11 % · 垫子 8 % …
  const W = [0.6, 0.01, 0.11, 0.03, 0.05, 0.01, 0.19];
  const TOKP = [74, 76, 78, 81, 83, 85, 86];
  W.forEach((w, j) => {
    if (w > 0.02) bell(at12(14.7), TOKP[j], 0.14 + 1.5 * w, { decay: 2.4 + 2 * w, pan: -0.5 + 0.16 * j });
  });
  swoosh(at12(14.6), at12(16.4), 500, 3000, 0.22);
  swoosh(at12(19.6), at12(22.6), 3000, 500, 0.25);
  glide(at12(19.6), at12(22.6), (u) => 81 - 7 * smooth(u), 0.09, { att: 0.4, rel: 0.6 });
  bell(at12(22.6), 74, 0.5, { decay: 3 });
  for (let k = 0; k < 8; k++) bell(at12(23.7 + k * 0.3), pentaNote(6 + k), 0.22, { decay: 1.0, mallet: true });
  for (let r = 0; r < 4; r++) {
    const s = 28.8 + r * 2.7;
    bell(at12(s + 0.2), pentaNote(9 - r, 62), 0.14, { decay: 0.7, mallet: true });
    bell(at12(s + 1.7), [74, 78, 81, 86][r], 0.5, { decay: 2.4 });
  }
  swoosh(at12(39.6), at12(41.8), 3000, 200, 0.3);
  thump(at12(41.6), 0.45, 90, 38, 1.4);
  holdTone(at12(41.6), 3, 38, 0.2, 0.4, 1.5);
}

// ================================================================= 13 规模
{
  const st = (s: number) => at("scale", s);
  swoosh(st(1.0), st(3.0), 300, 3000, 0.25);
  swoosh(st(7.0), st(9.6), 300, 2600, 0.22);
  glide(st(7.0), st(9.4), (u) => 50 + 14 * smooth(u), 0.08, { att: 0.6, rel: 0.6 });
  swoosh(st(10.4), st(13.8), 200, 6500, 0.55, 0.3);
  glide(st(10.8), st(13.4), (u) => 50 + 24 * u * u, 0.12, { att: 0.6, rel: 0.2 });
  thump(st(13.4), 0.5, 100, 40, 1.0);
  arp(st(13.4), [62, 69, 74, 78], 0.04, 0.4, { decay: 3.4 });
  swoosh(st(14.4), st(18.0), 200, 8500, 0.7, 0.3);
  glide(st(14.8), st(17.6), (u) => 50 + 36 * u * u, 0.14, { att: 0.6, rel: 0.2 });
  thump(st(17.6), 0.8, 90, 30, 1.6);
  arp(st(17.6), [50, 57, 62, 66, 69, 74, 78, 81, 86], 0.035, 0.46, { decay: 4.4 });
  swoosh(st(19.2), st(22.0), 7000, 150, 0.5, 0.3);
  glide(st(19.4), st(21.9), (u) => 86 - 32 * smooth(u), 0.08, { att: 0.2, rel: 0.5 });
  holdTone(st(21.4), 2.4, 57, 0.16, 0.3, 1.2);
}

// ================================================================= 14 尾声
{
  const et = (s: number) => at("epilogue", s);
  [0.7, 1.0, 1.3].forEach((s, k) => bell(et(s), W_MOTIF[k], 0.4, { decay: 2.4, pan: [-0.3, 0, 0.3][k] }));
  for (let k = 0; k < 5; k++) bell(et(2.2 + k * 0.9), 74 + (k % 2) * 4, 0.16, { decay: 1.2 });
  bell(et(4.1), 86, 0.5, { decay: 3 });
  swoosh(et(6.6), et(8.8), 400, 2400, 0.22);
  for (let w = 0; w < 4; w++) swoosh(et(7.4 + w * 2.38), et(7.4 + w * 2.38 + 2.2), 500, 2000, 0.13);
  arp(et(9.6), [74, 78], 0.1, 0.4, { decay: 2.4 });
  bell(et(10.4), 81, 0.4, { decay: 2.4 });
  bell(et(11.2), 86, 0.42, { decay: 2.8 });
  // the title
  swoosh(et(12.6), et(14.2), 300, 4000, 0.3);
  arp(et(13.6), [50, 57, 61, 64, 66, 74], 0.05, 0.55, { decay: 6, pan: 0 });
  bell(et(13.65), 86, 0.5, { decay: 6 });
  bell(et(13.7), 90, 0.3, { decay: 6 });
  thump(et(13.6), 0.4, 80, 36, 1.4);
}
log(`events scheduled (rng calls so far are deterministic)`);

// ------------------------------------------------------------------------------------------------- pad low-pass
log("filtering the pad");
{
  let y1L = 0;
  let y2L = 0;
  let y1R = 0;
  let y2R = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const fc = 380 + 2900 * Math.pow(inten(t), 1.25) + cutoffBoost(t);
    const w = (TAU * Math.max(120, fc)) / SR;
    const a = w / (1 + w);
    y1L += a * (PAD.L[i] - y1L);
    y2L += a * (y1L - y2L);
    y1R += a * (PAD.R[i] - y1R);
    y2R += a * (y1R - y2R);
    PAD.L[i] = y2L;
    PAD.R[i] = y2R;
  }
}

// ------------------------------------------------------------------------------------------------- mix
const rms = (b: Float32Array) => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < b.length; i += 7) {
    const v = b[i];
    if (Math.abs(v) > 1e-5) {
      s += v * v;
      n++;
    }
  }
  return Math.sqrt(s / Math.max(1, n));
};
const peak = (b: Float32Array) => {
  let m = 0;
  for (let i = 0; i < b.length; i += 3) m = Math.max(m, Math.abs(b[i]));
  return m;
};
const scaleBus = (B: Bus, g: number) => {
  for (let i = 0; i < N; i++) {
    B.L[i] *= g;
    B.R[i] *= g;
  }
};
log(`bus levels before mixing — pad rms ${rms(PAD.L).toFixed(4)}, bass rms ${rms(BASS.L).toFixed(4)}, bell peak ${peak(BELL.L).toFixed(3)}, swoosh rms ${rms(SWO.L).toFixed(4)}, thump peak ${peak(THU.L).toFixed(3)}`);
scaleBus(PAD, 0.115 / Math.max(1e-9, rms(PAD.L)));
scaleBus(BASS, 0.05 / Math.max(1e-9, rms(BASS.L)));
scaleBus(BELL, 0.34 / Math.max(1e-9, peak(BELL.L)));
scaleBus(SWO, 0.045 / Math.max(1e-9, rms(SWO.L)));
scaleBus(THU, 0.42 / Math.max(1e-9, peak(THU.L)));

// ------------------------------------------------------------------------------------------------- reverb (Freeverb-style, stereo)
log("reverb");
const OL = new Float32Array(N);
const OR = new Float32Array(N);
{
  const sc = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((x) => Math.round(x * sc));
  const aps = [556, 441, 341, 225].map((x) => Math.round(x * sc));
  const spread = Math.round(23 * sc);
  const fb = 0.87;
  const damp = 0.28;
  const run = (inp: Float32Array, out: Float32Array, off: number) => {
    const bufs = combs.map((c) => new Float32Array(c + off));
    const pos = combs.map(() => 0);
    const lp = combs.map(() => 0);
    const apb = aps.map((a) => new Float32Array(a + off));
    const app = aps.map(() => 0);
    for (let i = 0; i < N; i++) {
      const x = inp[i] * 0.03;
      let s = 0;
      for (let c = 0; c < bufs.length; c++) {
        const b = bufs[c];
        const y = b[pos[c]];
        lp[c] = y * (1 - damp) + lp[c] * damp;
        b[pos[c]] = x + lp[c] * fb;
        if (++pos[c] >= b.length) pos[c] = 0;
        s += y;
      }
      for (let a = 0; a < apb.length; a++) {
        const b = apb[a];
        const bo = b[app[a]];
        const y = -s + bo;
        b[app[a]] = s + bo * 0.5;
        if (++app[a] >= b.length) app[a] = 0;
        s = y;
      }
      out[i] = s;
    }
  };
  // send bus = weighted mix of the buses (left and right separately, so the tail keeps the stereo picture)
  const sendL = new Float32Array(N);
  const sendR = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    sendL[i] = PAD.L[i] * 0.5 + BELL.L[i] * 1.0 + SWO.L[i] * 0.9 + THU.L[i] * 0.25;
    sendR[i] = PAD.R[i] * 0.5 + BELL.R[i] * 1.0 + SWO.R[i] * 0.9 + THU.R[i] * 0.25;
  }
  run(sendL, OL, 0);
  run(sendR, OR, spread);
}

// ------------------------------------------------------------------------------------------------- master
log(`reverb return rms ${rms(OL).toFixed(4)} vs pad rms ${rms(PAD.L).toFixed(4)}`);
log("master");
const outL = new Float32Array(N);
const outR = new Float32Array(N);
{
  let hxL = 0;
  let hyL = 0;
  let hxR = 0;
  let hyR = 0;
  const hp = 1 - (TAU * 28) / SR;
  for (let i = 0; i < N; i++) {
    const l = PAD.L[i] + BASS.L[i] + BELL.L[i] + SWO.L[i] + THU.L[i] + OL[i] * 0.55;
    const r = PAD.R[i] + BASS.R[i] + BELL.R[i] + SWO.R[i] + THU.R[i] + OR[i] * 0.55;
    hyL = hp * (hyL + l - hxL);
    hxL = l;
    hyR = hp * (hyR + r - hxR);
    hxR = r;
    outL[i] = hyL;
    outR[i] = hyR;
  }
}
// fades: in 2.5 s, and everything gone by the time the film fades to black
{
  const fadeIn = 2.5 * SR;
  const fadeOutFrom = 596.0 * SR;
  const fadeOutTo = 599.85 * SR;
  for (let i = 0; i < N; i++) {
    let g = 1;
    if (i < fadeIn) g *= smooth(i / fadeIn);
    if (i > fadeOutFrom) g *= 1 - smooth((i - fadeOutFrom) / (fadeOutTo - fadeOutFrom));
    outL[i] *= g;
    outR[i] *= g;
  }
}
// soft limiter (a gentle tanh, driven a little to lift the level of the pad), then normalise the peak to −1.9 dBFS (headroom for the AAC encoder)
let pk = 0;
for (let i = 0; i < N; i += 2) pk = Math.max(pk, Math.abs(outL[i]), Math.abs(outR[i]));
const DRIVE = 1.35;
const norm = (0.84 / Math.max(pk, 1e-9)) * DRIVE;
log(`pre-normalisation peak ${pk.toFixed(3)} → gain ${norm.toFixed(2)}`);
const sat = (x: number) => Math.tanh(x * norm);
let pk2 = 0;
for (let i = 0; i < N; i += 2) pk2 = Math.max(pk2, Math.abs(sat(outL[i])), Math.abs(sat(outR[i])));
const fin = 0.8 / Math.max(pk2, 1e-9);
const pcm = Buffer.alloc(N * 4);
let clipped = 0;
let sumSq = 0;
for (let i = 0; i < N; i++) {
  const l = sat(outL[i]) * fin;
  const r = sat(outR[i]) * fin;
  const li = Math.max(-32767, Math.min(32767, Math.round(l * 32767)));
  const ri = Math.max(-32767, Math.min(32767, Math.round(r * 32767)));
  if (Math.abs(li) >= 32767 || Math.abs(ri) >= 32767) clipped++;
  pcm.writeInt16LE(li, i * 4);
  pcm.writeInt16LE(ri, i * 4 + 2);
  sumSq += l * l + r * r;
}
log(`RMS ${(10 * Math.log10(sumSq / (2 * N))).toFixed(1)} dBFS, clipped samples: ${clipped}`);
// loudness by ten-second block (a sanity check on the shape of the piece)
{
  const blocks: string[] = [];
  for (let b = 0; b < 60; b++) {
    let s = 0;
    let n = 0;
    for (let i = b * 10 * SR; i < (b + 1) * 10 * SR; i += 5) {
      const l = sat(outL[i]) * fin;
      s += l * l;
      n++;
    }
    blocks.push((10 * Math.log10(s / n + 1e-12)).toFixed(0));
  }
  log(`per-10 s level (dB): ${blocks.join(" ")}`);
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
writeFileSync(join(outDir, "score.wav"), Buffer.concat([header, pcm]));
log(`wrote out/score.wav (${((44 + pcm.length) / 1e6).toFixed(0)} MB)`);
