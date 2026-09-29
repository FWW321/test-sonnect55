import { Formula } from "./Formula";

/**
 * The weight-update rule, centred. Chapter 8 ends on it and chapter 9 opens on it, so both draw it
 * through this one component: same size, same position, one object across the cut.
 */
export const UpdateRule: React.FC<{ opacity?: number; size?: number; top?: number }> = ({ opacity = 1, size = 64, top = 286 }) => (
  <div style={{ position: "absolute", left: 0, width: 1280, top, display: "flex", justifyContent: "center", opacity }}>
    <Formula tex={String.raw`w\leftarrow w-\eta\,\dfrac{\partial L}{\partial w}`} size={size} />
  </div>
);
