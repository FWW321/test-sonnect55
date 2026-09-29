import { AbsoluteFill, Audio, staticFile } from "remotion";
import { drawFilm } from "./film";
import { FilmCanvas } from "./lib/canvas";
import { C } from "./theme";

export type MainProps = {
  /** Include the score (public/audio/host.m4a, made by `npm run score`). */
  audio: boolean;
};

/** The whole film: one canvas, redrawn from the master clock, over the score. */
export const Main: React.FC<MainProps> = ({ audio }) => (
  <AbsoluteFill style={{ background: C.black }}>
    {audio && <Audio src={staticFile("audio/host.m4a")} />}
    <FilmCanvas draw={drawFilm} />
  </AbsoluteFill>
);

/** One section on its own (for Studio and QA), still drawn from the master clock. */
export const SectionPreview: React.FC<{ fromFrame: number }> = ({ fromFrame }) => (
  <AbsoluteFill style={{ background: C.black }}>
    <FilmCanvas draw={drawFilm} offset={fromFrame} />
  </AbsoluteFill>
);
