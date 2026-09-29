/**
 * The master timeline: 14 chapters, exactly 18 000 frames (10:00 at 30 fps).
 *
 * onetake's rule — "every beat grows out of the one before" — is enforced here rather than by
 * cross-fades: each chapter is mounted `lead` frames before its nominal start and `tail` frames
 * after its nominal end, so neighbours overlap for OVERLAP frames. Inside that window the two
 * chapters draw the *same carried object at the same pose* (see `carry` below), while everything
 * else fades. The viewer never sees a cut; they see one object turn into the next idea.
 */
export type ChapterId =
  | "pixels"
  | "neuron"
  | "activation"
  | "forward"
  | "space"
  | "loss"
  | "descent"
  | "backprop"
  | "training"
  | "overfit"
  | "conv"
  | "attention"
  | "scale"
  | "epilogue";

export interface ChapterDef {
  id: ChapterId;
  num: number;
  /** On-screen chapter title. */
  title: string;
  /** Nominal start frame on the master timeline. */
  from: number;
  /** Nominal length in frames (the nominal lengths tile the film exactly). */
  dur: number;
  /** Frames the chapter is mounted before `from` (overlap with the previous chapter). */
  lead: number;
  /** Frames the chapter stays mounted after `from + dur`. */
  tail: number;
  /** What survives the hand-off into the next chapter — documented, as onetake demands. */
  carry: string;
}

export const OVERLAP = 45;

const RAW: [ChapterId, string, number, string][] = [
  ["pixels", "像素", 1350, "three pixel values become the inputs of one neuron"],
  ["neuron", "神经元", 1650, "the neuron's activation curve grows into the full-screen plot"],
  ["activation", "激活函数", 1260, "the row of ReLU units becomes a column of neurons — a layer"],
  ["forward", "前向传播", 1800, "the network's last two output neurons become the two classes"],
  ["space", "折叠空间", 1740, "the misclassified points and the loss number"],
  ["loss", "损失", 1080, "the loss surface, with the current parameters marked on it"],
  ["descent", "梯度下降", 1380, "the gradient arrow shrinks into one edge of a computation graph"],
  ["backprop", "反向传播", 2010, "the weight-update rule; edges start to pulse"],
  ["training", "训练", 1320, "the trained decision boundary and the loss curve"],
  ["overfit", "过拟合", 840, "the small 3×3 window of pixels"],
  ["conv", "卷积", 1140, "feature-map cells reflow into a row of tokens"],
  ["attention", "注意力", 1260, "the probability bars collapse into a parameter counter"],
  ["scale", "规模", 660, "one dot in the galaxy zooms back into the very first neuron"],
  ["epilogue", "尾声", 510, ""],
];

export const CHAPTERS: ChapterDef[] = (() => {
  let from = 0;
  return RAW.map(([id, title, dur, carry], i) => {
    const ch: ChapterDef = {
      id,
      num: i + 1,
      title,
      from,
      dur,
      lead: i === 0 ? 0 : OVERLAP,
      tail: i === RAW.length - 1 ? 0 : OVERLAP,
      carry,
    };
    from += dur;
    return ch;
  });
})();

export const TOTAL_FRAMES = CHAPTERS.reduce((s, c) => s + c.dur, 0);
if (TOTAL_FRAMES !== 18000) throw new Error(`timeline must total 18000 frames, got ${TOTAL_FRAMES}`);

export const chapterById = (id: ChapterId) => CHAPTERS.find((c) => c.id === id)!;

/** The chapter whose nominal span contains the master frame `gf`. */
export const chapterAt = (gf: number) =>
  CHAPTERS.find((c) => gf >= c.from && gf < c.from + c.dur) ?? CHAPTERS[CHAPTERS.length - 1];
