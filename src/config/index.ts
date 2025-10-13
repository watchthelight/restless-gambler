import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export type Limits = {
  min_bet: number;
  max_bet: number;
  faucet_limit: number;
  public_results: boolean;
  give_percent_max: number;
  admin_give_cap: string; // BigInt-capable
};

export type ConcurrencyConfig = {
  targetCpuThreads: number;
  clusterWorkers: number;
  workerPoolSize: number;
  shards: string | number;
  sqlite: {
    wal: boolean;
    busyTimeoutMs: number;
    cacheMB: number;
    mmapMB: number;
  };
  ramdisk: {
    enabled: boolean;
    path: string;
  };
};

export type AppConfig = {
  limits?: Limits;
  concurrency?: ConcurrencyConfig;
  commands?: Record<string, any>; // Command toggles (managed by toggles.ts)
  [key: string]: any; // Allow other config sections
};

const concurrencySchema = z.object({
  targetCpuThreads: z.number().int().positive(),
  clusterWorkers: z.number().int().min(0),
  workerPoolSize: z.number().int().min(0),
  shards: z.union([z.string(), z.number()]),
  sqlite: z.object({
    wal: z.boolean(),
    busyTimeoutMs: z.number().int().min(0),
    cacheMB: z.number().int().min(0),
    mmapMB: z.number().int().min(0),
  }),
  ramdisk: z.object({
    enabled: z.boolean(),
    path: z.string(),
  }),
}).strict();

const FILE = path.resolve(process.cwd(), 'config', 'config.json');
let cfg: AppConfig | null = null;

// For testing: reset the cache
export function resetLimitsCache() {
  cfg = null;
}

export function loadLimits(): Limits {
  const defaultLimits = {
    min_bet: 1,
    max_bet: 100000,
    faucet_limit: 250,
    public_results: true,
    give_percent_max: 50,
    admin_give_cap: "1000000000000000"
  };

  if (cfg && cfg.limits) return cfg.limits;

  if (!fs.existsSync(FILE)) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const bootstrap: AppConfig = { limits: defaultLimits };
    fs.writeFileSync(FILE, JSON.stringify(bootstrap, null, 2) + '\n');
    cfg = bootstrap;
    return cfg.limits!;
  }

  const raw = fs.readFileSync(FILE, 'utf8');
  const parsed = JSON.parse(raw) as AppConfig;

  // Ensure limits exist, merge with defaults
  if (!parsed.limits) {
    parsed.limits = defaultLimits;
    fs.writeFileSync(FILE, JSON.stringify(parsed, null, 2) + '\n');
  }
  cfg = parsed;
  return parsed.limits;
}

export function getLimits(): Limits {
  if (!cfg || !cfg.limits) return loadLimits();
  return cfg.limits;
}

export function saveLimits(mutator: (limits: Limits) => void) {
  const current = getLimits();
  const next = { ...current };
  mutator(next);

  // Read full config, update limits section only
  const raw = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '{}';
  const full = JSON.parse(raw);
  full.limits = next;

  fs.writeFileSync(FILE, JSON.stringify(full, null, 2) + '\n');
  if (cfg) cfg.limits = next;
}

export function loadConcurrency(): ConcurrencyConfig {
  const defaultConcurrency: ConcurrencyConfig = {
    targetCpuThreads: 12,
    clusterWorkers: 4,
    workerPoolSize: 8,
    shards: "auto",
    sqlite: {
      wal: true,
      busyTimeoutMs: 5000,
      cacheMB: 512,
      mmapMB: 512,
    },
    ramdisk: {
      enabled: false,
      path: "",
    },
  };

  if (cfg && cfg.concurrency) return cfg.concurrency;

  if (!fs.existsSync(FILE)) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const bootstrap: AppConfig = { concurrency: defaultConcurrency };
    fs.writeFileSync(FILE, JSON.stringify(bootstrap, null, 2) + '\n');
    cfg = bootstrap;
    return cfg.concurrency!;
  }

  const raw = fs.readFileSync(FILE, 'utf8');
  const parsed = JSON.parse(raw) as AppConfig;

  // Ensure concurrency exists, merge with defaults
  if (!parsed.concurrency) {
    parsed.concurrency = defaultConcurrency;
    fs.writeFileSync(FILE, JSON.stringify(parsed, null, 2) + '\n');
  }
  cfg = parsed;
  return parsed.concurrency;
}

export function getConcurrency(): ConcurrencyConfig {
  if (!cfg || !cfg.concurrency) return loadConcurrency();
  return cfg.concurrency;
}

export function validateConcurrency(config: ConcurrencyConfig): ConcurrencyConfig {
  // Apply env overrides
  const envOverrides = {
    targetCpuThreads: process.env.RG_CPU_THREADS ? parseInt(process.env.RG_CPU_THREADS, 10) : config.targetCpuThreads,
    clusterWorkers: process.env.RG_CLUSTER_WORKERS ? parseInt(process.env.RG_CLUSTER_WORKERS, 10) : config.clusterWorkers,
    workerPoolSize: process.env.RG_WORKER_POOL_SIZE ? parseInt(process.env.RG_WORKER_POOL_SIZE, 10) : config.workerPoolSize,
  };

  // Validate with zod
  const validated = concurrencySchema.parse({ ...config, ...envOverrides });

  // Runtime assertion for thread cap
  if (validated.clusterWorkers + validated.workerPoolSize > validated.targetCpuThreads) {
    const clampedWorkers = Math.min(validated.clusterWorkers, validated.targetCpuThreads - validated.workerPoolSize);
    const clampedPool = Math.min(validated.workerPoolSize, validated.targetCpuThreads - validated.clusterWorkers);
    console.warn(`[WARNING] CPU thread cap exceeded: clusterWorkers=${validated.clusterWorkers} + workerPoolSize=${validated.workerPoolSize} > targetCpuThreads=${validated.targetCpuThreads}`);
    console.warn(`[WARNING] Auto-clamping: clusterWorkers=${clampedWorkers}, workerPoolSize=${clampedPool}`);
    validated.clusterWorkers = clampedWorkers;
    validated.workerPoolSize = clampedPool;
  }

  return validated;
}
