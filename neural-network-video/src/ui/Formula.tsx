import katex from "katex";
import { CSSProperties, useId } from "react";
import { C } from "../theme";

const cache = new Map<string, string>();
const render = (tex: string) => {
  let html = cache.get(tex);
  if (!html) {
    html = katex.renderToString(tex, {
      throwOnError: false,
      displayMode: false,
      output: "html",
      strict: "ignore",
      trust: (ctx) => ctx.command === "\\htmlClass",
    });
    cache.set(tex, html);
  }
  return html;
};

export interface TermStyle {
  /** 0–1 opacity of this `\htmlClass{name}{…}` group. */
  o?: number;
  /** Override colour (e.g. the film's cyan / orange for the term being explained). */
  c?: string;
}

export interface FormulaProps {
  /** KaTeX source. Tag sub-expressions with \htmlClass{name}{…} to style them individually. */
  tex: string;
  size?: number;
  color?: string;
  terms?: Record<string, TermStyle>;
  style?: CSSProperties;
}

/** Typeset maths whose parts can light up one by one — the backbone of the derivation scenes. */
export const Formula: React.FC<FormulaProps> = ({ tex, size = 40, color = C.text, terms = {}, style }) => {
  const uid = "fx" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const css = Object.entries(terms)
    .map(
      ([k, v]) =>
        `.${uid} .${k}{opacity:${v.o ?? 1};${v.c ? `color:${v.c};` : ""}}`,
    )
    .join("");
  return (
    <div className={uid} style={{ fontSize: size, color, whiteSpace: "nowrap", lineHeight: 1.2, ...style }}>
      <style>{css}</style>
      <span dangerouslySetInnerHTML={{ __html: render(tex) }} />
    </div>
  );
};
