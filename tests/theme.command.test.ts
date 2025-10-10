import { data } from '../src/commands/slash/theme.js';

describe('theme slash command', () => {
  it('includes get, set, cards-style subcommands', () => {
    const json: any = (data as any).toJSON();
    const subs = (json.options || []).map((o: any) => o.name).sort();
    expect(subs).toEqual(expect.arrayContaining(['get', 'set', 'cards-style']));
  });
});

