/**
 * Sanitize user input to prevent mass mentions and code fence escaping.
 * Used by bugreport and other systems that display user-provided text.
 */
export function sanitize(s: string): string {
  return (s ?? '')
    .replaceAll(/@everyone/g, '@\u200Beveryone')
    .replaceAll(/@here/g, '@\u200Bhere')
    .replaceAll(/```/g, '\u200B```')
    .slice(0, 1024);
}
