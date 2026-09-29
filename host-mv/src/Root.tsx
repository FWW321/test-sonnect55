import { Composition, Folder } from "remotion";
import { Main, SectionPreview } from "./Main";
import { FPS, SECTIONS, TOTAL_FRAMES, bt } from "./song";
import { H, W } from "./theme";

const previews = SECTIONS.map((s) => {
  const from = Math.round(bt(s.from) * FPS);
  const dur = Math.round(bt(s.bars) * FPS);
  return { s, from, dur, Comp: () => <SectionPreview fromFrame={from} /> };
});

export const RemotionRoot = () => (
  <>
    <Composition id="Host" component={Main} width={W} height={H} fps={FPS} durationInFrames={TOTAL_FRAMES} defaultProps={{ audio: true }} />
    <Folder name="Sections">
      {previews.map(({ s, dur, Comp }, i) => (
        <Composition key={s.id} id={`S${String(i + 1).padStart(2, "0")}-${s.id}`} component={Comp} width={W} height={H} fps={FPS} durationInFrames={dur} />
      ))}
    </Folder>
  </>
);
