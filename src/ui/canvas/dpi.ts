/** Helpers for deterministic pixel sizing in images. */
export const DPR = 2; // fixed for Discord-friendly sharp outputs

export function css(px: number): number {
  return Math.round(px);
}

export function dev(px: number): number {
  return Math.round(px * DPR);
}
