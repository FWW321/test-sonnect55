import { Canvas } from "../lib/canvas";
import { H, W } from "../theme";

/**
 * A faint dot lattice whose brightness drifts like slow activity in a sheet of neurons.
 * Neutral, ≤ 10 % alpha, no colour — remocn's "restrained dynamic backdrop" rule.
 */
export const Backdrop: React.FC = () => (
  <Canvas
    draw={({ ctx, gf }) => {
      const t = gf / 30;
      for (let y = 20; y < H; y += 32) {
        for (let x = 20; x < W; x += 32) {
          const w = Math.sin(x * 0.0085 + t * 0.42) * Math.sin(y * 0.011 - t * 0.31);
          const a = 0.03 + 0.055 * Math.max(0, w) ** 2;
          ctx.fillStyle = `rgba(165,190,230,${a.toFixed(3)})`;
          ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
        }
      }
    }}
  />
);
