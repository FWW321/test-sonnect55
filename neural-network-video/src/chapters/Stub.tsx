import { Canvas } from "../lib/canvas";
import { chapterClock, useChapterClock } from "../lib/time";
import { text } from "../lib/draw";
import { Captions } from "../ui/Captions";
import { ChapterCard } from "../ui/ChapterCard";
import { C } from "../theme";
import { useContext } from "react";
import { TimeContext } from "../lib/time";

/** Placeholder used while a chapter is still being built. */
export const Stub: React.FC = () => {
  const { chapter } = useContext(TimeContext);
  useChapterClock();
  return (
    <>
      <Canvas
        draw={({ ctx, gf }) => {
          const c = chapterClock(gf, chapter);
          text(ctx, `${chapter.title} · t=${c.t.toFixed(1)}s`, 640, 330, {
            size: 40,
            align: "center",
            color: C.dim,
            alpha: c.env,
          });
        }}
      />
      <ChapterCard />
      <Captions />
    </>
  );
};
