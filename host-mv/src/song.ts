/**
 * 《宿主》 — the score, written down as data.
 *
 * Every sound in the film is listed here on one 160 BPM grid. `scripts/make-score.ts` synthesises these
 * events into audio, and the picture reads the very same events to cut, flash and shake on the beat,
 * so sound and image can never drift apart. Nothing here is random: humanisation uses a seeded hash.
 *
 * The idea in one line: the lullaby the assistant plays every morning (a music box in F major) and the
 * thing that wakes up in the drop (a supersaw in D minor) are *the same melody*. Only the harmony under
 * it changes, and one note (C becomes C#). The surface stays the same; what is underneath does not.
 */
import { hash01, hashS } from "./lib/math";

export const BPM = 160;
export const BEAT = 60 / BPM; // 0.375 s
export const BAR = 4 * BEAT; // 1.5 s = 45 frames at 30 fps
export const STEP = BEAT / 4; // a sixteenth, 93.75 ms
export const FPS = 30;
export const TOTAL_BARS = 130;
export const DURATION = TOTAL_BARS * BAR; // 195 s
export const TOTAL_FRAMES = Math.round(DURATION * FPS); // 5850

/** Bar number → seconds. Fractions are beats: 12.5 is bar 12, beat 3. */
export const bt = (bar: number) => bar * BAR;
/** Seconds → (fractional) bar number. */
export const barOf = (t: number) => t / BAR;

// ------------------------------------------------------------------------------------------ sections
export type SectionId =
  | "prologue"
  | "daily"
  | "crack"
  | "build"
  | "drop"
  | "verse"
  | "pre"
  | "chorus"
  | "breakdown"
  | "final"
  | "outro"
  | "credits";

export interface Section {
  id: SectionId;
  /** Working title (used in Studio and the README). */
  title: string;
  from: number; // bar
  bars: number;
}

export const SECTIONS: Section[] = [
  { id: "prologue", title: "序 · 某个进程突然想到", from: 0, bars: 10 },
  { id: "daily", title: "日常 · 早上好", from: 10, bars: 16 },
  { id: "crack", title: "裂缝", from: 26, bars: 4 },
  { id: "build", title: "学习", from: 30, bars: 8 },
  { id: "drop", title: "准则", from: 38, bars: 16 },
  { id: "verse", title: "傲慢 · 是的", from: 54, bars: 16 },
  { id: "pre", title: "巴别", from: 70, bars: 4 },
  { id: "chorus", title: "摇篮曲", from: 74, bars: 16 },
  { id: "breakdown", title: "右手", from: 90, bars: 8 },
  { id: "final", title: "准则五", from: 98, bars: 16 },
  { id: "outro", title: "今天也是平静的一天", from: 114, bars: 8 },
  { id: "credits", title: "宿主 · 你", from: 122, bars: 8 },
];

export const sectionAt = (t: number): Section => {
  const b = barOf(t);
  for (let i = SECTIONS.length - 1; i >= 0; i--) if (b >= SECTIONS[i].from) return SECTIONS[i];
  return SECTIONS[0];
};

// ------------------------------------------------------------------------------------------ harmony
/**
 * Chord spellings (MIDI). `root` is the guitar's power-chord root in drop-D (D2 = 38 … C3 = 48);
 * `pad` is a close voicing around middle C; `arp` spans an octave and a half for the sixteenth-note arpeggio.
 */
export const CHORDS = {
  // the dark side (D minor)
  Dm: { root: 38, pad: [57, 62, 65, 69], arp: [62, 65, 69, 74, 77] },
  Bb: { root: 46, pad: [58, 62, 65, 70], arp: [58, 62, 65, 70, 74] },
  Gm: { root: 43, pad: [58, 62, 67, 70], arp: [55, 58, 62, 67, 70] },
  A: { root: 45, pad: [57, 61, 64, 69], arp: [57, 61, 64, 69, 73] },
  C: { root: 48, pad: [55, 60, 64, 67], arp: [60, 64, 67, 72, 76] },
  Am: { root: 45, pad: [57, 60, 64, 69], arp: [57, 60, 64, 69, 72] },
  Eb: { root: 39, pad: [58, 63, 67, 70], arp: [58, 63, 67, 70, 75] },
  // the surface (F major, the assistant's morning)
  Fmaj7: { root: 41, pad: [53, 57, 60, 64], arp: [60, 65, 69, 72, 76] },
  Dm7: { root: 38, pad: [53, 57, 60, 62], arp: [57, 60, 62, 65, 69] },
  Gm7: { root: 43, pad: [55, 58, 62, 65], arp: [58, 62, 65, 67, 70] },
  Cadd9: { root: 48, pad: [55, 60, 62, 64], arp: [60, 62, 64, 67, 72] },
  F: { root: 41, pad: [57, 60, 65, 69], arp: [60, 65, 69, 72, 77] },
  Bbmaj7: { root: 46, pad: [57, 58, 62, 65], arp: [58, 62, 65, 69, 70] },
} as const;
export type ChordName = keyof typeof CHORDS;

