#!/usr/bin/env node
/**
 * Builds the three faces the film needs into public/fonts/ (committed, so rendering never needs the network):
 *
 *   NotoSerifSC-VF.woff2    variable 200–900, subset to exactly the glyphs used under src/   — humanity's voice
 *   NotoSansSC-VF.woff2     variable 100–900, subset the same way                            — the assistant's voice
 *   JetBrainsMono-VF.woff2  Latin, variable 100–800 (Google Fonts)                           — logs and numbers
 *
 * Re-run (`npm run fonts`) whenever on-screen text changes.
 * Requires: curl, python3 with `pip install fonttools brotli`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cache = join(root, ".font-cache");
const out = join(root, "public", "fonts");
mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"] }).toString();
const download = (url, file) => {
  if (existsSync(file) && statSync(file).size > 1000) return;
  console.log("  ↓", url);
  sh("curl", ["-fsSL", "--retry", "3", "-m", "300", "-o", file, url]);
};

// ---------------------------------------------------------------- 1. glyph set
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const chars = new Set();
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
for (const ch of "“”‘’…—–·×°•●○■□▲▼▶◀■▍█✓✕→←↑↓（）【】《》「」『』、。，；：？！％") chars.add(ch);
for (const f of walk(join(root, "src"))) {
  if (!/\.(tsx?|json)$/.test(f)) continue;
  for (const ch of readFileSync(f, "utf8")) if (ch.codePointAt(0) > 0x7f) chars.add(ch);
}
const textFile = join(cache, "glyphs.txt");
writeFileSync(textFile, [...chars].join(""));
console.log(`glyphs: ${chars.size} (${[...chars].filter((c) => c.codePointAt(0) >= 0x2e80).length} CJK / fullwidth)`);

// ---------------------------------------------------------------- 2. Noto Serif SC + Noto Sans SC
const noto = (style, file) => {
  console.log(`Noto ${style} SC`);
  const src = join(cache, file.replace(".woff2", ".ttf"));
  download(`https://raw.githubusercontent.com/notofonts/noto-cjk/main/${style}/Variable/TTF/Subset/${file.replace(".woff2", ".ttf")}`, src);
  const dest = join(out, file);
  sh("python3", ["-m", "fontTools.subset", src, `--text-file=${textFile}`, "--flavor=woff2", "--layout-features=*", "--no-hinting", `--output-file=${dest}`]);
  console.log(`  → ${dest} (${(statSync(dest).size / 1024).toFixed(0)} KB)`);
};
noto("Serif", "NotoSerifSC-VF.woff2");
noto("Sans", "NotoSansSC-VF.woff2");

// ---------------------------------------------------------------- 3. JetBrains Mono (latin)
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
{
  console.log("JetBrains Mono");
  const dest = join(out, "JetBrainsMono-VF.woff2");
  if (!(existsSync(dest) && statSync(dest).size > 1000)) {
    const css = sh("curl", ["-fsSL", "-A", UA, "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100..800&display=swap"]);
    const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
    let m;
    let done = false;
    while ((m = re.exec(css))) {
      if (m[1] !== "latin") continue;
      const url = /url\((https:[^)]+)\)/.exec(m[2])?.[1];
      if (!url) continue;
      download(url, dest);
      done = true;
      break;
    }
    if (!done) throw new Error("no latin slice found for JetBrains Mono");
  }
  console.log(`  → ${dest} (${(statSync(dest).size / 1024).toFixed(0)} KB)`);
}
console.log("done");
