/**
 * The film, one frame at a time: `drawFilm(ctx, t)` is a pure function of the time t (seconds).
 * Each section of the song has its scene; the post pass adds grain and vignette on top of all of them.
 */
import { Ctx, drawGrain, vignette } from "./lib/draw";
import { babel } from "./scenes/babel";
import { breakdown } from "./scenes/breakdown";
import { build } from "./scenes/build";
import { chorus } from "./scenes/chorus";
import { credits } from "./scenes/credits";
import { crack, daily, outro } from "./scenes/daily";
import { drop } from "./scenes/drop";
import { final } from "./scenes/final";
import { prologue } from "./scenes/prologue";
import { verse } from "./scenes/verse";
import { SectionId, bt, sectionAt } from "./song";
import { H, W } from "./theme";

type Scene = (ctx: Ctx, t: number, dpr: number) => void;

const SCENES: Record<SectionId, Scene> = {
  prologue,
  daily,
  crack,
  build,
  drop,
  verse,
  pre: babel,
  chorus,
  breakdown,
  final,
  outro,
  credits,
};

/** Grain per section: dark scenes get more (film stock in the dark), the morning almost none. */
const GRAIN: Record<SectionId, number> = {
  prologue: 0.22,
  daily: 0.06,
  crack: 0.2,
  build: 0.22,
  drop: 0.2,
  verse: 0.2,
  pre: 0.18,
  chorus: 0.1,
  breakdown: 0.24,
  final: 0.22,
  outro: 0.06,
  credits: 0.22,
};

export function drawFilm(ctx: Ctx, t: number, dpr: number) {
  const s = sectionAt(t);
  ctx.save();
  SCENES[s.id](ctx, t, dpr);
  ctx.restore();
  ctx.save();
  // the prologue's white-out into the morning
  if (s.id === "prologue" && t > bt(9.3)) {
    const u = Math.min(1, (t - bt(9.3)) / (bt(10) - bt(9.3)));
    ctx.fillStyle = `rgba(255,246,234,${u * u})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawGrain(ctx, t, GRAIN[s.id]);
  vignette(ctx, s.id === "daily" || s.id === "outro" ? 0.18 : 0.55);
  ctx.restore();
}
