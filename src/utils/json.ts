export function jsonStringifySafeBigint(obj: unknown): string {
  return JSON.stringify(obj, (_, val) => (typeof val === 'bigint' ? val.toString() : val));
}

