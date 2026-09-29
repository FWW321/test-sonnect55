/**
 * A small, honest multilayer perceptron — forward, backprop, SGD/Adam.
 * Everything the film shows about training (decision boundaries, loss curves, gradients)
 * is computed by this file, not faked. Pure TypeScript, deterministic, no dependencies.
 */
import { gaussian, mulberry32 } from "../lib/math";

export type Act = "relu" | "tanh" | "sigmoid" | "linear" | "softmax";

export interface Layer {
  nIn: number;
  nOut: number;
  act: Act;
  /** nOut × nIn, row-major: W[o * nIn + i]. A view into Net.params. */
  W: Float64Array;
  /** nOut. A view into Net.params. */
  b: Float64Array;
  wOff: number;
  bOff: number;
}

export interface Cache {
  /** a[0] is the input; a[l + 1] is the activation of layer l. */
  a: Float64Array[];
  /** Pre-activations, z[l] for layer l. */
  z: Float64Array[];
  /** dL/dz for layer l (filled by backward). */
  dz: Float64Array[];
}

export class Net {
  readonly sizes: number[];
  readonly acts: Act[];
  readonly params: Float64Array;
  readonly layers: Layer[];

  constructor(sizes: number[], acts: Act[], params?: ArrayLike<number>) {
    if (acts.length !== sizes.length - 1) throw new Error("acts.length must be sizes.length - 1");
    this.sizes = sizes.slice();
    this.acts = acts.slice();
    let total = 0;
    for (let l = 0; l < acts.length; l++) total += sizes[l] * sizes[l + 1] + sizes[l + 1];
    this.params = new Float64Array(total);
    if (params) this.params.set(params);
    this.layers = [];
    let off = 0;
    for (let l = 0; l < acts.length; l++) {
      const nIn = sizes[l];
      const nOut = sizes[l + 1];
      const W = this.params.subarray(off, off + nIn * nOut);
      const wOff = off;
      off += nIn * nOut;
      const b = this.params.subarray(off, off + nOut);
      const bOff = off;
      off += nOut;
      this.layers.push({ nIn, nOut, act: acts[l], W, b, wOff, bOff });
    }
  }

  /** He init for ReLU, Xavier for everything else, from a seeded RNG. */
  static init(sizes: number[], acts: Act[], seed: number): Net {
    const net = new Net(sizes, acts);
    const rng = mulberry32(seed);
    for (const L of net.layers) {
      const std = Math.sqrt((L.act === "relu" ? 2 : 1) / L.nIn);
      for (let i = 0; i < L.W.length; i++) L.W[i] = gaussian(rng) * std;
      L.b.fill(0);
    }
    return net;
  }

  clone(): Net {
    return new Net(this.sizes, this.acts, this.params);
  }

  get paramCount() {
    return this.params.length;
  }

  makeCache(): Cache {
    const a = [new Float64Array(this.sizes[0])];
    const z: Float64Array[] = [];
    const dz: Float64Array[] = [];
    for (const L of this.layers) {
      a.push(new Float64Array(L.nOut));
      z.push(new Float64Array(L.nOut));
      dz.push(new Float64Array(L.nOut));
    }
    return { a, z, dz };
  }

  /** Forward pass for one sample; fills the cache and returns the output activation. */
  forward(x: ArrayLike<number>, c: Cache): Float64Array {
    const a0 = c.a[0];
    for (let i = 0; i < a0.length; i++) a0[i] = x[i];
    for (let l = 0; l < this.layers.length; l++) {
      const { nIn, nOut, W, b, act } = this.layers[l];
      const prev = c.a[l];
      const z = c.z[l];
      const a = c.a[l + 1];
      for (let o = 0; o < nOut; o++) {
        let s = b[o];
        const row = o * nIn;
        for (let i = 0; i < nIn; i++) s += W[row + i] * prev[i];
        z[o] = s;
      }
      applyAct(act, z, a);
    }
    return c.a[this.layers.length];
  }

