/**
 * Canonical datasets for the film's toy problems. Both the offline trainer (scripts/train-toys.ts)
 * and the renderer call these, so they always agree; `check` is a fingerprint stored with the
 * trained weights to catch drift.
 */
import { circles, twoSpirals } from "./datasets";

export const SPIRAL_TURNS = 0.9;

export const TOY = {
  circles: () => circles(150, 0.03, 3),
  /** The "untangling" spirals of chapter 5: a bit under one full turn, so 2-wide layers can unwind them. */
  spirals: () => twoSpirals(100, 0.03, 5, SPIRAL_TURNS),
  /** The harder, more wound spirals of chapter 9 (a wider network learns them live). */
  spiralsTrain: () => twoSpirals(110, 0.04, 11, 1.75),
  /** Fingerprint of a point set: any change to a generator changes it. */
  check: (X: ArrayLike<ArrayLike<number>>) => {
    let s = 0;
    for (let i = 0; i < X.length; i++) s += (X[i][0] * 31.7 + X[i][1] * 17.3) * ((i % 7) + 1);
    return +s.toFixed(6);
  },
};
