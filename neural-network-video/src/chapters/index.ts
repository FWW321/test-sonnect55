import type { FC } from "react";
import type { ChapterId } from "../timeline";
import { Ch01Pixels } from "./Ch01Pixels";
import { Ch02Neuron } from "./Ch02Neuron";
import { Ch03Activation } from "./Ch03Activation";
import { Ch04Forward } from "./Ch04Forward";
import { Ch05Space } from "./Ch05Space";
import { Ch06Loss } from "./Ch06Loss";
import { Ch07Descent } from "./Ch07Descent";
import { Ch08Backprop } from "./Ch08Backprop";
import { Ch09Training } from "./Ch09Training";
import { Ch10Overfit } from "./Ch10Overfit";
import { Ch11Conv } from "./Ch11Conv";
import { Stub } from "./Stub";

/** Chapter id → scene component. Each scene is a pure function of the master frame. */
export const CHAPTER_COMPONENTS: Record<ChapterId, FC> = {
  pixels: Ch01Pixels,
  neuron: Ch02Neuron,
  activation: Ch03Activation,
  forward: Ch04Forward,
  space: Ch05Space,
  loss: Ch06Loss,
  descent: Ch07Descent,
  backprop: Ch08Backprop,
  training: Ch09Training,
  overfit: Ch10Overfit,
  conv: Ch11Conv,
  attention: Stub,
  scale: Stub,
  epilogue: Stub,
};