  /**
   * Backpropagation for one sample. `dzLast` is dL/dz at the output layer (for sigmoid+BCE and
   * softmax+CE that is simply prediction − target). Gradients are *accumulated* into `grad`
   * (same layout as `params`), multiplied by `scale`.
   */
  backward(c: Cache, dzLast: ArrayLike<number>, grad: Float64Array, scale = 1): void {
    const last = this.layers.length - 1;
    const dzL = c.dz[last];
    for (let o = 0; o < dzL.length; o++) dzL[o] = dzLast[o];
    for (let l = last; l >= 0; l--) {
      const { nIn, nOut, W, wOff, bOff } = this.layers[l];
      const dz = c.dz[l];
      const prev = c.a[l];
      for (let o = 0; o < nOut; o++) {
        const g = dz[o] * scale;
        grad[bOff + o] += g;
        const row = wOff + o * nIn;
        for (let i = 0; i < nIn; i++) grad[row + i] += g * prev[i];
      }
      if (l > 0) {
        const dzPrev = c.dz[l - 1];
        const zPrev = c.z[l - 1];
        const aPrev = c.a[l];
        const actPrev = this.layers[l - 1].act;
        for (let i = 0; i < nIn; i++) {
          let s = 0;
          for (let o = 0; o < nOut; o++) s += W[o * nIn + i] * dz[o];
          dzPrev[i] = s * actDeriv(actPrev, zPrev[i], aPrev[i]);
        }
      }
    }
  }
}

function applyAct(act: Act, z: Float64Array, a: Float64Array) {
  const n = z.length;
  switch (act) {
    case "relu":
      for (let i = 0; i < n; i++) a[i] = z[i] > 0 ? z[i] : 0;
      break;
    case "tanh":
      for (let i = 0; i < n; i++) a[i] = Math.tanh(z[i]);
      break;
    case "sigmoid":
      for (let i = 0; i < n; i++) a[i] = 1 / (1 + Math.exp(-z[i]));
      break;
    case "softmax": {
      let m = -Infinity;
      for (let i = 0; i < n; i++) if (z[i] > m) m = z[i];
      let s = 0;
      for (let i = 0; i < n; i++) {
        a[i] = Math.exp(z[i] - m);
        s += a[i];
      }
      for (let i = 0; i < n; i++) a[i] /= s;
      break;
    }
    default:
      for (let i = 0; i < n; i++) a[i] = z[i];
  }
}

function actDeriv(act: Act, z: number, a: number): number {
  switch (act) {
    case "relu":
      return z > 0 ? 1 : 0;
    case "tanh":
      return 1 - a * a;
    case "sigmoid":
      return a * (1 - a);
    default:
      return 1;
  }
}

// ------------------------------------------------------------------ optimisers

export class Adam {
  private m: Float64Array;
  private v: Float64Array;
  private t = 0;
  constructor(
    n: number,
    public lr = 1e-3,
    private b1 = 0.9,
    private b2 = 0.999,
    private eps = 1e-8,
  ) {
    this.m = new Float64Array(n);
    this.v = new Float64Array(n);
  }
  step(params: Float64Array, grad: Float64Array) {
    this.t++;
    const c1 = 1 - Math.pow(this.b1, this.t);
    const c2 = 1 - Math.pow(this.b2, this.t);
    for (let i = 0; i < params.length; i++) {
      const g = grad[i];
      this.m[i] = this.b1 * this.m[i] + (1 - this.b1) * g;
      this.v[i] = this.b2 * this.v[i] + (1 - this.b2) * g * g;
      params[i] -= (this.lr * (this.m[i] / c1)) / (Math.sqrt(this.v[i] / c2) + this.eps);
    }
  }
}

export class SGD {
  private vel: Float64Array;
  constructor(
    n: number,
    public lr = 0.1,
    private momentum = 0,
  ) {
    this.vel = new Float64Array(n);
  }
  step(params: Float64Array, grad: Float64Array) {
    for (let i = 0; i < params.length; i++) {
      this.vel[i] = this.momentum * this.vel[i] - this.lr * grad[i];
      params[i] += this.vel[i];
    }
  }
}

// ------------------------------------------------------------------ losses & training

export type LossKind = "bce" | "ce" | "mse";

/** Loss of one sample; writes dL/dz of the output layer into `dz`. */
export function sampleLoss(
  net: Net,
  out: Float64Array,
  y: ArrayLike<number>,
  kind: LossKind,
  dz: Float64Array,
): number {
  const eps = 1e-12;
  if (kind === "bce") {
    const p = Math.min(1 - eps, Math.max(eps, out[0]));
    dz[0] = out[0] - y[0];
    return -(y[0] * Math.log(p) + (1 - y[0]) * Math.log(1 - p));
  }
  if (kind === "ce") {
    let loss = 0;
    for (let i = 0; i < out.length; i++) {
      dz[i] = out[i] - y[i];
      if (y[i] > 0) loss -= y[i] * Math.log(Math.max(eps, out[i]));
    }
    return loss;
  }
  // mse: 0.5 Σ (a − y)²; output-layer derivative folded in
  const last = net.layers[net.layers.length - 1];
  let loss = 0;
  for (let i = 0; i < out.length; i++) {
    const d = out[i] - y[i];
    loss += 0.5 * d * d;
    dz[i] = d * (last.act === "tanh" ? 1 - out[i] * out[i] : last.act === "sigmoid" ? out[i] * (1 - out[i]) : 1);
  }
  return loss;
}

