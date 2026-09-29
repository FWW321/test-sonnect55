import { Sequence } from "remotion";
import { MaskRevealUp } from "../components/remocn/mask-reveal-up";
import { useChapterClock } from "../lib/time";
import { C, FPS } from "../theme";
import { CHAPTERS } from "../timeline";

/**
 * The chapter name, revealed line by line with remocn's `mask-reveal-up` at the top-left of the
 * stage. It appears once, holds, and exits with the component's own exit ramp — the persistent
 * label lives in <Chrome/>. Scenes keep the top-left ~130 px clear for the first few seconds.
 */
export const ChapterCard: React.FC<{ delay?: number; hold?: number }> = ({ delay = 0.5, hold = 4.4 }) => {
  const { chapter } = useChapterClock();
  const from = Math.round((delay + chapter.lead / FPS) * FPS);
  const n = String(chapter.num).padStart(2, "0");
  return (
    <Sequence from={from} durationInFrames={Math.round(hold * FPS)} layout="none">
      <div style={{ position: "absolute", left: 64, top: 38, width: 420, height: 30 }}>
        <MaskRevealUp
          text={`${n} / ${CHAPTERS.length}`}
          fontSize={17}
          fontWeight={500}
          color={C.dim}
          tracking="0.02em"
          align="left"
          distance={14}
        />
      </div>
      <div style={{ position: "absolute", left: 64, top: 64, width: 640, height: 84 }}>
        <MaskRevealUp text={chapter.title} fontSize={54} fontWeight={700} color={C.text} tracking="0" align="left" />
      </div>
    </Sequence>
  );
};
