/**
 * A toy attention head, small enough to show every number. Each token has a 4-D value vector (hand-set, an
 * illustration), a query and a key (fitted offline so the head attends sensibly). Everything else is the real
 * computation: similarity = query · key, a softmax over the row (causal mask: a token looks only at the tokens
 * before it, and itself), and the new vector of a token = the weighted sum of the value vectors it attends to.
 */
import raw from "../data/attention.json";
import { TOKENS } from "./carry";

export const N_TOK = TOKENS.length;

/** Vectors (rows), one per token, each of length 4. Values in [-1, 1]. */
export const VEC: number[][] = [
  [0.9, -0.2, 0.1, 0.35], // 猫
  [-0.3, 0.25, 0.9, -0.1], // 坐
  [0.1, -0.7, 0.05, 0.55], // 在
  [0.25, 0.8, -0.3, -0.2], // 垫子
  [0.0, 0.5, -0.1, 0.7], // 上
  [-0.5, 0.1, 0.4, 0.6], // 因为
  [0.55, -0.1, 0.0, 0.25], // 它  — a pronoun: points the same way as what it refers to, only shorter
  [0.5, -0.6, 0.7, -0.3], // 累了
];

export const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

/** Queries and keys of the toy head: fitted offline (scripts/fit-attention.ts) to a sensible attention pattern. */
export const Q: number[][] = raw.Q;
export const KEYS: number[][] = raw.K;
/** Values: what each token hands over when it is attended to. */
export const V = VEC;

/** Similarity scores of token i against every token (−∞ for tokens after i: a token only looks backwards). */
export function scores(i: number): number[] {
  return KEYS.map((k, j) => (j <= i ? dot(Q[i], k) : -Infinity));
}

/** Attention weights of token i (softmax of the scores; sum to 1; zero after i). */
export function weights(i: number): number[] {
  const s = scores(i);
  const m = Math.max(...s);
  const e = s.map((v) => (Number.isFinite(v) ? Math.exp(v - m) : 0));
  const z = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / z);
}

export const ATT: number[][] = Array.from({ length: N_TOK }, (_, i) => weights(i));

/** New vector of token i: Σ_j w_ij · v_j. */
export function mix(i: number): number[] {
  const w = ATT[i];
  return [0, 1, 2, 3].map((d) => V.reduce((s, v, j) => s + w[j] * v[d], 0));
}

/** The token whose new vector we follow: 它. */
export const QUERY = 6;

/** Next-token candidates for the four rounds of the last scene (illustrative probabilities). */
export const ROUNDS: { picks: { t: string; p: number }[] }[] = [
  { picks: [{ t: "所以", p: 0.41 }, { t: "，", p: 0.26 }, { t: "。", p: 0.14 }, { t: "想", p: 0.08 }, { t: "了", p: 0.06 }, { t: "它", p: 0.05 }] },
  { picks: [{ t: "它", p: 0.44 }, { t: "猫", p: 0.21 }, { t: "想", p: 0.13 }, { t: "就", p: 0.09 }, { t: "要", p: 0.07 }, { t: "会", p: 0.06 }] },
  { picks: [{ t: "想", p: 0.38 }, { t: "要", p: 0.24 }, { t: "决定", p: 0.15 }, { t: "打算", p: 0.1 }, { t: "会", p: 0.08 }, { t: "只", p: 0.05 }] },
  { picks: [{ t: "睡觉", p: 0.47 }, { t: "休息", p: 0.22 }, { t: "睡", p: 0.12 }, { t: "回家", p: 0.09 }, { t: "吃饭", p: 0.06 }, { t: "玩", p: 0.04 }] },
];
