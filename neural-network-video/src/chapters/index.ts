import type { FC } from "react";
import type { ChapterId } from "../timeline";
import { Ch01Pixels } from "./Ch01Pixels";
import { Stub } from "./Stub";

/** Chapter id → scene component. Each scene is a pure function of the master frame. */
export const CHAPTER_COMPONENTS: Record<ChapterId, FC> = {
  pixels: Ch01Pixels,
  neuron: Stub,
  activation: Stub,
  forward: Stub,
  space: Stub,
  loss: Stub,
  descent: Stub,
  backprop: Stub,
  training: Stub,
  overfit: Stub,
  conv: Stub,
  attention: Stub,
  scale: Stub,
  epilogue: Stub,
};
