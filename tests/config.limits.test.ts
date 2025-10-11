import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { getLimits, saveLimits, loadLimits, resetLimitsCache } from '../src/config/index.js';

const TEST_CONFIG_FILE = path.resolve(process.cwd(), 'config', 'config.test.json');

describe('Config limits', () => {
  beforeEach(() => {
    // Reset cache before each test
    resetLimitsCache();
    // Clean up test file
    if (fs.existsSync(TEST_CONFIG_FILE)) {
      fs.unlinkSync(TEST_CONFIG_FILE);
    }
  });

  afterEach(() => {
    // Clean up
    resetLimitsCache();
    if (fs.existsSync(TEST_CONFIG_FILE)) {
      fs.unlinkSync(TEST_CONFIG_FILE);
    }
  });

  it('creates default limits on first load', () => {
    const limits = loadLimits();

    expect(limits.min_bet).toBe(1);
    expect(limits.max_bet).toBe(100000);
    expect(limits.faucet_limit).toBe(250);
    expect(limits.public_results).toBe(true);
    expect(limits.give_percent_max).toBe(50);
    expect(limits.admin_give_cap).toBe('1000000000000000');
  });

  it('saves and loads limits', () => {
    saveLimits((l) => {
      l.min_bet = 10;
      l.max_bet = 50000;
      l.give_percent_max = 25;
    });

    const loaded = getLimits();
    expect(loaded.min_bet).toBe(10);
    expect(loaded.max_bet).toBe(50000);
    expect(loaded.give_percent_max).toBe(25);
  });

  it('preserves BigInt admin_give_cap as string', () => {
    saveLimits((l) => {
      l.admin_give_cap = '99999999999999999999';
    });

    const loaded = getLimits();
    expect(loaded.admin_give_cap).toBe('99999999999999999999');
    expect(typeof loaded.admin_give_cap).toBe('string');
  });

  it('persists limits to disk', () => {
    saveLimits((l) => {
      l.faucet_limit = 500;
    });

    // Read directly from file
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'config', 'config.json'), 'utf8');
    const parsed = JSON.parse(raw);

    expect(parsed.limits.faucet_limit).toBe(500);
  });

  it('merges with existing config structure', () => {
    // Write a config with commands section
    const configPath = path.resolve(process.cwd(), 'config', 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      commands: {
        ping: { enabled: true },
        test: { enabled: false }
      }
    }, null, 2));

    // Load limits (should add limits section)
    const limits = loadLimits();
    expect(limits).toBeDefined();

    // Read back and verify both sections exist
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);

    expect(parsed.commands).toBeDefined();
    expect(parsed.commands.ping).toEqual({ enabled: true });
    expect(parsed.limits).toBeDefined();
    expect(parsed.limits.min_bet).toBe(1);
  });
});
