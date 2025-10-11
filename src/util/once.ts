const seen = new Set<string>();

export function markOnce(key: string): boolean {
  if (seen.has(key)) return true;
  seen.add(key);
  // Lightweight GC: drop after 30 minutes
  setTimeout(() => { seen.delete(key); }, 30 * 60 * 1000).unref?.();
  return false;
}

