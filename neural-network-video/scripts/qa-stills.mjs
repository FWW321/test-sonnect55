#!/usr/bin/env node
/**
 * Fast visual QA: bundle once, then render many stills.
 *
 *   node scripts/qa-stills.mjs                       # every chapter, 6 frames each
 *   node scripts/qa-stills.mjs 3 5.0 20 41           # chapter 3, at t = 5 s, 20 s, 41 s (chapter-relative)
 *   node scripts/qa-stills.mjs main 0 30 60 599      # the master composition at absolute seconds
 *   QA_SCALE=1 QA_OUT=out/qa node scripts/qa-stills.mjs ...
 *
 * Output: out/qa/<composition>-<seconds>.png
 */
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, process.env.QA_OUT ?? "out/qa");
mkdirSync(outDir, { recursive: true });
const scale = Number(process.env.QA_SCALE ?? 1);
const FPS = 30;
const browserExecutable = process.env.REMOTION_BROWSER || undefined;

const args = process.argv.slice(2);
const chapterIds = [
  "pixels", "neuron", "activation", "forward", "space", "loss", "descent",
  "backprop", "training", "overfit", "conv", "attention", "scale", "epilogue",
];
const pad = (n) => String(n).padStart(2, "0");

let jobs = []; // {id, frames: [{label, frame}]}
if (args[0] === "main") {
  jobs.push({ id: "NeuralNetwork", frames: args.slice(1).map((s) => ({ label: `t${Number(s).toFixed(1)}`, frame: Math.round(Number(s) * FPS) })) });
} else if (args.length) {
  const n = Number(args[0]);
  const id = `Ch${pad(n)}-${chapterIds[n - 1]}`;
  jobs.push({ id, chapter: n, frames: args.slice(1).map((s) => ({ label: `t${Number(s).toFixed(1)}`, rel: Number(s) })) });
} else {
  chapterIds.forEach((cid, i) => {
    jobs.push({ id: `Ch${pad(i + 1)}-${cid}`, chapter: i + 1, frames: [2, 8, 16, 26, 36, 44].map((s) => ({ label: `t${s.toFixed(1)}`, rel: s })) });
  });
}

console.log("bundling…");
const serveUrl = await bundle({ entryPoint: join(root, "src/index.ts"), onProgress: () => {} });

for (const job of jobs) {
  const comp = await selectComposition({ serveUrl, id: job.id, browserExecutable });
  for (const f of job.frames) {
    let frame = f.frame;
    if (frame === undefined) {
      // chapter-relative seconds → local frame (compositions start at the chapter's lead-in)
      const lead = job.chapter === 1 ? 0 : 45;
      frame = Math.round(f.rel * FPS) + lead;
    }
    frame = Math.max(0, Math.min(comp.durationInFrames - 1, frame));
    const output = join(outDir, `${job.id}-${f.label}.png`);
    await renderStill({ composition: comp, serveUrl, frame, output, scale, browserExecutable, imageFormat: "png" });
    console.log("  ✓", output.replace(root + "/", ""));
  }
}
console.log("done");
