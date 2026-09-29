import { RollingNumber } from "../components/remocn/rolling-number";
import { C } from "../theme";

/**
 * The film's parameter counter. Chapter 12 ends on it (13 002) and chapter 13 opens on it, then drives it up to
 * 175 billion — both go through this component so it is the same object on both sides of the cut. Twelve wheels are
 * laid out from the start, so the number sits at the right and grows leftwards, like an odometer.
 */
export const COUNTER_DIGITS = 12;
export const ParamCounter: React.FC<{ value: number; opacity?: number; fontSize?: number; color?: string }> = ({ value, opacity = 1, fontSize = 104, color = C.text }) => (
  <div style={{ position: "absolute", left: 0, top: -34, width: 1280, height: 720, opacity }}>
    <RollingNumber value={value} digits={COUNTER_DIGITS} fontSize={fontSize} color={color} />
  </div>
);