export function evaluate(
  net: Net,
  X: ArrayLike<number>[],
  Y: ArrayLike<number>[],
  kind: LossKind,
  cache = net.makeCache(),
): { loss: number; acc: number } {
  const dz = new Float64Array(net.sizes[net.sizes.length - 1]);
  let loss = 0;
  let right = 0;
  for (let n = 0; n < X.length; n++) {
    const out = net.forward(X[n], cache);
    loss += sampleLoss(net, out, Y[n], kind, dz);
    if (kind === "bce") right += out[0] > 0.5 === Y[n][0] > 0.5 ? 1 : 0;
    else if (kind === "ce") {
      let am = 0;
      let ym = 0;
      for (let i = 1; i < out.length; i++) {
        if (out[i] > out[am]) am = i;
        if (Y[n][i] > Y[n][ym]) ym = i;
      }
      right += am === ym ? 1 : 0;
    }
  }
  return { loss: loss / X.length, acc: right / X.length };
}

export interface TrainOptions {
  loss: LossKind;
  steps: number;
  lr: number;
  optimizer?: "adam" | "sgd";
  momentum?: number;
  /** Minibatch size; omit for full-batch. */
  batch?: number;
  /** Weight decay (L2) on weights only. */
  l2?: number;
  seed?: number;
  /** Record a snapshot every k steps (always includes step 0 and the last step). */
  snapEvery?: number;
}

export interface TrainResult {
  /** Parameter snapshots; snapshots[k] are the weights after steps[k] updates. */
  snapshots: Float32Array[];
  steps: number[];
  loss: number[];
  acc: number[];
}

export function train(
  net: Net,
  X: ArrayLike<number>[],
  Y: ArrayLike<number>[],
  o: TrainOptions,
): TrainResult {
  const opt = o.optimizer === "sgd" ? new SGD(net.paramCount, o.lr, o.momentum ?? 0) : new Adam(net.paramCount, o.lr);
  const rng = mulberry32(o.seed ?? 1);
  const grad = new Float64Array(net.paramCount);
  const cache = net.makeCache();
  const dz = new Float64Array(net.sizes[net.sizes.length - 1]);
  const n = X.length;
  const bs = o.batch ?? n;
  const order = Array.from({ length: n }, (_, i) => i);
  let cursor = n; // force a shuffle on first use when minibatching
  const snapEvery = o.snapEvery ?? 1;

  const res: TrainResult = { snapshots: [], steps: [], loss: [], acc: [] };
  const snap = (step: number) => {
    const m = evaluate(net, X, Y, o.loss, cache);
    res.snapshots.push(Float32Array.from(net.params));
    res.steps.push(step);
    res.loss.push(m.loss);
    res.acc.push(m.acc);
  };
  snap(0);
  for (let step = 1; step <= o.steps; step++) {
    grad.fill(0);
    for (let k = 0; k < bs; k++) {
      let idx: number;
      if (bs === n) idx = k;
      else {
        if (cursor >= n) {
          for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
          }
          cursor = 0;
        }
        idx = order[cursor++];
      }
      const out = net.forward(X[idx], cache);
      sampleLoss(net, out, Y[idx], o.loss, dz);
      net.backward(cache, dz, grad, 1 / bs);
    }
    if (o.l2) for (const L of net.layers) for (let i = 0; i < L.W.length; i++) grad[L.wOff + i] += o.l2 * L.W[i];
    opt.step(net.params, grad);
    if (step % snapEvery === 0 || step === o.steps) snap(step);
  }
  return res;
}

/** Output[0] of a single-output net over a regular grid; row-major, y increasing downward in rows. */
export function predictGrid(
  net: Net,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  nx: number,
  ny: number,
  cache = net.makeCache(),
): Float32Array {
  const out = new Float32Array(nx * ny);
  const p = [0, 0];
  for (let j = 0; j < ny; j++) {
    p[1] = y0 + ((y1 - y0) * (j + 0.5)) / ny;
    for (let i = 0; i < nx; i++) {
      p[0] = x0 + ((x1 - x0) * (i + 0.5)) / nx;
      out[j * nx + i] = net.forward(p, cache)[0];
    }
  }
  return out;
}
