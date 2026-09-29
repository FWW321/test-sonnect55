/**
 * Canonical datasets for the film's toy problems. Both the offline trainer (scripts/train-toys.ts)
 * and the renderer call these, so they always agree; `check` is a fingerprint stored with the
 * trained weights to catch drift.
 */
import { circles, twoSpirals } from "./datasets";

export const SPIRAL_TURNS = 0.9;
export const RUN_NOISE = 0.07;
export const RUN_TURNS = 1.5;

export const TOY = {
  circles: () => circles(150, 0.03, 3),
  /** The "untangling" spirals of chapter 5: a bit under one full turn, so 2-wide layers can unwind them. */
  spirals: () => twoSpirals(100, 0.03, 5, SPIRAL_TURNS),
  /** Chapters 9–10: noisy, more wound spirals; one network is trained on them live, then over-trained. */
  spiralsTrain: () => twoSpirals(110, RUN_NOISE, 11, RUN_TURNS),
  /** Fresh points from the same distribution — what the network has never seen (chapter 10). */
  spiralsTest: () => twoSpirals(300, RUN_NOISE, 1011, RUN_TURNS),
  /** Fingerprint of a point set: any change to a generator changes it. */
  check: (X: ArrayLike<ArrayLike<number>>) => {
    let s = 0;
    for (let i = 0; i < X.length; i++) s += (X[i][0] * 31.7 + X[i][1] * 17.3) * ((i % 7) + 1);
    return +s.toFixed(6);
  },
};