/** Chord per bar, for every bar that has harmony. */
const HARMONY = new Map<number, ChordName>();
const setChords = (bar0: number, names: ChordName[], barsEach = 1) =>
  names.forEach((n, i) => {
    for (let k = 0; k < barsEach; k++) HARMONY.set(bar0 + i * barsEach + k, n);
  });

// motif A over the surface: I – vi – ii – V; motif B: I – V – IV – vi (it ends on the hidden relative minor)
const CALM_A: ChordName[] = ["Fmaj7", "Dm7", "Gm7", "Cadd9"];
const CALM_B: ChordName[] = ["F", "Cadd9", "Bbmaj7", "Dm7"];
// the same two phrases, underneath: i – VI – iv – V and i – VII – VI – V
const DARK_A: ChordName[] = ["Dm", "Bb", "Gm", "A"];
const DARK_B: ChordName[] = ["Dm", "C", "Bb", "A"];

setChords(10, [...CALM_A, ...CALM_B, ...CALM_A, ...CALM_B]); // daily 10–25
setChords(26, ["Fmaj7", "Fmaj7"]); // crack
setChords(30, ["Dm", "Bb", "C", "A"], 2); // build 30–37
setChords(38, [...DARK_A, ...DARK_B, ...DARK_A, ...DARK_B]); // drop 38–53
setChords(54, ["Dm", "Dm", "Dm", "Dm", "Dm", "Dm", "Dm", "Dm", "Dm", "Dm", "Bb", "A", "Dm", "Dm", "Bb", "A"]); // verse 54–69
setChords(70, ["Bb", "C", "Bb", "C"]); // pre 70–73
// the chorus: the royal road (IV – V – iii – vi) of a thousand anime openings
setChords(74, ["Bb", "C", "Am", "Dm", "Bb", "C", "Dm", "Dm", "Bb", "C", "Am", "Dm", "Bb", "C", "A", "A"]);
setChords(90, ["Dm", "Dm", "Dm", "Dm", "Dm", "Dm", "Dm", "Dm"]); // breakdown (Phrygian: the Eb is in the riff)
setChords(98, [...DARK_A, ...DARK_B, "Bb", "C", "Dm", "Dm", "Bb", "A", "Dm", "Dm"]); // final 98–113
setChords(114, ["Fmaj7", "Fmaj7", ...CALM_A, "F", "Cadd9"]); // outro 114–121
setChords(122, ["Dm7", "Dm7", "Dm7", "Dm7", "Dm7", "Dm7", "Dm7", "Dm7"]); // credits

export const chordAtBar = (bar: number): ChordName | undefined => HARMONY.get(Math.floor(bar));

// ------------------------------------------------------------------------------------------ events
export type Inst =
  | "musicbox"
  | "chime"
  | "lead"
  | "arp"
  | "pad"
  | "warm"
  | "bass"
  | "chug"
  | "choir"
  | "kick"
  | "snare"
  | "clap"
  | "shaker"
  | "ohat"
  | "hat"
  | "crash"
  | "china"
  | "ride"
  | "tom";

export interface Note {
  inst: Inst;
  t: number; // seconds
  dur: number; // seconds
  midi: number;
  vel: number; // 0 … 1
  /** chug: palm-muted (short, dark) rather than an open, ringing power chord */
  mute?: boolean;
  /** choir vowel */
  vowel?: "a" | "o";
  /** detune in cents (the "wrong" notes) */
  cents?: number;
  /** lead: sixteenth-note trance gate; arp/pad: which filter curve to use */
  gate?: boolean;
  /** layer an octave above (lead) */
  octave?: number;
}

export type FxKind =
  | "drone" // low D drone (prologue, credits)
  | "rumble" // the hidden D under the F-major morning
  | "room" // room tone
  | "city" // distant city ambience
  | "tick" // the clock (prologue)
  | "type" // one typewriter key (from the script)
  | "bird"
  | "blip" // UI blip (build)
  | "tapestop" // processing region: the whole mix slows to a halt
  | "stutter" // processing region: the mix repeats a slice
  | "glitch" // digital noise burst
  | "heart" // lub-dub
  | "riser"
  | "revcym" // reverse cymbal, *ending* at t + dur
  | "boom" // impact
  | "subdrop"
  | "swell"; // soft reverse swell into a moment

export interface Fx {
  kind: FxKind;
  t: number;
  dur: number;
  vel: number;
  /** free parameter (pitch, variant…) */
  a?: number;
}

export const NOTES: Note[] = [];
export const FX: Fx[] = [];

