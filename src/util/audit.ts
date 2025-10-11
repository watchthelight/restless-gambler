import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const AUDIT_FILE = join(process.cwd(), 'data', 'audit', 'admin.log');
const recentOps = new Map<string, number>(); // id -> timestamp
const IDEMPOTENCY_WINDOW_MS = 2000;

// Ensure audit directory exists
try {
  mkdirSync(join(process.cwd(), 'data', 'audit'), { recursive: true });
} catch {}

export interface AdminAuditEvent {
  action: 'admin_add' | 'admin_remove' | 'admin_give' | 'admin_take' | 'admin_reset';
  adminUserId: string;
  targetUserId?: string;
  amount?: number;
  timestamp: number;
  guildId?: string;
}

/**
 * Compute idempotency ID for an admin action
 */
function computeId(event: AdminAuditEvent): string {
  const bucket = Math.floor(event.timestamp / 1000); // 1-second buckets
  const parts = [
    event.adminUserId,
    event.targetUserId || '',
    String(event.amount || 0),
    String(bucket),
    event.action,
  ];
  return createHash('sha1').update(parts.join('|')).digest('hex');
}

/**
 * Check if this operation is a duplicate within the idempotency window
 * @returns true if duplicate (should be dropped), false if unique
 */
export function isDuplicateOp(event: AdminAuditEvent): boolean {
  const id = computeId(event);
  const now = Date.now();
  const lastSeen = recentOps.get(id);

  if (lastSeen && (now - lastSeen) < IDEMPOTENCY_WINDOW_MS) {
    return true; // Duplicate
  }

  recentOps.set(id, now);

  // Cleanup old entries
  for (const [key, ts] of recentOps.entries()) {
    if (now - ts > IDEMPOTENCY_WINDOW_MS * 2) {
      recentOps.delete(key);
    }
  }

  return false;
}

/**
 * Write an admin action to the audit log (JSON lines format)
 */
export function auditLog(event: AdminAuditEvent): void {
  if (isDuplicateOp(event)) {
    console.log(JSON.stringify({ msg: 'audit_duplicate_dropped', action: event.action, adminUserId: event.adminUserId }));
    return;
  }

  const line = JSON.stringify(event) + '\n';
  try {
    appendFileSync(AUDIT_FILE, line, 'utf8');
    console.log(JSON.stringify({ msg: 'audit_logged', action: event.action, adminUserId: event.adminUserId, targetUserId: event.targetUserId }));
  } catch (e: any) {
    console.error(JSON.stringify({ msg: 'audit_write_error', error: e.message }));
  }
}
