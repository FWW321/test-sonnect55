import { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { FONT_CJK, FONT_MONO } from "./fonts";
import { C } from "./theme";
import { Backdrop } from "./ui/Backdrop";
import { Chrome } from "./ui/Chrome";

/**
 * The persistent layer: backdrop, persistent chrome, and the CSS variables that make the
 * prebuilt remocn components (which read `--font-geist-sans` / `--font-geist-mono`) use the
 * film's own bundled fonts.
 */
export const Stage: React.FC<{ children?: ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={
      {
        background: C.bg,
        color: C.text,
        fontFamily: FONT_CJK,
        "--font-geist-sans": FONT_CJK,
        "--font-geist-mono": FONT_MONO,
      } as CSSProperties
    }
  >
    <Backdrop />
    {children}
    <Chrome />
  </AbsoluteFill>
);
