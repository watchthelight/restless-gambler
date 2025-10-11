import { getScore } from '../../src/loans/credit.js';
import { schedule } from '../../src/loans/calculator.js';
import { createAndCredit } from '../../src/loans/store.js';

export async function runLoanApply(
  guildId: string,
  userId: string,
  principal: number,
  aprBps: number,
  termDays: number,
): Promise<{ ok: boolean }> {
  const score = getScore(guildId, userId);
  const offers = schedule([principal], score);
  const match = offers.find(
    (o) => o.principal === principal && o.aprBps === aprBps && o.termDays === termDays,
  );
  if (!match) return { ok: false };
  await createAndCredit(guildId, userId, principal, aprBps, termDays);
  return { ok: true };
}

