type Release = () => void;

class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<Release> {
    return new Promise<Release>((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private release() {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

export class KeyedMutexes {
  private map = new Map<string, Mutex>();

  private get(key: string): Mutex {
    let m = this.map.get(key);
    if (!m) {
      m = new Mutex();
      this.map.set(key, m);
    }
    return m;
  }

  async runExclusive<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const m = this.get(key);
    return m.runExclusive(fn);
  }
}

export const userLocks = new KeyedMutexes();
export const channelLocks = new KeyedMutexes();

// Lightweight promise-chaining lock compatible with ad-hoc keys
const _locks = new Map<string, Promise<void>>();
export async function withLock(key: string, fn: () => Promise<void>) {
  const prev = _locks.get(key) ?? Promise.resolve();
  let release: () => void = () => {};
  const next = prev.then(async () => {
    try { await fn(); } finally { release(); }
  });
  _locks.set(key, next);
  await new Promise<void>((res) => { release = () => { _locks.delete(key); res(); }; });
}
