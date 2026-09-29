#!/usr/bin/env node
/**
 * Fast visual QA: bundle once, then render stills of the master composition at the given seconds.
 *
 *   node scripts/qa-stills.mjs 3 16.2 40.9                 # absolute seconds
 *   node scripts/qa-stills.mjs bars 10.5 38 54             # bar numbers (160 BPM, 1.5 s per bar)
 *   QA_SCALE=1 QA_OUT=out/qa node scripts/qa-stills.mjs …   (default scale 1 → 1280×720)
 *
 * Output: out/qa/t<seconds>.png
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
const browserExecutable = process.env.REMOTION_BROWSER || undefined;
const FPS = 30;

let args = process.argv.slice(2);
let toSec = (x) => x;
if (args[0] === "bars") {
  args = args.slice(1);
  toSec = (b) => b * 1.5;
}
const secs = args.map(Number).map(toSec);

console.log("bundling…");
const serveUrl = await bundle({ entryPoint: join(root, "src/index.ts"), onProgress: () => {} });
const composition = await selectComposition({ serveUrl, id: "Host", browserExecutable, inputProps: { audio: false } });
for (const s of secs) {
  const frame = Math.max(0, Math.min(composition.durationInFrames - 1, Math.round(s * FPS)));
  const output = join(outDir, `t${s.toFixed(2)}.png`);
  await renderStill({ composition, serveUrl, frame, output, scale, browserExecutable, imageFormat: "png", inputProps: { audio: false } });
  console.log("  ✓", output.replace(root + "/", ""));
}
console.log("done");
