import { FONT_MONO } from "../fonts";
import { seg, ease } from "../lib/math";
import { useGF } from "../lib/time";
import { C, FPS, W } from "../theme";
import { CHAPTERS, TOTAL_FRAMES, chapterAt } from "../timeline";

const pad = (n: number) => String(n).padStart(2, "0");
const tc = (frames: number) => {
  const s = Math.floor(frames / FPS);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

/**
 * The only persistent furniture: current chapter + timecode (top right) and a hairline progress
 * bar with a tick at every chapter boundary. It stays out of the way of the cold open and the
 * closing title.
 */
export const Chrome: React.FC = () => {
  const gf = useGF();
  const ch = chapterAt(gf);
  const vis = seg(gf, 90, 150, ease.inOutSine) * (1 - seg(gf, TOTAL_FRAMES - 260, TOTAL_FRAMES - 200, ease.inOutSine));
  return (
    <div style={{ position: "absolute", inset: 0, opacity: vis, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          right: 34,
          top: 24,
          display: "flex",
          gap: 12,
          fontFamily: FONT_MONO,
          fontSize: 13,
          fontWeight: 500,
          color: C.faint,
          // a quiet plate keeps the label legible when a scene runs underneath it
          padding: "5px 10px",
          borderRadius: 7,
          background: "rgba(7,9,13,0.72)",
        }}
      >
        <span>{pad(ch.num)}</span>
        <span>{ch.title}</span>
        <span style={{ color: "#3c4556" }}>·</span>
        <span>
          {tc(gf)} / {tc(TOTAL_FRAMES)}
        </span>
      </div>
      <div style={{ position: "absolute", left: 0, bottom: 0, width: W, height: 3, background: "rgba(255,255,255,0.05)" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: 3,
            width: (W * gf) / TOTAL_FRAMES,
            background: C.pos,
            opacity: 0.7,
          }}
        />
        {CHAPTERS.slice(1).map((c) => (
          <div
            key={c.id}
            style={{
              position: "absolute",
              left: (W * c.from) / TOTAL_FRAMES,
              top: -4,
              width: 1,
              height: 7,
              background: "rgba(255,255,255,0.22)",
            }}
          />
        ))}
      </div>
    </div>
  );
};
