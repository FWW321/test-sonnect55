import { FONT_CJK } from "../fonts";
import { useChapterClock } from "../lib/time";
import { clamp, ease } from "../lib/math";
import { SCRIPT } from "../script";
import { C, FPS, W } from "../theme";

/**
 * Narration, as on-screen text. Markup: **cyan emphasis**, !!orange emphasis!!, "\n" for a break.
 * Motion follows remocn's craft rules: sentence-case/default tracking, solid colour, characters
 * rise 10 px with a soft blur on the house ease-out curve (0.22, 1, 0.36, 1), staggered by one
 * frame each, and the line leaves upward on a faster ease-in. One caption on screen at a time.
 */
interface Seg {
  text: string;
  kind: "plain" | "pos" | "neg";
}

const parse = (src: string): Seg[] => {
  const out: Seg[] = [];
  const re = /\*\*(.+?)\*\*|!!(.+?)!!/gs;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index), kind: "plain" });
    out.push({ text: m[1] ?? m[2], kind: m[1] !== undefined ? "pos" : "neg" });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last), kind: "plain" });
  return out;
};

const KIND_COLOR = { plain: C.text, pos: C.pos, neg: C.neg } as const;

export const Captions: React.FC = () => {
  const { t, chapter } = useChapterClock();
  const lines = SCRIPT[chapter.id] ?? [];
  const cur = lines.find((l) => t >= l.at && t < l.at + l.dur);
  if (!cur) return null;

  const f = (t - cur.at) * FPS; // frames into this caption
  const total = cur.dur * FPS;
  const segs = parse(cur.text);
  const chars: { ch: string; kind: Seg["kind"] }[] = [];
  for (const s of segs) for (const ch of Array.from(s.text)) chars.push({ ch, kind: s.kind });

  const exitP = ease.in(clamp((f - (total - 12)) / 12));
  let idx = 0;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        // bottom-anchored so a two-line caption grows upward instead of off the frame
        bottom: 30,
        width: W,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
        textAlign: "center",
        fontFamily: FONT_CJK,
        fontSize: 31,
        fontWeight: 500,
        lineHeight: 1.42,
        whiteSpace: "pre",
        opacity: 1 - exitP,
        translate: `0 ${-exitP * 8}px`,
      }}
    >
      <div>
        {chars.map(({ ch, kind }, i) => {
          if (ch === "\n") return <br key={i} />;
          const local = f - idx * 1.15;
          idx++;
          const p = ease.soft(clamp(local / 26));
          const settled = p >= 0.999;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                whiteSpace: "pre",
                color: KIND_COLOR[kind],
                fontWeight: kind === "plain" ? 500 : 700,
                opacity: p,
                translate: `0 ${(1 - p) * 10}px`,
                filter: settled ? undefined : `blur(${(1 - p) * 7}px)`,
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
    </div>
  );
};
