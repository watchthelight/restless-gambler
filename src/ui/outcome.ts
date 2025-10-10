export const BOLT = "🔩";

export function formatBolt(n: number): string {
  return `${n.toLocaleString()} ${BOLT}`;
}

export type Outcome = 'win' | 'loss' | 'push' | 'broke' | 'invalid';

export function outcomeMessage(kind: Outcome, amount?: number, extra?: string): string {
  switch (kind) {
    case 'win':
      return `YOU WON ${formatBolt(amount ?? 0)} !!!`;
    case 'loss':
      return `You lost ${formatBolt(amount ?? 0)}.`;
    case 'push':
      return 'Push. Your bet is returned.';
    case 'broke':
      return 'Insufficient balance. Top up first.';
    default:
      return `Invalid bet. ${extra ?? ''}`.trim();
  }
}

export function deltaBadge(n: number): string {
  const sign = n >= 0 ? '+' : '−';
  return `${sign}${Math.abs(n).toLocaleString()} ${BOLT}`;
}

