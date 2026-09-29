/**
 * Trains the 784-16-16-10 digit classifier that the film's forward-pass chapters visualise, and
 * writes its weights to src/data/digit-net.json. Run with `npm run train` (≈10 s).
 * The digits are procedural (see src/nn/digits.ts) — no dataset download.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DIGIT_SIZE, oneHot, renderDigit } from "../src/nn/digits";
import { Net, evaluate, train } from "../src/nn/mlp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIZES = [784, 16, 16, 10];
const ACTS = ["relu", "relu", "softmax"] as const;

const make = (perClass: number, seedBase: number) => {
  const X: Float32Array[] = [];
  const Y: Float64Array[] = [];
  for (let i = 0; i < perClass; i++) {
    for (let d = 0; d < 10; d++) {
      X.push(renderDigit(d, seedBase + i));
      Y.push(oneHot(d));
    }
  }
  return { X, Y };
};

const t0 = Date.now();
const tr = make(600, 1);
const te = make(120, 500_000);
console.log(`data: ${tr.X.length} train / ${te.X.length} test  (${Date.now() - t0} ms)`);

/** Neurons that never fire on the training set: they would show up as blank weight images. */
function deadNeurons(net: Net) {
  const cache = net.makeCache();
  const active = [new Float64Array(16), new Float64Array(16)];
  const n = Math.min(1200, tr.X.length);
  for (let i = 0; i < n; i++) {
    net.forward(tr.X[i], cache);
    for (let l = 0; l < 2; l++) for (let j = 0; j < 16; j++) if (cache.a[l + 1][j] > 1e-6) active[l][j]++;
  }
  return active.map((a) => Array.from(a).filter((c) => c < n * 0.04).length);
}

// The film shows every hidden neuron, so pick the first initial seed that trains to >99 % with no dead units.
let net!: Net;
let INIT_SEED = 0;
let res!: ReturnType<typeof train>;
for (const seed of [7, 3, 11, 5, 13, 17, 19, 23, 29, 31]) {
  const cand = Net.init(SIZES, [...ACTS], seed);
  // a small positive bias keeps every ReLU alive at the start (otherwise weight decay can silence some for good)
  for (const L of cand.layers.slice(0, 2)) L.b.fill(0.1);
  const r = train(cand, tr.X, tr.Y, { loss: "ce", steps: 2600, lr: 0.002, batch: 32, l2: 1e-4, seed: 3, snapEvery: 2600 });
  const acc = evaluate(cand, te.X, te.Y, "ce").acc;
  const dead = deadNeurons(cand);
  console.log(`  seed ${seed}: test acc ${(acc * 100).toFixed(1)}%, dead neurons (layer1, layer2) = ${dead.join(", ")}`);
  net = cand;
  INIT_SEED = seed;
  res = r;
  if (acc > 0.99 && dead[0] === 0 && dead[1] === 0) break;
}
const trainM = evaluate(net, tr.X, tr.Y, "ce");
const testM = evaluate(net, te.X, te.Y, "ce");
console.log(
  `chosen seed ${INIT_SEED}: ${res.steps.at(-1)} steps in ${((Date.now() - t0) / 1000).toFixed(1)} s — train acc ${(trainM.acc * 100).toFixed(1)}%, test acc ${(testM.acc * 100).toFixed(1)}%`,
);

// per-digit showcase: first clean, confidently-correct sample of every class
const cache = net.makeCache();
const showcase: { digit: number; seed: number; conf: number }[] = [];
for (let d = 0; d < 10; d++) {
  for (let s = 900_000; s < 900_400; s++) {
    const out = net.forward(renderDigit(d, s), cache);
    let am = 0;
    for (let i = 1; i < 10; i++) if (out[i] > out[am]) am = i;
    if (am === d && out[d] > 0.93) {
      showcase.push({ digit: d, seed: s, conf: +out[d].toFixed(4) });
      break;
    }
  }
}
console.log("showcase:", showcase.map((s) => `${s.digit}:${s.seed}(${s.conf})`).join("  "));

// hero '7': regular-looking glyph the net is very sure about
const heroCandidates: { seed: number; conf: number }[] = [];
for (let s = 1; s < 400; s++) {
  const out = net.forward(renderDigit(7, 700_000 + s, { wobble: 0.55 }), cache);
  heroCandidates.push({ seed: 700_000 + s, conf: out[7] });
}
heroCandidates.sort((a, b) => b.conf - a.conf);
console.log(
  "hero '7' candidates:",
  heroCandidates
    .slice(0, 6)
    .map((h) => `${h.seed}(${h.conf.toFixed(4)})`)
    .join("  "),
);

const outFile = join(root, "src", "data", "digit-net.json");
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(
  outFile,
  JSON.stringify({
    sizes: SIZES,
    acts: ACTS,
    imageSize: DIGIT_SIZE,
    initSeed: INIT_SEED,
    testAcc: +testM.acc.toFixed(4),
    showcase,
    hero: { digit: 7, seed: heroCandidates[0].seed, wobble: 0.55 },
    params: Array.from(net.params, (v) => +v.toFixed(4)),
  }),
);
console.log(`wrote ${outFile}  (${net.paramCount} parameters)`);
