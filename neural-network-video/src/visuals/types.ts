export type CanvasRenderingContext2DLike = CanvasRenderingContext2D;

export interface NeuronStyle {
  /** Firing strength 0–1. */
  act?: number;
  alpha?: number;
  /** Draw the Σ | f glyph (default true). */
  glyph?: boolean;
  /** Text for the activation half of the glyph. */
  fLabel?: string;
}
