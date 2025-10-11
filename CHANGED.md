2025-10-10 — New-guild auto-migrate + users table
- Opening a guild DB now bootstraps `_migrations` and applies all per-guild migrations before any query.
- Added migration `000b_create_users.sql` to provide a `users` table used by handlers to cache display names and avatars.
- Router retries once after a missing-table error by migrating the guild DB, then fails with `ERR-DB-SCHEMA`.

2025-10-10 — Loan reminder engine
- Background loop accrues interest and pings users when loans are due/late (DM by default, optional guild channel).
- Throttled to at most once per loan per 24h; respects opt-out and snooze preferences.
- New commands:
/loan remind-all (admin)
/loan reminders set-channel [#channel] (admin)
/loan reminders opt-out | opt-in
/loan reminders snooze hours:<1..72>
- New columns: loans.last_reminder_ts, loans.reminder_count; table loan_user_prefs.
- Env: LOAN_REMINDERS_ENABLED=true, LOAN_REMINDER_INTERVAL_MS=600000.

2025-10-10 — Underwritten loan applications
- `/loan apply amount:<number>` performs a public underwriting check and either denies with reasons or approves and presents preset term/APR choices (7/14/30d).
- Approval uses credit, active debt, wallet multiple and delinquency checks.
- All flow is non-ephemeral; only requester can interact; components expire after 15m.
- Events: loan_apply_open/denied/commit.

2025-10-10 — Loan reminders preference
- New table user_notification_prefs; default ON.
- `/loan reminders on|off|status` to control late-payment notifications (also available via toggle in apply flow).
- Apply wizard exposes a toggle button; scheduler respects the setting.

2025-10-10 — Balance-aware loan limits
- Loan approval now considers user balance, credit score, and outstanding principal.
- New util loans/limits.ts with tunable parameters: balFactor=0.25, balBoostCap=500k, scoreCap=250k, globalMax=2m.
- /loan apply denial explains limit and notes outstanding debt if any.
- Tests cover growth with balance and reduction with debt.

2025-10-10 — Loans & Credit + public admin list
- /admin list now visible to everyone (non-ephemeral)
- Added per-user loans with APR (bps), daily accrual, short-term due dates, partial payments, statuses
- Credit score 0–100; increases on-time, decreases late/default; /loan credit-reset (admin)
- /loan: show offers with a chart and dropdown to accept; /loan details; /loan pay
- /loan forgive (admin) clears loans and resets balance to 0
- /balance now displays credit score and loan summary
- All econ cards use pretty + `exact:` line; removed Exact/Copy buttons globally

2025-10-10 — Interaction idempotency + components fixed; bet limits schema
- Centralized safe replies (safeReply/safeDefer) to prevent AlreadyReplied errors
- Component flows now use deferUpdate + editReply; added per-message mutex to avoid racey updates
- Replaced deprecated `ephemeral: true` with flags everywhere
- Null-safe config access; /config now reads/writes KV and sets game bet limits appropriately
- Verified: /slots, roulette, blackjack buttons no longer throw ERR-COMPONENT; /config set max_bet works

2025-10-10 — Blackjack lifecycle fix + Play Again
- Sessions now end immediately on terminal outcomes (win/loss/push/bust/blackjack/auto-stand/cancel) before rendering results
- Added per-session lock to prevent races between auto-stand and clicks
- Final result cards disable action buttons and include a “Play Again” button that restarts with the same bet
- /blackjack start no longer incorrectly reports an active hand after a win

2025-10-10 — Gamble card idempotent + exact balance inline
- Reworked /gamble to use defer+editReply; eliminated InteractionAlreadyReplied errors
- Removed “Exact/Copy” buttons on /gamble
- Wallet card now shows the pretty number and a secondary `exact: 1,234,567` line
2025-10-10 — Remove Exact/Copy buttons; Blackjack Play Again → new message
- Economy cards now show pretty value plus secondary `exact: 1,234,567` line. Buttons removed.
- Eliminated InteractionAlreadyReplied by using defer+editReply across econ commands.
- Blackjack “Play Again” now acknowledges the button and posts a new message with a fresh hand; only original player can use it.

2025-10-10 — Command toggles
- New config/config.json with per-command enabled flags and optional reasons.
- Registrar now skips disabled commands during global sync.
- Runtime guard blocks disabled commands with a friendly notice.
- /admin toggles: view, enable <name>, disable <name> [reason].
- Hot-reloads config.json on change.

Usage

Disable a command quickly:

/admin toggles disable command:roulette reason:"maintenance"

/admin sync-commands to remove it from the slash picker globally.

Re-enable:

/admin toggles enable command:roulette

/admin sync-commands

If you want auto-sync on toggle, you can gate a background REGISTER_ON_START=true check or add a small “Sync now” button to the toggles reply, but keeping sync explicit is safer.
2025-10-10 — Build-time toggles + hide disabled commands
- Added `scripts/seed-toggles.ts`; `postbuild` now seeds `config/config.json` with all commands enabled by default.
- Startup safety auto-fills missing toggles and writes back to config.
- Registrar registers only enabled commands; sync now purges disabled/unknown global commands and all guild-scoped commands.
- After `/admin sync-commands`: disabled commands no longer appear in the slash UI.
2025-10-10 — Tame config watcher
- Debounced config reloads; ignore initial add; Windows-friendly stability.
- Only reload on content change (sha1 compare).
- Singleton watcher across hot reloads; rate-limit `config_reloaded` (≤1/30s).
- Added basic Jest test for debounce/hash behavior.
