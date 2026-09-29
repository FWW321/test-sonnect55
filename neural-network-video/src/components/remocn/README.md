# remocn components used in this film

These files were installed the way the shadcn-style [remocn](https://github.com/Remocn/remocn)
registry installs them — copied into the project so the code is ours to adapt. remocn is MIT
licensed; see [`LICENSE`](./LICENSE).

| Component | Where it is used | Local patches |
|---|---|---|
| `mask-reveal-up` | chapter title cards (`ui/ChapterCard.tsx`) | `tracking` + `align` props — CJK glyphs want default tracking, and the card sits at the left edge |
| `soft-blur-in` | the film title and the closing title | `tracking` + `align` props (same reason) |
| `rolling-number` | the parameter odometer in *规模* | JetBrains Mono comes from the bundled `public/fonts` instead of `@remotion/google-fonts` |
| `glass-code-block` | the 8-line training loop in *训练* | Python keywords, `#` comments (also trailing), an `activeLine` prop that dims the other lines and marks the one being narrated, palette limited to the film's cyan/orange, `backdrop-filter` and the large drop shadow removed |
| `animated-line-chart` | the loss curve in *训练* | `progress` prop so the draw-on follows the training step instead of an internal spring, `gridCols` prop, glow filters removed |

Everything that is *not* a prebuilt component — captions, chapter chrome, formulas — follows the
remocn craft rules (`design-defaults`, `motion-principles`, `anti-patterns`): default tracking, one
solid text colour, no gradient text, no glow behind type, staggered entrances, ease-out curves
(`cubic-bezier(0.22, 1, 0.36, 1)` is remocn's house curve and is reused in `lib/math.ts`).
