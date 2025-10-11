import { getGuildDb } from '../../src/db/connection.js';
import { getCommandControl } from '../../src/db/commandControl.js';

describe('Migrations: balances TEXT and command_control', () => {
  const gid = 'migrate-text';

  it('balances.balance is TEXT and command_control seeds', () => {
    const db = getGuildDb(gid);
    const cols = db.prepare("PRAGMA table_info(balances)").all() as Array<{ name: string; type: string }>;
    const balanceCol = cols.find(c => c.name === 'balance');
    expect(balanceCol).toBeTruthy();
    expect((balanceCol as any).type?.toUpperCase?.()).toBe('TEXT');

    const cc = getCommandControl(db, gid);
    expect(cc.guild_id).toBe(gid);
    expect(cc.mode === 'normal' || cc.mode === 'whitelist').toBe(true);
  });
});

