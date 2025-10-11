/**
 * Split an array of text lines into pages that fit within Discord message limits.
 *
 * @param lines - Array of text lines to paginate
 * @param max - Maximum characters per page (default 1900 to stay under 2000 limit with buffer)
 * @returns Array of page strings, each joined with newlines
 */
export function chunkLines(lines: string[], max = 1900): string[] {
  const pages: string[] = [];
  let cur: string[] = [];
  let len = 0;

  for (const line of lines) {
    const add = line.length + 1; // +1 for newline
    if (len + add > max && cur.length > 0) {
      // Current page is full, push it and start a new one
      pages.push(cur.join("\n"));
      cur = [line];
      len = add;
    } else {
      cur.push(line);
      len += add;
    }
  }

  // Push remaining lines
  if (cur.length) {
    pages.push(cur.join("\n"));
  }

  return pages;
}
