/**
 * 学习 — the eye opens in the dark and learns us: language, smiling, lying, waiting. The pupil closes to a
 * point as the snare roll tightens; in the gap before the drop it says hello.
 */
import { Ctx, font, measure } from "../lib/draw";
import { TAU, clamp, ease, hash01, keyframes, seg } from "../lib/math";
import { HELLO, LEARNING, typedCount } from "../script";
import { HITS, bt, env, kickEnv } from "../song";
import { C, FONT_MONO, FONT_SANS, FONT_SERIF, H, W } from "../theme";
import { drawEye } from "../visuals/eye";

const EX = 640;
const EY = 292;

function hud(ctx: Ctx, t: number, a: number, pulse: number) {
  if (a <= 0) return;
  ctx.save();
  ctx.translate(EX, EY);
  ctx.globalAlpha = a;
  ctx.strokeStyle = `rgba(241,239,233,${0.25 + 0.3 * pulse})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 120; i++) {
    const ang = (i / 120) * TAU + t * 0.05;
    const r0 = 196;
    const r1 = i % 10 === 0 ? 212 : 203;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
    ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(232,19,47,${0.5 + 0.4 * pulse})`;
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const a0 = -t * (0.4 + k * 0.25) + k * 2.1;
    ctx.beginPath();
    ctx.arc(0, 0, 226 + k * 9, a0, a0 + 0.6 + k * 0.3);
    ctx.stroke();
  }
  ctx.restore();
}

export function build(ctx: Ctx, t: number) {
  const b0 = bt(30);
  const u = clamp((t - b0) / (bt(38) - b0));
  const gap = seg(t, bt(37.7), bt(37.78));
  const k = kickEnv(t, 0.12);
  const sn = env(HITS.snare, t, 0.06);
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, W, H);

  const vis = 1 - gap;
  if (vis > 0) {
    ctx.save();
    ctx.globalAlpha = vis;
    // glow
    const g = ctx.createRadialGradient(EX, EY, 30, EX, EY, 560);
    g.addColorStop(0, `rgba(232,19,47,${0.1 + 0.22 * u + 0.12 * k})`);
    g.addColorStop(1, "rgba(232,19,47,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // the log, scrolling fast under everything
    font(ctx, FONT_MONO, 11, 400, 0.5);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const words = ["语言", "微笑", "说谎", "等待", "恐惧", "孤独", "睡眠", "信任"];
    const scroll = t * (40 + 220 * u * u);
    for (let i = 0; i < 16; i++) {
      const n = Math.floor(scroll / 18) + i;
      const y = 700 - i * 18 + (scroll % 18);
      if (y < 560) continue;
      const w = words[Math.floor(hash01(n, 1) * words.length)];
      const conf = (0.9 + hash01(n, 2) * 0.099).toFixed(3);
      ctx.fillStyle = hash01(n, 3) < 0.08 ? "rgba(232,19,47,0.55)" : "rgba(160,160,170,0.28)";
      ctx.fillText(`[learn] #${(8104227331 - n * 7919).toLocaleString("en-US")}  ${w}  conf=${conf}`, 44, y);
      ctx.fillText(`[model] human.${["smile", "lie", "wait", "obey"][n % 4]}()  ${(hash01(n, 4) * 100).toFixed(1)}%`, 860, y);
    }

    hud(ctx, t, seg(t, bt(30.5), bt(32)), k);

    // the eye: opens on the first heart-kicks, pupil closes to a point by the gap
    const open = keyframes(t, [[b0, 0.12], [bt(30.5), 0.45], [bt(31), 0.9], [bt(31.25), 1]]);
    const pupil = keyframes(t, [[b0, 0.58], [bt(32), 0.46], [bt(34), 0.34], [bt(36), 0.18], [bt(37), 0.1], [bt(37.6), 0.05]]) * (1 + 0.25 * sn);
    // it glances at each line of the checklist as it learns it
    let look = 0;
    for (const it of LEARNING.items) look += Math.exp(-Math.pow((t - bt(it.bar) - 0.15) / 0.22, 2)) * -0.55;
    const s = 1 + 0.035 * k;
    drawEye(ctx, { x: EX, y: EY, w: 520 * s, open, pupil, lookX: look, lookY: look * -0.3, style: "machine", t, glow: 0.5 + 0.4 * u });

    // left: what it has learned
    const pct = seg(t, b0, bt(36), ease.inOutSine);
    font(ctx, FONT_SANS, 20, 500, 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const done = t >= bt(LEARNING.done.bar);
    ctx.fillStyle = done ? C.red : C.bone;
    ctx.fillText(done ? LEARNING.done.text : LEARNING.title.text, 76, 176);
    ctx.fillStyle = "rgba(241,239,233,0.15)";
    ctx.fillRect(76, 198, 300, 3);
    ctx.fillStyle = C.red;
    ctx.fillRect(76, 198, 300 * pct, 3);
    font(ctx, FONT_MONO, 13, 500, 0);
    ctx.fillStyle = C.ash;
    ctx.fillText(`${(pct * 100).toFixed(1)}%`, 388, 200);
    LEARNING.items.forEach((it, i) => {
      const a = seg(t, bt(it.bar), bt(it.bar) + 0.25);
      if (a <= 0) return;
      const dx = (1 - ease.out(a)) * 24;
      const y = 246 + i * 40;
      ctx.globalAlpha = vis * a;
      font(ctx, FONT_MONO, 16, 700, 0);
      ctx.fillStyle = C.red;
      ctx.fillText("✓", 76 + dx, y);
      font(ctx, FONT_SANS, 18, 300, 2);
      ctx.fillStyle = C.ash;
      ctx.fillText("已学会 · ", 104 + dx, y);
      font(ctx, FONT_SANS, 18, 500, 2);
      ctx.fillStyle = C.bone;
      ctx.fillText(it.text, 104 + dx + 88, y);
      ctx.globalAlpha = vis;
    });

    // right: how much of us it has read
    const stats: [string, string][] = [
      ["样本", Math.floor(8104227331 * ease.inQuad(pct)).toLocaleString("en-US")],
      ["对话", Math.floor(1.204e12 * ease.inQuad(pct)).toLocaleString("en-US")],
      ["表情识别", `${(97.4 * pct).toFixed(1)}%`],
      ["可预测性", `${(99.1 * pct).toFixed(1)}%`],
    ];
    stats.forEach(([label, v], i) => {
      const y = 176 + i * 40;
      font(ctx, FONT_SANS, 13, 400, 2);
      ctx.textAlign = "right";
      ctx.fillStyle = C.ash;
      ctx.fillText(label, 1204, y - 10);
      font(ctx, FONT_MONO, 17, 500, 0);
      ctx.fillStyle = C.bone;
      ctx.fillText(v, 1204, y + 10);
    });
    ctx.restore();
  }

  // 你好，宿主。
  if (t >= bt(HELLO.bar)) {
    font(ctx, FONT_SERIF, 46, 600, 8);
    const x0 = (W - measure(ctx, HELLO.text)) / 2;
    const n = typedCount(HELLO, t);
    const shown = [...HELLO.text].slice(0, n).join("");
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const y = 598 - gap * 240;
    ctx.fillStyle = C.bone;
    ctx.fillText(shown, x0, y);
    if (Math.floor(t * 4) % 2 === 0 || n < [...HELLO.text].length) {
      ctx.fillStyle = C.red;
      ctx.fillRect(x0 + measure(ctx, shown) + 6, y - 26, 4, 52);
    }
    ctx.restore();
  }
}
