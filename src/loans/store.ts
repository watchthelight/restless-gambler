import { getGuildDb } from '../db/connection.js';
import { isTestEnv } from '../util/env.js';
import { userLocks } from '../util/locks.js';
import { adjustBalance } from '../economy/wallet.js';
import { accrueInterest, pay as payCalc, status as statusCalc } from './calculator.js';
import { Loan, LoanStatus } from './types.js';

function toLoan(row: any): Loan {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    principal: BigInt(row.principal || 0),
    apr_bps: Number(row.apr_bps || 0),
    term_days: Number(row.term_days || 0),
    start_ts: Number(row.start_ts || 0),
    due_ts: Number(row.due_ts || 0),
    accrued_interest: BigInt(row.accrued_interest || 0),
    paid_principal: BigInt(row.paid_principal || 0),
    paid_interest: BigInt(row.paid_interest || 0),
    status: String(row.status || 'active') as LoanStatus,
    last_accrual_ts: Number(row.last_accrual_ts || row.start_ts || 0),
    created_at: Number(row.created_at || 0),
  };
}

import { randomBytes } from 'node:crypto';
function genId(): string {
  const r = randomBytes(9);
  return r.toString('base64url');
}

export function listUserLoans(guildId: string, userId: string): Loan[] {
  const db = getGuildDb(guildId);
  const rows = db.prepare('SELECT * FROM loans WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
  return rows.map(toLoan);
}

export function getActiveLoans(guildId: string, userId: string): Loan[] {
  const db = getGuildDb(guildId);
  const rows = db.prepare("SELECT * FROM loans WHERE user_id = ? AND status IN ('active','late','defaulted') ORDER BY created_at ASC").all(userId) as any[];
  return rows.map(toLoan);
}

export function getLoanById(guildId: string, id: string): Loan | null {
  const db = getGuildDb(guildId);
  const row = db.prepare('SELECT * FROM loans WHERE id = ?').get(id) as any;
  return row ? toLoan(row) : null;
}

export function createLoan(guildId: string, userId: string, principal: number, aprBps: number, termDays: number, now: number = Date.now()): Loan {
  const db = getGuildDb(guildId);
  const id = genId();
  const start = now;
  const due = start + termDays * 86_400_000;
  const created = now;
  db.prepare('INSERT INTO loans(id,user_id,principal,apr_bps,term_days,start_ts,due_ts,accrued_interest,paid_principal,paid_interest,status,last_accrual_ts,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, userId, principal, aprBps, termDays, start, due, 0, 0, 0, 'active', start, created);
  const loan = getLoanById(guildId, id)!;
  if (!isTestEnv()) console.log(JSON.stringify({ msg: 'loan_created', loanId: id, userId, principal }));
  return loan;
}

export function updateLoan(guildId: string, loan: Loan): void {
  const db = getGuildDb(guildId);
  db.prepare('UPDATE loans SET principal=?, apr_bps=?, term_days=?, start_ts=?, due_ts=?, accrued_interest=?, paid_principal=?, paid_interest=?, status=?, last_accrual_ts=? WHERE id = ?')
    .run(Number(loan.principal), loan.apr_bps, loan.term_days, loan.start_ts, loan.due_ts, Number(loan.accrued_interest), Number(loan.paid_principal), Number(loan.paid_interest), loan.status, loan.last_accrual_ts, loan.id);
}

export function markStatus(guildId: string, loanId: string, st: LoanStatus): void {
  const db = getGuildDb(guildId);
  db.prepare('UPDATE loans SET status = ? WHERE id = ?').run(st, loanId);
}

export function accrueOnTouch(guildId: string, loan: Loan, now: number = Date.now()): Loan {
  const { interestDelta, updates } = accrueInterest(loan, now);
  if (interestDelta > 0n || Object.keys(updates).length) {
    const merged: Loan = { ...loan, ...updates } as Loan;
    updateLoan(guildId, merged);
    if (!isTestEnv()) console.log(JSON.stringify({ msg: 'loan_accrued', loanId: loan.id, interestDelta: Number(interestDelta) }));
    return merged;
  }
  return loan;
}

export async function createAndCredit(guildId: string, userId: string, principal: number, aprBps: number, termDays: number): Promise<Loan> {
  // Avoid deadlock: adjustBalance already locks on wallet key; do not wrap with the same lock here.
  const loan = createLoan(guildId, userId, principal, aprBps, termDays);
  await adjustBalance(guildId, userId, principal, 'loan:principal');
  return loan;
}

export function applyPayment(guildId: string, loan: Loan, amount: number): { loan: Loan; paidInterest: bigint; paidPrincipal: bigint; remaining: bigint } {
  const split = payCalc(loan, amount);
  const next: Loan = { ...loan, paid_interest: loan.paid_interest + split.paidInterest, paid_principal: loan.paid_principal + split.paidPrincipal };
  const st = statusCalc(next);
  next.status = st;
  updateLoan(guildId, next);
  if (!isTestEnv()) console.log(JSON.stringify({ msg: 'loan_payment', loanId: loan.id, paidInterest: Number(split.paidInterest), paidPrincipal: Number(split.paidPrincipal), remaining: Number(split.remaining) }));
  if (!isTestEnv() && st !== loan.status) console.log(JSON.stringify({ msg: 'loan_status', loanId: loan.id, status: st }));
  return { loan: next, ...split };
}

export function forgiveAll(guildId: string, userId: string): number {
  const db = getGuildDb(guildId);
  const now = Date.now();
  const rows = db.prepare("SELECT id FROM loans WHERE user_id = ? AND status <> 'forgiven'").all(userId) as any[];
  for (const r of rows) {
    db.prepare("UPDATE loans SET status='forgiven', accrued_interest=0, paid_interest=0, paid_principal=principal, last_accrual_ts=?, due_ts=? WHERE id = ?")
      .run(now, now, r.id);
    if (!isTestEnv()) console.log(JSON.stringify({ msg: 'loan_status', loanId: r.id, status: 'forgiven' }));
  }
  return rows.length;
}

export function kickoffStartupAccrualSweep(): void {
  setTimeout(() => {
    try {
      const fs = require('node:fs') as typeof import('node:fs');
      const path = require('node:path') as typeof import('node:path');
      const { getDbPaths, getGuildDb } = require('../db/connection.js') as typeof import('../db/connection.js');
      const { data_dir } = getDbPaths();
      if (!fs.existsSync(data_dir)) return;
      for (const f of fs.readdirSync(data_dir)) {
        if (!f.endsWith('.db')) continue;
        const gid = path.basename(f, '.db');
        const db = getGuildDb(gid);
        const threeDays = 3 * 86_400_000;
        const now = Date.now();
        const rows = db.prepare('SELECT * FROM loans WHERE (? - last_accrual_ts) > ? AND status IN (\'active\',\'late\',\'defaulted\')').all(now, threeDays) as any[];
        for (const r of rows) {
          const loan = toLoan(r);
          const { interestDelta, updates } = accrueInterest(loan, now);
          if (interestDelta > 0n || Object.keys(updates).length) {
            db.prepare('UPDATE loans SET accrued_interest=?, last_accrual_ts=?, status=? WHERE id=?')
              .run(Number(loan.accrued_interest + interestDelta), updates.last_accrual_ts ?? now, updates.status ?? loan.status, loan.id);
            if (!isTestEnv()) console.log(JSON.stringify({ msg: 'loan_accrued', loanId: loan.id, interestDelta: Number(interestDelta) }));
          }
        }
      }
    } catch { /* ignore */ }
  }, 0);
}

// Reminder helpers
export function listLateOrDueLoans(guildId: string, now: number): any[] {
  const db = getGuildDb(guildId);
  const soon = now + 24 * 60 * 60 * 1000; // 24h window
  const rows = db.prepare(`
    SELECT id, user_id, principal, apr_bps, term_days, start_ts, due_ts,
           accrued_interest, paid_principal, paid_interest, status, last_accrual_ts,
           last_reminder_ts, reminder_count
    FROM loans
    WHERE status IN ('active','late')
      AND (due_ts <= ? OR due_ts <= ?)
    ORDER BY due_ts ASC
  `).all(soon, now) as any[];
  return rows;
}

// Debt and delinquency helpers for underwriting
export function getActiveDebt(guildId: string, userId: string): number {
  const db = getGuildDb(guildId);
  const row = db.prepare(
    `SELECT COALESCE(SUM(principal + accrued_interest - paid_principal - paid_interest), 0) AS debt
     FROM loans
     WHERE user_id = ? AND status IN ('active','late','defaulted')`
  ).get(userId) as any;
  return Number(row?.debt || 0);
}

export function hasDelinquent(guildId: string, userId: string): boolean {
  const db = getGuildDb(guildId);
  const row = db.prepare(
    `SELECT 1 AS x FROM loans WHERE user_id = ? AND status IN ('late','defaulted') LIMIT 1`
  ).get(userId) as any;
  return !!row;
}

export function getOutstandingPrincipal(guildId: string, userId: string): number {
  const db = getGuildDb(guildId);
  const row = db.prepare(
    `SELECT COALESCE(SUM(principal - paid_principal), 0) AS principal_out
     FROM loans WHERE user_id = ? AND status IN ('active','late')`
  ).get(userId) as any;
  return Number(row?.principal_out || 0);
}

export function setLoanReminderMeta(guildId: string, loanId: string, ts: number) {
  const db = getGuildDb(guildId);
  db.prepare(`UPDATE loans SET last_reminder_ts = ?, reminder_count = COALESCE(reminder_count, 0) + 1 WHERE id = ?`)
    .run(ts, loanId);
}

export function getUserPrefs(guildId: string, userId: string) {
  const db = getGuildDb(guildId);
  return db.prepare(`SELECT * FROM loan_user_prefs WHERE user_id = ?`).get(userId) as any;
}

export function setUserPrefs(
  guildId: string,
  userId: string,
  changes: Partial<{ remind: number; snooze_until_ts: number | null }>
) {
  const db = getGuildDb(guildId);
  const now = Date.now();
  const current = getUserPrefs(guildId, userId) ?? { user_id: userId, remind: 1, snooze_until_ts: null, updated_at: now };
  const remind = (changes.remind ?? current.remind) as number;
  const snooze = (Object.prototype.hasOwnProperty.call(changes, 'snooze_until_ts') ? (changes as any).snooze_until_ts : current.snooze_until_ts) as number | null;
  db.prepare(`
    INSERT INTO loan_user_prefs(user_id, remind, snooze_until_ts, updated_at)
    VALUES(?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET remind=excluded.remind, snooze_until_ts=excluded.snooze_until_ts, updated_at=excluded.updated_at
  `).run(userId, remind, snooze, now);
}

export function getReminderChannelId(guildId: string): string | null {
  try {
    const db = getGuildDb(guildId);
    const row = db.prepare(`SELECT value FROM guild_settings WHERE key = 'loan_reminder_channel_id'`).get() as any;
    const v = (row?.value ?? '').trim();
    return v.length ? v : null;
  } catch { return null; }
}

export function setReminderChannelId(guildId: string, channelId: string | null) {
  const db = getGuildDb(guildId);
  if (!channelId) {
    db.prepare(`DELETE FROM guild_settings WHERE key = 'loan_reminder_channel_id'`).run();
  } else {
    db.prepare(`
      INSERT INTO guild_settings(key,value,updated_at)
      VALUES('loan_reminder_channel_id', ?, strftime('%s','now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    `).run(channelId);
  }
}
