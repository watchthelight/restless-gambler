import fs from 'node:fs';
import path from 'node:path';

export type Limits = {
  min_bet: number;
  max_bet: number;
  faucet_limit: number;
  public_results: boolean;
  give_percent_max: number;
  admin_give_cap: string; // BigInt-capable
};

export type AppConfig = {
  limits?: Limits;
  commands?: Record<string, any>; // Command toggles (managed by toggles.ts)
  [key: string]: any; // Allow other config sections
};

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