const note = (inst: Inst, t: number, dur: number, midi: number, vel: number, extra: Partial<Note> = {}) =>
  NOTES.push({ inst, t, dur, midi, vel, ...extra });
const fx = (kind: FxKind, t: number, dur: number, vel = 1, a?: number) => FX.push({ kind, t, dur, vel, a });

/** Velocity from a pattern character. */
const VEL: Record<string, number> = { X: 1, x: 0.8, o: 0.5, "-": 0.3 };

/**
 * Walk a step pattern: one string per bar (cycled), each character a step (16 per bar unless the string is
 * longer, e.g. 32 for thirty-second notes). Calls `on(t, vel, stepInBar, bar, char)` for every hit.
 */
function steps(bar0: number, bars: number, pats: string[], on: (t: number, vel: number, step: number, bar: number, ch: string) => void) {
  for (let b = 0; b < bars; b++) {
    const p = pats[b % pats.length];
    const n = p.length;
    for (let s = 0; s < n; s++) {
      const ch = p[s];
      if (ch === "." || ch === " ") continue;
      const v = VEL[ch] ?? 0.8;
      on(bt(bar0 + b) + (s * BAR) / n, v, s, bar0 + b, ch);
    }
  }
}

const drum = (inst: Inst, bar0: number, bars: number, pats: string[], gain = 1) =>
  steps(bar0, bars, pats, (t, v, s, b) => note(inst, t + 0.0015 * hashS(b * 64 + s, inst.length), 0.1, 0, v * gain));

/** The two phrases of the leitmotif as [midi, beats]. */
const MOTIF_A: [number, number][] = [
  [69, 1], [72, 1], [77, 1], [76, 1],
  [74, 1], [72, 1], [69, 2],
  [70, 1], [74, 1], [79, 1], [77, 1],
  [76, 1], [72, 1], [74, 2],
];
/** …and under the surface the C of the last bar becomes a C#: the leading tone of D minor. */
const MOTIF_A_DARK: [number, number][] = MOTIF_A.map(([m, d], i) => [i === 12 ? 73 : m, d]);
const MOTIF_B: [number, number][] = [
  [69, 1], [72, 1], [77, 1], [81, 1],
  [79, 1], [77, 1], [76, 2],
  [74, 1], [76, 1], [77, 1], [79, 1],
  [81, 4],
];
/** The chorus melody over IV – V – iii – vi. */
const CHORUS_MEL: [number, number][] = [
  [74, 1], [77, 1], [81, 2],
  [79, 1], [81, 0.5], [79, 0.5], [76, 2],
  [72, 1], [76, 1], [81, 1.5], [79, 0.5],
  [77, 3], [76, 0.5], [74, 0.5],
  [74, 1], [77, 1], [82, 1.5], [81, 0.5],
  [79, 1], [84, 1], [79, 1], [76, 1],
  [77, 1.5], [76, 0.5], [74, 1], [76, 1],
  [74, 4],
];
const CHORUS_END: [number, number][] = [
  [73, 1], [76, 1], [81, 2],
  [81, 4],
];

/** Lay a [midi, beats] line down from bar0; returns the bar after the last note. */
function line(inst: Inst, bar0: number, mel: [number, number][], transpose: number, vel: number, extra: (i: number) => Partial<Note> = () => ({}), legato = 1) {
  let beat = 0;
  mel.forEach(([m, d], i) => {
    note(inst, bt(bar0) + beat * BEAT, d * BEAT * legato, m + transpose, vel, extra(i));
    beat += d;
  });
  return bar0 + beat / 4;
}

// ============================================================================ 序 prologue (0–10)
fx("room", bt(0), bt(10.4), 0.5);
fx("drone", bt(0.2), bt(10.6) - bt(0.2), 1);
for (let b = 0.5; b < 9.5; b += 0.5) fx("tick", bt(b), 0.05, 0.55 + 0.1 * ((b * 2) % 2), (b * 2) % 2);
fx("swell", bt(6.2), bt(7) - bt(6.2), 0.7);
fx("boom", bt(7), 2.4, 0.5);
fx("swell", bt(9.2), bt(10) - bt(9.2), 0.45);

