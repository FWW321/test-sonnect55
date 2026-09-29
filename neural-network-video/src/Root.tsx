import { Composition, Folder } from "remotion";
import { Main, Standalone } from "./Main";
import { FPS, H, W } from "./theme";
import { CHAPTERS, TOTAL_FRAMES } from "./timeline";

const pad = (n: number) => String(n).padStart(2, "0");

// Stable component references (one per chapter) so Studio can hot-reload each scene on its own.
const standalones = CHAPTERS.map((chapter) => ({
  chapter,
  Comp: () => <Standalone chapter={chapter} />,
}));

export const RemotionRoot = () => (
  <>
    <Composition
      id="NeuralNetwork"
      component={Main}
      width={W}
      height={H}
      fps={FPS}
      durationInFrames={TOTAL_FRAMES}
    />
    <Folder name="Chapters">
      {standalones.map(({ chapter, Comp }) => (
        <Composition
          key={chapter.id}
          id={`Ch${pad(chapter.num)}-${chapter.id}`}
          component={Comp}
          width={W}
          height={H}
          fps={FPS}
          durationInFrames={chapter.lead + chapter.dur + chapter.tail}
        />
      ))}
    </Folder>
  </>
);
