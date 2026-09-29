/**
 * Fits the 4-D queries and keys of the toy attention head of chapter 12 so that softmax(Q·Kᵀ) (causal) reproduces
 * a linguistically sensible attention pattern for "猫 坐 在 垫子 上 因为 它 累了" — a tiny stand-in for training.
 * Values are hand-set (src/visuals/attention.ts). Output: src/data/attention.json. Run: npm run fit:attention
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gaussian, mulberry32 } from "../src/lib/math";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const N = 8;
const D = 4;
const T: number[][] = [
  [1, 0, 0, 0, 0, 0, 0, 0],
  [0.7, 0.3, 0, 0, 0, 0, 0, 0],
  [0.1, 0.6, 0.3, 0, 0, 0, 0, 0],
  [0, 0.2, 0.6, 0.2, 0, 0, 0, 0],
  [0, 0, 0.15, 0.65, 0.2, 0, 0, 0],
  [0.1, 0.25, 0, 0.1, 0.25, 0.3, 0, 0],
  [0.6, 0.02, 0.02, 0.08, 0.03, 0.05, 0.2, 0],
  [0.3, 0.02, 0, 0, 0, 0.03, 0.5, 0.15],
];
let best: { loss: number; Q: number[][]; K: number[][]; P: number[][] } | null = null;
for (let seed = 1; seed <= 30; seed++) {
  const rng = mulberry32(seed);
  const Q = Array.from({ length: N }, () => Array.from({ length: D }, () => gaussian(rng) * 0.5));
  const K = Array.from({ length: N }, () => Array.from({ length: D }, () => gaussian(rng) * 0.5));
  const mQ = Q.map((r) => r.map(() => 0));
  const vQ = Q.map((r) => r.map(() => 0));
  const mK = K.map((r) => r.map(() => 0));
  const vK = K.map((r) => r.map(() => 0));
  let loss = 0;
  let P: number[][] = [];
  for (let step = 1; step <= 6000; step++) {
    const gQ = Q.map((r) => r.map(() => 0));
    const gK = K.map((r) => r.map(() => 0));
    loss = 0;
    P = [];
    for (let i = 0; i < N; i++) {
      const s: number[] = [];
      for (let j = 0; j <= i; j++) s.push(Q[i].reduce((a, v, d) => a + v * K[j][d], 0));
      const m = Math.max(...s);
      const e = s.map((v) => Math.exp(v - m));
      const z = e.reduce((a, b) => a + b, 0);
      const p = e.map((v) => v / z);
      P.push([...p, ...Array(N - p.length).fill(0)]);
      for (let j = 0; j <= i; j++) {
        loss -= T[i][j] * Math.log(Math.max(p[j], 1e-9));
        const dl = p[j] - T[i][j];
        for (let d = 0; d < D; d++) {
          gQ[i][d] += dl * K[j][d];
          gK[j][d] += dl * Q[i][d];
        }
      }
    }
    const lr = 0.03;
    const c1 = 1 - Math.pow(0.9, step);
    const c2 = 1 - Math.pow(0.999, step);
    for (let i = 0; i < N; i++)
      for (let d = 0; d < D; d++) {
        mQ[i][d] = 0.9 * mQ[i][d] + 0.1 * gQ[i][d];
        vQ[i][d] = 0.999 * vQ[i][d] + 0.001 * gQ[i][d] ** 2;
        Q[i][d] -= (lr * (mQ[i][d] / c1)) / (Math.sqrt(vQ[i][d] / c2) + 1e-8);
        mK[i][d] = 0.9 * mK[i][d] + 0.1 * gK[i][d];
        vK[i][d] = 0.999 * vK[i][d] + 0.001 * gK[i][d] ** 2;
        K[i][d] -= (lr * (mK[i][d] / c1)) / (Math.sqrt(vK[i][d] / c2) + 1e-8);
      }
  }
  if (!best || loss < best.loss) best = { loss, Q: Q.map((r) => [...r]), K: K.map((r) => [...r]), P };
}
const r3 = (a: number[][]) => a.map((r) => r.map((v) => +v.toFixed(3)));
console.log("loss", best!.loss.toFixed(4));
console.log(best!.P.map((r) => r.map((v) => (v * 100).toFixed(0).padStart(3)).join(" ")).join("\n"));
const file = join(root, "src", "data", "attention.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify({ Q: r3(best!.Q), K: r3(best!.K), target: T }));
console.log("wrote", file);