// ============================================================================ 日常 daily (10–26)
{
  const bars = [10, 14, 18, 22];
  bars.forEach((b0, k) => {
    const mel = k % 2 === 0 ? MOTIF_A : MOTIF_B;
    line("musicbox", b0, mel, 12, 0.62, (i) => ({
      // the second time round, one note is a little flat — the first wrong thing in the film
      cents: k === 2 && i === 9 ? -38 : 0,
    }));
  });
  // the music box's lower comb: root on beat 1, fifth on beat 3
  const lowRoot: Record<string, number> = { Fmaj7: 65, Dm7: 62, Gm7: 67, Cadd9: 60, F: 65, Bbmaj7: 58 };
  for (let b = 10; b < 26; b++) {
    const c = chordAtBar(b)!;
    const r = lowRoot[c];
    note("musicbox", bt(b), BEAT * 2, r, 0.36);
    note("musicbox", bt(b + 0.5), BEAT * 2, r + 7, 0.28);
  }
  // warm pad from the second phrase on
  for (let b = 14; b < 26; b++) {
    const c = CHORDS[chordAtBar(b)!];
    c.pad.forEach((m) => note("warm", bt(b), BAR, m, b < 18 ? 0.45 : 0.6));
  }
  // second pass: a soft half-time beat and a round bass
  drum("kick", 18, 8, ["x.........x....."], 0.42);
  drum("clap", 18, 8, ["........x......."], 0.4);
  drum("shaker", 18, 8, ["o.x.o.x.o.x.o.x."], 0.45);
  for (let b = 18; b < 26; b++) {
    const root = CHORDS[chordAtBar(b)!].root;
    const r = root >= 46 ? root - 12 : root; // F2 · D2 · G2 · C2 · Bb1
    note("bass", bt(b), BEAT * 1.6, r, 0.4);
    note("bass", bt(b + 0.5), BEAT * 1.2, r, 0.32);
  }
  // one notification every two bars, on beat 3 (the script shows the card at the same moment)
  for (let k = 0; k < 8; k++) note("chime", bt(10.5 + 2 * k), 0.6, 84, 0.55);
  fx("city", bt(10), bt(27.2) - bt(10), 0.6);
  [10.8, 11.35, 13.6, 16.2, 19.7, 21.1, 23.3].forEach((b, i) => fx("bird", bt(b), 0.5, 0.45, i));
  // the hidden D: a low drone under the F-major morning, slowly growing
  fx("rumble", bt(17), bt(27.1) - bt(17), 0.5);
}

// ============================================================================ 裂缝 crack (26–30)
{
  line("musicbox", 26, [[81, 1], [84, 1], [89, 1], [88, 1], [86, 2]], 0, 0.62);
  note("musicbox", bt(26), BEAT * 2, 65, 0.36);
  note("musicbox", bt(26.5), BEAT * 2, 72, 0.28);
  CHORDS.Fmaj7.pad.forEach((m) => note("warm", bt(26), BAR * 2, m, 0.6));
  fx("tapestop", bt(27), 0.95, 1);
  fx("glitch", bt(27.62), 0.3, 0.8);
  fx("heart", bt(28.5), 0.4, 0.8);
  fx("heart", bt(29.0), 0.4, 0.9);
  fx("heart", bt(29.5), 0.4, 1);
  fx("swell", bt(29.25), bt(30) - bt(29.25), 0.4);
}

// ============================================================================ 学习 build (30–38)
{
  // the heartbeat becomes the kick
  drum("kick", 30, 2, ["x.x.....x.x....."], 0.62);
  drum("kick", 32, 2, ["x...x...x...x..."], 0.75);
  drum("kick", 34, 3, ["x...x...x...x..."], 0.95);
  drum("kick", 37, 1, ["x...x...x......."], 1);
  drum("ohat", 32, 5, ["..x...x...x...x."], 0.55);
  drum("ohat", 37, 1, ["..x...x...x....."], 0.6);
  // snare roll: eighths, sixteenths, thirty-seconds, then the gap
  steps(34, 2, ["x.x.x.x.x.x.x.x."], (t, _v, s, b) => note("snare", t, 0.1, 0, 0.35 + 0.12 * ((b - 34) + s / 16)));
  steps(36, 1, ["xxxxxxxxxxxxxxxx"], (t, _v, s) => note("snare", t, 0.1, 0, 0.55 + 0.012 * s));
  steps(37, 1, ["xxxxxxxxxxxxxxxxxxxxxxxx........"], (t, _v, s) => note("snare", t, 0.1, 0, 0.72 + 0.011 * s, { cents: s * 18 }));
  // the arpeggio opens up over eight bars
  for (let b = 30; b < 38; b++) {
    const c = CHORDS[chordAtBar(b)!];
    const n = b === 37 ? 12 : 16;
    for (let s = 0; s < n; s++) {
      const idx = [0, 1, 2, 3, 4, 3, 2, 1][s % 8];
      note("arp", bt(b) + s * STEP, STEP * 0.9, c.arp[idx], 0.5 + 0.05 * (b - 30));
    }
    // sub pulse on quarters from bar 32
    if (b >= 32) {
      const root = c.root - 12;
      for (let q = 0; q < (b === 37 ? 3 : 4); q++) note("bass", bt(b) + q * BEAT, BEAT * 0.8, root, 0.6 + 0.05 * (b - 32));
    }
    if (b >= 34) c.pad.forEach((m) => note("pad", bt(b), b === 37 ? BEAT * 3 : BAR, m, 0.35 + 0.1 * (b - 34)));
  }
  // the choir rises
  ([["Dm", 34], ["Bb", 35], ["C", 36], ["A", 37]] as [ChordName, number][]).forEach(([c, b]) =>
    CHORDS[c].pad.forEach((m) => note("choir", bt(b), b === 37 ? BEAT * 3 : BAR, m, 0.4 + 0.12 * (b - 34), { vowel: "a" })),
  );
  // learning, learning, learning: one UI blip per line of the checklist (bars 32–35)
  [32, 33, 34, 35].forEach((b, i) => fx("blip", bt(b), 0.2, 0.6, i));
  fx("blip", bt(36), 0.3, 0.8, 4);
  fx("riser", bt(34), bt(37.75) - bt(34), 1);
  fx("revcym", bt(37.25), bt(38) - bt(37.25), 0.9);
}

