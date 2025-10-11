export type LoanStatus = 'active' | 'paid' | 'late' | 'defaulted' | 'forgiven';

export type Loan = {
  id: string;
  user_id: string;
  principal: bigint;
  apr_bps: number;
  term_days: number;
  start_ts: number; // ms since epoch
  due_ts: number;   // ms since epoch
  accrued_interest: bigint;
  paid_principal: bigint;
  paid_interest: bigint;
  status: LoanStatus;
  last_accrual_ts: number; // ms since epoch
  created_at: number; // ms since epoch
};

export type LoanOffer = {
  principal: number;
  aprBps: number;
  termDays: number;
};

