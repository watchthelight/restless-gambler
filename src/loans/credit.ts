import { getGuildDb } from '../db/connection.js';
import { isTestEnv } from '../util/env.js';
import { Loan } from './types.js';

const BASELINE = 50;

export function getScore(guildId: string, userId: string): number {
  const db = getGuildDb(guildId);
  const row = db.prepare('SELECT score FROM credit_scores WHERE user_id = ?').get(userId) as { score?: number } | undefined;
  if (!row || typeof row.score !== 'number') return BASELINE;
  return Math.max(0, Math.min(100, Math.floor(row.score)));
}

export function setScore(guildId: string, userId: string, score: number): number {
  const s = Math.max(0, Math.min(100, Math.floor(score)));
  const db = getGuildDb(guildId);
  db.prepare('INSERT INTO credit_scores(user_id, score, updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET score=excluded.score, updated_at=excluded.updated_at')
    .run(userId, s, Date.now());
  if (!isTestEnv()) console.log(JSON.stringify({ msg: 'credit_change', userId, from: null, to: s, reason: 'set' }));
  return s;
}

export function resetScore(guildId: string, userId: string): number {
  const s = setScore(guildId, userId, BASELINE);
  return s;
}

export function bumpOnTime(guildId: string, loan: Loan): number {
  const amt = Number(loan.principal);
  const base = Math.min(10, Math.max(2, Math.floor(loan.term_days / 2)));
  const size = amt >= 5000 ? 8 : amt >= 1000 ? 5 : 3;
  const delta = Math.min(15, base + size);
  const prev = getScore(guildId, loan.user_id);
  const next = Math.min(100, prev + delta);
  setScore(guildId, loan.user_id, next);
  if (!isTestEnv()) console.log(JSON.stringify({ msg: 'credit_change', userId: loan.user_id, from: prev, to: next, reason: 'on_time' }));
  return next;
}

export function penalizeLate(guildId: string, loan: Loan): number {
  const amt = Number(loan.principal);
  const size = amt >= 5000 ? 12 : amt >= 1000 ? 8 : 5;
  const base = loan.status === 'defaulted' ? 20 : 10;
  const delta = Math.min(40, base + size);
  const prev = getScore(guildId, loan.user_id);
  const next = Math.max(0, prev - delta);
  setScore(guildId, loan.user_id, next);
  if (!isTestEnv()) console.log(JSON.stringify({ msg: 'credit_change', userId: loan.user_id, from: prev, to: next, reason: 'late' }));
  return next;
}
