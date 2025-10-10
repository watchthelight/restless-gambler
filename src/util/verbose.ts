export const VERBOSE: boolean = process.env.VERBOSE === '1' || process.env.DEBUG === '1';

export function vlog(payload: any): void {
  if (!VERBOSE) return;
  const base: any = { msg: 'debug', ts: Date.now(), pid: process.pid };
  if (typeof payload === 'string') {
    base.text = payload;
  } else if (payload && typeof payload === 'object') {
    Object.assign(base, payload);
  } else {
    base.text = String(payload);
  }
  try { console.log(JSON.stringify(base)); } catch { /* ignore */ }
}

