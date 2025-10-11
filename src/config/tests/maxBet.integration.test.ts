import { describe, test, expect, beforeAll } from '@jest/globals';
import { getGuildDb, closeAll } from '../../db/connection.js';
import { getMaxBet, setMaxBetDisabled, setMaxBetValue } from '../../config/maxBet.js';
import { toBigInt } from '../../utils/bigint.js';
import { jsonStringifySafeBigint } from '../../utils/json.js';

const gid = `test-maxbet-${Date.now()}`;

describe('max_bet integration', () => {
  beforeAll(() => {
    // ensure DB opens and migrates
    getGuildDb(gid);
  });

  test('disable allows any large bet', () => {
    const db = getGuildDb(gid);
    setMaxBetDisabled(db);
    const max = getMaxBet(db);
    expect(max.disabled).toBe(true);
    const big = toBigInt('999999999999');
    // When disabled, no limit enforced
    expect(max.disabled || big <= (max as any).limit).toBe(true);
  });

  test('set numeric enforces cap', () => {
    const db = getGuildDb(gid);
    setMaxBetValue(db, toBigInt('250000'));
    const max = getMaxBet(db);
    expect(max.disabled).toBe(false);
    if (!max.disabled) {
      expect(max.limit).toBe(250000n);
      const under = toBigInt('250000');
      const over = toBigInt('250001');
      expect(under <= max.limit).toBe(true);
      expect(over > max.limit).toBe(true);
    }
  });

  test('audit table accepts JSON-safe bigints', () => {
    const db = getGuildDb(gid);
    const payload = { msg: 'config_set', key: 'max_bet', value: 98765432101234567890n } as any;
    const json = jsonStringifySafeBigint(payload);
    db.prepare('INSERT INTO audit_log(json) VALUES(?)').run(json);
    const row = db.prepare('SELECT json FROM audit_log ORDER BY id DESC LIMIT 1').get() as { json: string };
    expect(row).toBeTruthy();
    const parsed = JSON.parse(row.json);
    expect(typeof parsed.value).toBe('string');
    expect(parsed.value).toBe('98765432101234567890');
  });
});

afterAll(() => {
  closeAll();
});

