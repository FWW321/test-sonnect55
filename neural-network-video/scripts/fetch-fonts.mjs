#!/usr/bin/env node
/**
 * Builds the font files the film needs into public/fonts/.
 *
 *   NotoSansSC-VF.woff2   variable weight 100–900, subsetted to exactly the glyphs used under src/
 *   Inter-VF.woff2        Latin, variable weight (Google Fonts)
 *   JetBrainsMono-VF.woff2 Latin, variable weight (Google Fonts)
 *
 * Re-run (`npm run fonts`) whenever on-screen text changes; the output is committed so
 * rendering never needs the network.
 * Requires: curl, python3 with `pip install fonttools brotli`.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cache = join(root, ".font-cache");
const out = join(root, "public", "fonts");
mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], ...opts }).toString();

const download = (url, file) => {
  if (existsSync(file) && statSync(file).size > 1000) return;
  console.log("  ↓", url);
  sh("curl", ["-fsSL", "--retry", "3", "-m", "180", "-o", file, url]);
};

// ---------------------------------------------------------------- 1. glyph set
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const chars = new Set();
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
for (const ch of "“”‘’…—–·×÷±≈≠≤≥→←↑↓↔∂∑∏∇∞√∈σμθλπαβγδεη°²³⁻¹ⁿ′″•●○■□▲▼※（）【】《》「」、。，；：？！") {
  chars.add(ch);
}
for (const f of walk(join(root, "src"))) {
  if (!/\.(tsx?|json)$/.test(f)) continue;
  for (const ch of readFileSync(f, "utf8")) {
    if (ch.codePointAt(0) > 0x7f) chars.add(ch);
  }
}
const textFile = join(cache, "glyphs.txt");
writeFileSync(textFile, [...chars].join(""));
const cjk = [...chars].filter((c) => c.codePointAt(0) >= 0x2e80).length;
console.log(`glyphs: ${chars.size} (${cjk} CJK / fullwidth)`);

// ---------------------------------------------------------------- 2. Noto Sans SC
console.log("Noto Sans SC");
const notoSrc = join(cache, "NotoSansSC-VF.ttf");
download(
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf",
  notoSrc,
);
const notoOut = join(out, "NotoSansSC-VF.woff2");
sh("python3", [
  "-m",
  "fontTools.subset",
  notoSrc,
  `--text-file=${textFile}`,
  "--flavor=woff2",
  "--layout-features=*",
  "--no-hinting",
  `--output-file=${notoOut}`,
]);
console.log(`  → ${notoOut} (${(statSync(notoOut).size / 1024).toFixed(0)} KB)`);

// ---------------------------------------------------------------- 3. Inter + JetBrains Mono (latin)
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const googleLatin = (family, spec, fileName) => {
  console.log(family);
  const dest = join(out, fileName);
  if (existsSync(dest) && statSync(dest).size > 1000) {
    console.log(`  (cached) ${dest}`);
    return;
  }
  const css = sh("curl", [
    "-fsSL",
    "-A",
    UA,
    `https://fonts.googleapis.com/css2?family=${family}:wght@${spec}&display=swap`,
  ]);
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1] !== "latin") continue;
    const url = /url\((https:[^)]+)\)/.exec(m[2])?.[1];
    if (!url) continue;
    download(url, dest);
    console.log(`  → ${dest} (${(statSync(dest).size / 1024).toFixed(0)} KB)`);
    return;
  }
  throw new Error(`no latin slice found for ${family}`);
};
googleLatin("Inter", "100..900", "Inter-VF.woff2");
googleLatin("JetBrains+Mono", "100..800", "JetBrainsMono-VF.woff2");
console.log("done");