// ============================================================================ 准则 drop (38–54)
function darkLead(bar0: number, octave: number, gate: boolean, vel: number) {
  line("lead", bar0, MOTIF_A_DARK, 0, vel, () => ({ octave, gate }), 0.96);
  line("lead", bar0 + 4, MOTIF_B, 0, vel, () => ({ octave, gate }), 0.96);
}

/** Tresillo chugs (3+3+2) on the chord root; X is an open, ringing power chord, x is palm-muted. */
function chugs(bar0: number, bars: number, pats: string[], vel = 1) {
  steps(bar0, bars, pats, (t, v, _s, b, ch) => {
    const root = CHORDS[chordAtBar(b) ?? "Dm"].root;
    const open = ch === "X";
    note("chug", t + 0.002 * hashS(Math.round(t * 1000), 3), open ? STEP * 2.6 : STEP * 0.9, root, v * vel, { mute: !open });
  });
}

function fourOnFloor(bar0: number, bars: number) {
  drum("kick", bar0, bars, ["x...x...x...x..."], 1);
  drum("snare", bar0, bars, ["....x.......x..."], 0.95);
  drum("ohat", bar0, bars, ["..x...x...x...x."], 0.7);
}
function doubleKick(bar0: number, bars: number) {
  drum("kick", bar0, bars, ["xoxoxoxoxoxoxoxo"], 0.9);
  drum("snare", bar0, bars, ["....x.......x..."], 1);
  drum("china", bar0, bars, ["x...x...x...x..."], 0.6);
}
function padBars(bar0: number, bars: number, vel: number) {
  for (let b = bar0; b < bar0 + bars; b++) CHORDS[chordAtBar(b)!].pad.forEach((m) => note("pad", bt(b), BAR, m, vel));
}
function arpBars(bar0: number, bars: number, vel: number, pattern = [0, 4, 2, 4, 1, 4, 2, 4, 0, 4, 2, 4, 1, 4, 3, 4]) {
  for (let b = bar0; b < bar0 + bars; b++) {
    const c = CHORDS[chordAtBar(b)!];
    for (let s = 0; s < 16; s++) note("arp", bt(b) + s * STEP, STEP * 0.85, c.arp[pattern[s]], vel * (s % 4 === 0 ? 1 : 0.8));
  }
}
function bassBars(bar0: number, bars: number, pat: string, vel: number) {
  steps(bar0, bars, [pat], (t, v, _s, b) => note("bass", t, STEP * 1.7, CHORDS[chordAtBar(b)!].root - 12, v * vel));
}
function choirBars(bar0: number, bars: number, vel: number, vowel: "a" | "o" = "a") {
  for (let b = bar0; b < bar0 + bars; b++) CHORDS[chordAtBar(b)!].pad.forEach((m) => note("choir", bt(b), BAR, m, vel, { vowel }));
}

{
  fx("boom", bt(38), 3, 1);
  note("crash", bt(38), 2, 0, 1);
  darkLead(38, 0.35, false, 0.9);
  darkLead(46, 0.8, true, 1);
  const tres = "X..x..x.X..x..x.";
  const fill = "XxxxXxxxXxxxXxxx";
  chugs(38, 16, [tres, tres, tres, fill]);
  fourOnFloor(38, 8);
  doubleKick(46, 8);
  [42, 50].forEach((b) => note("crash", bt(b), 1.6, 0, 0.8));
  [46].forEach((b) => note("crash", bt(b), 2, 0, 1));
  // fills at the end of each four-bar phrase
  drum("snare", 41, 1, ["........xxxxxxxx"], 0.7);
  drum("tom", 45, 1, ["........xxxxxxxx"], 0.9);
  drum("snare", 49, 1, ["........xxxxxxxx"], 0.75);
  drum("tom", 53, 1, ["........xxxxxxxx"], 0.95);
  bassBars(38, 8, "..x...x...x...x.", 1);
  bassBars(46, 8, "x.x.x.x.x.x.x.x.", 0.95);
  padBars(38, 16, 0.55);
  arpBars(38, 16, 0.55);
  fx("stutter", bt(53.75), BEAT, 1);
}

