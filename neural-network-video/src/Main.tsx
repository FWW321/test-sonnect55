import { Sequence } from "remotion";
import { CHAPTER_COMPONENTS } from "./chapters";
import { TimeContext } from "./lib/time";
import { Stage } from "./Stage";
import { CHAPTERS, ChapterDef } from "./timeline";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Chapter `ch` mounted so that local frame 0 sits `lead` frames before its nominal start.
 * The offset lets every scene (and every shared carry helper) read the master clock.
 */
export const ChapterShell: React.FC<{ chapter: ChapterDef }> = ({ chapter }) => {
  const Comp = CHAPTER_COMPONENTS[chapter.id];
  return (
    <TimeContext.Provider value={{ offset: chapter.from - chapter.lead, chapter }}>
      <Comp />
    </TimeContext.Provider>
  );
};

/** The whole film: 14 overlapping chapters on one 18 000-frame timeline. */
export const Main: React.FC = () => (
  <Stage>
    {CHAPTERS.map((ch) => (
      <Sequence
        key={ch.id}
        name={`${pad(ch.num)} ${ch.title}`}
        from={ch.from - ch.lead}
        durationInFrames={ch.lead + ch.dur + ch.tail}
        premountFor={30}
      >
        <ChapterShell chapter={ch} />
      </Sequence>
    ))}
  </Stage>
);

/** One chapter on its own (with its lead/tail overlap), for previews and QA renders. */
export const Standalone: React.FC<{ chapter: ChapterDef }> = ({ chapter }) => (
  <TimeContext.Provider value={{ offset: chapter.from - chapter.lead, chapter }}>
    <Stage>
      <ChapterShell chapter={chapter} />
    </Stage>
  </TimeContext.Provider>
);
