/**
 * Trains the small 2-D networks the film visualises and stores their weights (and, for the
 * "live training" scenes, whole training trajectories) in src/data/toys.json.
 * The datasets themselves are regenerated in the browser from seeds; a checksum stored next to
 * the weights makes the film fail loudly if a generator ever drifts out of sync.
 * Run with `npm run train:toys` (≈ 30 s).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOY } from "../src/nn/toys";
import { Act, Net, train } from "../src/nn/mlp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const Y = (y: number[]) => y.map((v) => Float64Array.of(v));
const r4 = (a: ArrayLike<number>) => Array.from(a, (v) => +v.toFixed(4));
const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

const out: Record<string, unknown> = {};

// ------------------------------------------------------------------ 1. circles: 2 → 3 (ReLU) → 1
// Three ReLU units fold the plane like paper into 3-D; one plane then separates the classes.
{
  const ds = TOY.circles();
  let best: { seed: number; margin: number; net: Net } | null = null;
  for (let seed = 1; seed <= 24; seed++) {
    const net = Net.init([2, 3, 1], ["relu", "sigmoid"], seed);
    net.layers[0].b.fill(0.3); // keep every unit alive at the start
    const r = train(net, ds.X, Y(ds.y), { loss: "bce", steps: 2500, lr: 0.02, snapEvery: 2500 });
    if (r.acc.at(-1)! < 1) continue;
    const [w, b] = [net.layers[1].W, net.layers[1].b[0]];
    const wn = Math.hypot(w[0], w[1], w[2]);
    const cache = net.makeCache();
    let margin = 1e9;
    let zeros = 0;
    for (let i = 0; i < ds.X.length; i++) {
      net.forward(ds.X[i], cache);
      const h = cache.a[1];
      for (let k = 0; k < 3; k++) if (h[k] < 1e-9) zeros++;
      margin = Math.min(margin, ((w[0] * h[0] + w[1] * h[1] + w[2] * h[2] + b) / wn) * (ds.y[i] ? 1 : -1));
    }
    const zeroFrac = zeros / (ds.X.length * 3);
    log(`  circles seed ${seed}: margin ${margin.toFixed(3)}, ${(zeroFrac * 100).toFixed(0)}% of activations are exactly 0`);
    // a "sheet" that is neither flat against the walls nor barely folded reads best on screen
    if (zeroFrac < 0.3 || zeroFrac > 0.5) continue;
    if (!best || margin > best.margin) best = { seed, margin, net };
  }
  out.circles = { seed: best!.seed, sizes: [2, 3, 1], acts: ["relu", "sigmoid"], params: r4(best!.net.params), check: TOY.check(ds.X) };
  log(`circles: chose seed ${best!.seed} (margin ${best!.margin.toFixed(3)})`);
}

// ------------------------------------------------------------------ 2. spirals through three 2-wide tanh layers
// Every layer is a smooth 2-D → 2-D map (2×2 linear + tanh), so the film can draw the whole space being
// stretched and folded, layer by layer, until one straight line separates the arms.
{
  const ds = TOY.spirals();
  const sizes = [2, 2, 2, 2, 1];
  const acts: Act[] = ["tanh", "tanh", "tanh", "sigmoid"];
  let chosen: { seed: number; net: Net } | null = null;
  for (let seed = 1; seed <= 60 && !chosen; seed++) {
    const net = Net.init(sizes, acts, seed);
    const r = train(net, ds.X, Y(ds.y), { loss: "bce", steps: 6000, lr: 0.03, snapEvery: 6000 });
    log(`  spirals seed ${seed}: acc ${r.acc.at(-1)!.toFixed(3)}`);
    if (r.acc.at(-1)! >= 0.995) chosen = { seed, net };
  }
  out.spirals = { seed: chosen!.seed, sizes, acts, params: r4(chosen!.net.params), check: TOY.check(ds.X) };
  log(`spirals: chose seed ${chosen!.seed}`);
}

const file = join(root, "src", "data", "toys.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out));
log(`wrote ${file}`);