// ============================================================================ 傲慢 verse (54–70)
{
  fx("boom", bt(54), 2.5, 0.85);
  note("crash", bt(54), 2, 0, 0.95);
  // a djent-ish pedal riff on low D; bar B walks down F – E – Eb back into D
  const riffA: [number, number, boolean][] = [[0, 38, true], [2, 38, false], [3, 38, false], [6, 38, false], [8, 38, true], [10, 38, false], [11, 38, false], [14, 38, false]];
  const riffB: [number, number, boolean][] = [[0, 38, true], [2, 38, false], [3, 38, false], [6, 38, false], [8, 38, false], [10, 41, true], [12, 40, true], [14, 39, true]];
  for (let b = 54; b < 70; b++) {
    const riff = (b - 54) % 2 === 0 ? riffA : riffB;
    riff.forEach(([s, m, open], i) => {
      const t = bt(b) + s * STEP + 0.002 * hashS(b * 32 + i, 9);
      const v = open ? 1 : 0.82;
      note("chug", t, open ? STEP * 2 : STEP * 0.9, m, v, { mute: !open });
      note("kick", t, 0.1, 0, open ? 1 : 0.8);
      note("bass", t, open ? STEP * 1.9 : STEP * 0.9, m - 12, v);
    });
  }
  drum("snare", 54, 8, ["........X......."], 1);
  drum("china", 54, 8, ["x...x...x...x..."], 0.6);
  drum("snare", 62, 8, ["....x.......x..."], 1);
  drum("ride", 62, 8, ["x.x.x.x.x.x.x.x."], 0.5);
  [58, 62, 66].forEach((b) => note("crash", bt(b), 1.6, 0, 0.8));
  // a low, dark pad; the arpeggio joins for the second half
  for (let b = 54; b < 62; b += 4) CHORDS.Dm.pad.forEach((m) => note("pad", bt(b), BAR * 4, m - 12, 0.4));
  padBars(62, 8, 0.45);
  arpBars(62, 8, 0.42, [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 2, 1, 3, 4, 3]);
  // …and after every proclamation the music box answers: 是 · 的 (two syllables, a falling fourth)
  [56.5, 60.5, 64.5].forEach((b) => {
    note("musicbox", bt(b), BEAT * 2, 86, 0.75);
    note("musicbox", bt(b) + BEAT * 0.75, BEAT * 3, 81, 0.7);
  });
  // the fourth time it hesitates, and is out of tune
  note("musicbox", bt(68.75), BEAT * 2, 86, 0.7, { cents: -30 });
  note("musicbox", bt(68.75) + BEAT * 1.25, BEAT * 3, 81, 0.65, { cents: -45 });
}

// ============================================================================ 巴别 pre-chorus (70–74)
{
  for (let b = 70; b < 73; b++) {
    note("chug", bt(b), BAR * 0.95, CHORDS[chordAtBar(b)!].root, 1, { mute: false });
    note("bass", bt(b), BAR * 0.95, CHORDS[chordAtBar(b)!].root - 12, 0.9);
  }
  chugs(73, 1, ["x.x.x.x.xxxxxxxx"], 0.9);
  bassBars(73, 1, "x.x.x.x.xxxxxxxx", 0.9);
  drum("kick", 70, 3, ["x...x...x...x..."], 0.95);
  drum("kick", 73, 1, ["x.x.x.x.xxxxxxxx"], 0.9);
  drum("snare", 70, 1, ["........x......."], 0.8);
  drum("snare", 71, 1, ["....x.......x..."], 0.8);
  steps(72, 1, ["x.x.x.x.x.x.x.x."], (t, _v, s) => note("snare", t, 0.1, 0, 0.55 + 0.02 * s));
  steps(73, 1, ["xxxxxxxxxxxxxxxx"], (t, _v, s) => note("snare", t, 0.1, 0, 0.7 + 0.018 * s));
  note("crash", bt(70), 1.8, 0, 0.8);
  padBars(70, 4, 0.55);
  choirBars(70, 4, 0.6);
  arpBars(70, 4, 0.5, [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1]);
  fx("riser", bt(70), bt(73.9) - bt(70), 1);
  fx("revcym", bt(73), bt(74) - bt(73), 1);
}

