import { createContext, useContext } from "react";
import { useCurrentFrame } from "remotion";
import { FPS } from "../theme";
import { ChapterDef, CHAPTERS } from "../timeline";
import { seg, ease } from "./math";

/**
 * `offset` converts the Sequence-local frame back into the master timeline's frame, so every
 * chapter (and every shared "carry" helper) reasons in one global clock.
 */
export interface TimeCtx {
  offset: number;
  chapter: ChapterDef;
}
export const TimeContext = createContext<TimeCtx>({ offset: 0, chapter: CHAPTERS[0] });

/** Global (master-timeline) frame. */
export const useGF = () => useCurrentFrame() + useContext(TimeContext).offset;

export interface ChapterClock {
  /** Master frame. */
  gf: number;
  /** Seconds since the chapter's nominal start. Negative during the lead-in overlap. */
  t: number;
  /** Nominal chapter length in seconds. */
  dur: number;
  /** 0 → 1 presence envelope for everything that is *not* carried across the boundary. */
  env: number;
  chapter: ChapterDef;
  fps: number;
}

export const chapterClock = (gf: number, chapter: ChapterDef): ChapterClock => {
  const t = (gf - chapter.from) / FPS;
  const dur = chapter.dur / FPS;
  const lead = chapter.lead / FPS;
  const tail = chapter.tail / FPS;
  const fadeIn = lead > 0 ? seg(t, -lead, -lead * 0.25, ease.inOutSine) : 1;
  const fadeOut = tail > 0 ? 1 - seg(t, dur + tail * 0.25, dur + tail, ease.inOutSine) : 1;
  return { gf, t, dur, env: fadeIn * fadeOut, chapter, fps: FPS };
};

export const useChapterClock = (): ChapterClock => {
  const { offset, chapter } = useContext(TimeContext);
  const frame = useCurrentFrame();
  return chapterClock(frame + offset, chapter);
};