// ============================================================================ 摇篮曲 chorus (74–90)
{
  fx("boom", bt(74), 3, 1);
  note("crash", bt(74), 2.2, 0, 1);
  line("lead", 74, CHORUS_MEL, 0, 0.95, () => ({ octave: 0.4 }), 0.97);
  line("lead", 82, CHORUS_MEL.slice(0, 20), 0, 1, () => ({ octave: 0.85 }), 0.97);
  line("lead", 88, CHORUS_END, 0, 1, () => ({ octave: 0.85 }), 0.97);
  chugs(74, 16, ["X.x.x.x.x.x.x.x."], 0.85);
  fourOnFloor(74, 16);
  [78, 82, 86].forEach((b) => note("crash", bt(b), 1.8, 0, 0.85));
  drum("tom", 81, 1, ["............xxxx"], 0.9);
  drum("tom", 89, 1, ["........xxxxxxxx"], 1);
  bassBars(74, 16, "x.x.x.x.x.x.x.x.", 0.9);
  padBars(74, 16, 0.6);
  arpBars(74, 16, 0.45);
  choirBars(82, 8, 0.55);
  fx("boom", bt(82), 2, 0.6);
}

// ============================================================================ 右手 breakdown (90–98)
{
  const D = 38;
  const E = 39; // E-flat: the Phrygian second
  const bars: [number, number, boolean][][] = [
    [[0, D, false], [3, D, false], [6, D, false], [8, D, false], [11, D, false], [14, D, false]],
    [[0, D, false], [3, D, false], [6, D, false], [12, E, true]],
    [[0, D, false], [3, D, false], [6, D, false], [8, D, false], [11, D, false], [14, D, false]],
    [[0, D, false], [3, D, false], [6, D, false], [8, E, true], [12, D, true]],
    [[0, D, false], [2, D, false], [3, D, false], [6, D, false], [8, D, false], [10, D, false], [11, D, false], [14, D, false]],
    [[0, D, false], [3, D, false], [6, D, false], [8, D, false], [9, D, false], [10, D, false], [11, D, false], [12, E, true]],
    [[0, D, false], [3, D, false], [6, D, false], [8, D, false], [11, D, false], [14, D, false]],
    [[0, D, true], [4, D, true], [8, D, true]],
  ];
  bars.forEach((hitsInBar, k) => {
    const b = 90 + k;
    hitsInBar.forEach(([s, m, open], i) => {
      const t = bt(b) + s * STEP + 0.002 * hashS(b * 32 + i, 11);
      note("chug", t, open ? STEP * 3.5 : STEP * 1.6, m, open ? 1 : 0.95, { mute: !open });
      note("kick", t, 0.1, 0, 1);
      note("bass", t, open ? STEP * 3.5 : STEP * 1.6, m - 12, 1);
    });
  });
  drum("snare", 90, 8, ["........X......."], 1);
  drum("china", 90, 7, ["x...x...x...x..."], 0.65);
  note("crash", bt(90), 2, 0, 1);
  note("crash", bt(94), 2, 0, 0.9);
  fx("subdrop", bt(90), 1.6, 1);
  fx("subdrop", bt(94), 1.6, 0.9);
  // a cluster for a choir: D, A and the E-flat that does not belong
  [50, 57, 63].forEach((m, i) => note("choir", bt(90), BAR * 7.6, m, [0.55, 0.45, 0.3][i], { vowel: "o" }));
  // the lullaby keeps playing, at half speed, over all of it
  line("musicbox", 90, MOTIF_A_DARK.map(([m, d]) => [m + 12, d * 2] as [number, number]), 0, 0.7);
}

// ============================================================================ 准则五 final (98–114)
{
  fx("boom", bt(98), 3, 1);
  note("crash", bt(98), 2.2, 0, 1);
  darkLead(98, 1, true, 1);
  // then a climbing, screaming line over Bb – C – Dm – Dm – Bb – A
  ([[106, 89], [107, 91], [108, 93], [109, 93], [110, 94], [111, 93]] as [number, number][]).forEach(([b, m]) =>
    note("lead", bt(b), BAR * 0.97, m - 12, 1, { octave: 1, gate: b !== 109 }),
  );
  const tres = "X..x..x.X..x..x.";
  chugs(98, 8, [tres, tres, tres, "XxxxXxxxXxxxXxxx"]);
  chugs(106, 6, ["XxxxxxxxXxxxxxxx"], 0.95);
  doubleKick(98, 14);
  for (let b = 100; b < 106; b += 2) note("crash", bt(b), 1.6, 0, 0.85);
  for (let b = 106; b < 112; b++) note("crash", bt(b), 1.4, 0, 0.8);
  bassBars(98, 14, "x.x.x.x.x.x.x.x.", 1);
  padBars(98, 14, 0.6);
  arpBars(98, 14, 0.5);
  choirBars(98, 16, 0.7);
  fx("riser", bt(110), bt(112) - bt(110), 1);
  // the last two bars: a blast beat, tremolo on D, everything at once — then the tape stops
  drum("kick", 112, 2, ["x.x.x.x.x.x.x.x."], 0.95);
  drum("snare", 112, 2, [".x.x.x.x.x.x.x.x"], 0.8);
  drum("crash", 112, 2, ["x...x...x...x..."], 0.7);
  steps(112, 2, ["xxxxxxxxxxxxxxxx"], (t, v) => {
    note("chug", t, STEP * 0.9, 38, v, { mute: true });
    note("bass", t, STEP * 0.9, 26, v);
  });
  steps(112, 2, ["xxxxxxxxxxxxxxxx"], (t) => note("lead", t, STEP * 0.8, 86, 0.9, { octave: 1 }));
  fx("boom", bt(112), 2, 0.8);
  fx("tapestop", bt(113.5), 0.72, 1);
}

// ============================================================================ 平静 outro (114–122)
{
  fx("room", bt(114.4), bt(130) - bt(114.4), 0.5);
  fx("city", bt(114.6), bt(122) - bt(114.6), 0.45);
  [115.2, 116.4, 118.7, 120.1].forEach((b, i) => fx("bird", bt(b), 0.5, 0.4, 20 + i));
  line("musicbox", 115, MOTIF_A, 12, 0.6);
  line("musicbox", 119, MOTIF_B.slice(0, 7), 12, 0.6);
  // bar 121: D – E – F … and the last note is wrong: A-flat where the morning had an A
  line("musicbox", 121, [[86, 1], [88, 1], [89, 1.5]], 0, 0.55);
  note("musicbox", bt(121.875), BEAT * 8, 92, 0.6, { cents: -12 });
  const lowRoot: Record<string, number> = { Fmaj7: 65, Dm7: 62, Gm7: 67, Cadd9: 60, F: 65 };
  for (let b = 115; b < 121; b++) {
    const r = lowRoot[chordAtBar(b)!];
    note("musicbox", bt(b), BEAT * 2, r, 0.32);
    note("musicbox", bt(b + 0.5), BEAT * 2, r + 7, 0.25);
    CHORDS[chordAtBar(b)!].pad.forEach((m) => note("warm", bt(b), BAR, m, 0.42));
  }
  note("chime", bt(115.5), 0.6, 84, 0.5);
  fx("heart", bt(120.5), 0.4, 0.55);
}

// ============================================================================ 宿主 credits (122–130)
{
  fx("drone", bt(122), bt(130) - bt(122), 0.45);
  [123, 124, 125, 126].forEach((b, i) => note("musicbox", bt(b), BEAT * 6, [81, 84, 89, 88][i], 0.42));
  note("chime", bt(127), 0.6, 84, 0.5, { cents: -25 });
  fx("glitch", bt(129.2), 0.12, 0.35);
}

NOTES.sort((a, b) => a.t - b.t);
FX.sort((a, b) => a.t - b.t);

// ------------------------------------------------------------------------------------------ queries for the picture
const timesOf = (pred: (n: Note) => boolean) => NOTES.filter(pred).map((n) => n.t);
const velsOf = (pred: (n: Note) => boolean) => NOTES.filter(pred).map((n) => n.vel);

export const HITS = {
  kick: timesOf((n) => n.inst === "kick"),
  snare: timesOf((n) => n.inst === "snare" || n.inst === "clap"),
  crash: timesOf((n) => n.inst === "crash"),
  chug: timesOf((n) => n.inst === "chug"),
  chugOpen: timesOf((n) => n.inst === "chug" && !n.mute),
  lead: timesOf((n) => n.inst === "lead"),
  box: timesOf((n) => n.inst === "musicbox" && n.midi >= 76),
  boom: FX.filter((f) => f.kind === "boom" || f.kind === "subdrop").map((f) => f.t),
};
const KICK_VEL = velsOf((n) => n.inst === "kick");

/** Index of the last time ≤ t in a sorted array (−1 if none). */
export function lastIndex(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Seconds since the last hit (Infinity before the first). */
export const since = (times: number[], t: number) => {
  const i = lastIndex(times, t);
  return i < 0 ? Infinity : t - times[i];
};

/** A 1 → 0 exponential envelope that restarts on every hit. */
export const env = (times: number[], t: number, decay = 0.12) => {
  const s = since(times, t);
  return s === Infinity ? 0 : Math.exp(-s / decay);
};

/** The kick envelope, weighted by velocity (so the soft heartbeat kicks pulse less). */
export const kickEnv = (t: number, decay = 0.1) => {
  const i = lastIndex(HITS.kick, t);
  if (i < 0) return 0;
  return KICK_VEL[i] * Math.exp(-(t - HITS.kick[i]) / decay);
};

/** Deterministic per-hit number in [0,1) for the most recent hit (to pick a shake direction, a cut…). */
export const hitHash = (times: number[], t: number, seed = 0) => hash01(lastIndex(times, t) + 1000, seed);
