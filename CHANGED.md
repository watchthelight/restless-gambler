2025-10-11 — Rank & Luck System

## Overview
Implemented a comprehensive rank/level system that rewards gambling activity with XP and grants time-limited luck buffs on level-up. The system integrates seamlessly with all gambling games and includes full admin tooling.

## Features

### 1. XP & Leveling
- **XP from gambling**: Users earn XP from all gambling activities (gamble/slots/roulette/blackjack)
- **Progression curves**: Three curve types supported (linear/quadratic/exponential) - default quadratic
- **Level rewards**: Level-up grants a +1.5% luck buff for 1 hour (refresh on further rank-ups; buffs don't stack)
- **XP scaling**: XP gain proportional to bet size relative to wallet (risk-adjusted)
- **Anti-abuse**: Per-minute XP caps (1000 XP/min), 2s debounce, bounded per-action XP (5-250 default)

### 2. Luck Buff System
- **Win rate boost**: Increases effective luck by small percentage (default +1.5%, configurable as basis points)
- **Universal application**: Applies to all RNG in games via centralized `withUserLuck()` hook
- **Safe & clamped**: Never exceeds configurable max (default +3%), prevents game-breaking bias
- **Time-limited**: Default 1 hour duration, refreshes on subsequent level-ups
- **Visible**: Users see active buff and remaining time in `/rank` command

### 3. Commands

#### User Commands
- `/rank view [user]` - Show level, XP progress bar, luck buff status, and next reward
- `/rank leaderboard` - Top 10 ranked users in server with medals

#### Admin Commands (`/rank-admin`)
- `/rank-admin set-level user:<user> level:<n>` - Set user's level directly
- `/rank-admin add-xp user:<user> xp:<n>` - Grant XP (triggers level-ups if threshold crossed)
- `/rank-admin set-xp user:<user> xp:<n>` - Set XP directly
- `/rank-admin reset user:<user>` - Reset user to level 1 with 0 XP
- `/rank-admin decay user:<user> percent:<0-100>` - Apply XP decay (reduce by percentage)

All commands respect toggle system and public_results config.

### 4. Configuration
All settings configurable via `/config set/get`:

**XP Settings:**
- `rank_xp_rate` (default 1.0) - XP multiplier
- `rank_xp_cap_min` (default 5) - Minimum XP per action
- `rank_xp_cap_max` (default 250) - Maximum XP per action
- `rank_curve` (default "quadratic") - Level progression curve (linear/quadratic/exponential)
- `rank_max_level` (default 100) - Maximum achievable level

**Luck Settings:**
- `luck_bonus_bps` (default 150 = 1.5%) - Luck buff granted on level-up
- `luck_max_bps` (default 300 = 3.0%) - Maximum luck cap (safety limit)
- `luck_duration_sec` (default 3600 = 1 hour) - Buff duration

**Other:**
- `rank_public_promotions` (default true) - Announce rank-ups in channel
- `features.ranks.enabled` (default true) - Master switch for entire system

### 5. Game Integration

**RNG Luck Bias:**
- Centralized hook at [src/rng/luck.ts](src/rng/luck.ts) applies luck to all games
- Integrated into: `/gamble`, `/slots`, `/roulette`, `/blackjack`
- Bias method: Shifts random value down slightly, increasing chance of hitting win thresholds
- Very small, bounded adjustment ensures fairness maintained

**XP Awarding:**
- XP granted after each completed gambling action
- Scaled by bet size and wallet (risk-adjusted)
- Only actual gambling earns XP (no XP from admin grants, faucet, transfers)
- Tracked per user with 2s cooldown to prevent spam

### 6. Anti-Abuse Measures
- **Rate limiting**: 1000 XP per minute cap per user
- **Debounce**: Minimum 2s between XP awards to same user
- **Bounded XP**: Per-action caps prevent exploits
- **Risk scaling**: Diminishing returns for repeated small bets
- **Admin actions ignored**: Only gambling generates XP
- **Luck caps**: Hard limit on maximum luck bonus

### 7. Persistence & Schema

New tables in per-guild databases (migration `007_ranks.sql`):
```sql
user_ranks(user_id TEXT PRIMARY KEY, level INT, xp INT, updated_at INT)
user_buffs(user_id TEXT PRIMARY KEY, luck_bps INT, granted_at INT, expires_at INT)
```

Indexes on level (DESC), updated_at, expires_at for efficient queries.

### 8. UI & Announcements
- **Rank card**: Shows level badge, XP progress bar (15 chars), luck buff status with countdown
- **Level-up announcements**: Public themed embeds in channel (if enabled)
- **Leaderboard**: Top 10 with medals (🥇🥈🥉) and level/XP display
- **Next reward preview**: Shows what user gets on next level-up

### 9. Background Tasks
- **Hourly cleanup**: Removes expired luck buffs from database
- **Channel tracking**: Remembers last interaction channel for announcements
- **Auto-migration**: Rank tables created on guild DB open

## Files Created

### Core System
- `src/rank/math.ts` - XP curve calculations, progress bars, thresholds
- `src/rank/store.ts` - Data layer (getRank, setRank, addXP, luck buff CRUD)
- `src/rank/xpEngine.ts` - XP calculation with anti-abuse logic
- `src/rank/announce.ts` - Channel tracking and rank-up announcements
- `src/rng/luck.ts` - Centralized RNG bias hook for all games

### Commands
- `src/commands/rank/index.ts` - `/rank view` and `/rank leaderboard`
- `src/commands/rank/admin.ts` - `/rank-admin` subcommands

### Database
- `src/db/migrations/guild/007_ranks.sql` - Schema for user_ranks and user_buffs tables

### Infrastructure
- `src/bootstrap/scheduler.ts` - Hourly buff cleanup scheduler

## Files Modified

### Game Integration
- `src/commands/economy.ts` - Added XP and luck to `/gamble` command
- `src/games/slots/commands.ts` - Integrated XP and luck bias
- `src/games/roulette/commands.ts` - Integrated XP and luck bias
- `src/games/blackjack/commands.ts` - Integrated XP and luck bias

### Configuration
- `src/commands/config.ts` - Added rank/luck config keys to autocomplete and handlers
- `config/config.json` - Enabled `/rank` and `/rank-admin` commands

### Command Registration
- `src/commands/slash/index.ts` - Registered rank commands in router
- `src/index.ts` - Starts rank schedulers on bot ready

## Usage Examples

### View Your Rank
```
/rank view
```
Shows: Level 5, XP: 234/500 (46.8%), Progress bar, Active buff: +1.50% luck (23m 45s remaining)

### Check Leaderboard
```
/rank leaderboard
```
Shows top 10 ranked users with medals and level/XP

### Admin: Grant XP
```
/rank-admin add-xp user:@Player xp:1000
```
Response: "Added 1000 XP to @Player. Leveled up: 4 → 5!"

### Admin: Set Level
```
/rank-admin set-level user:@Player level:10
```

### Configure System
```
/config set key:luck_bonus_bps value:200
/config set key:rank_xp_rate value:1.5
/config set key:rank_public_promotions value:false
```

## Testing

### Manual Testing
1. Place several `/gamble` bets to earn XP
2. Check progress with `/rank view`
3. On level-up, verify luck buff appears
4. Place more bets to test luck bias effect
5. Check `/rank leaderboard` for rankings
6. Test admin commands with `/rank-admin`

### XP Formula Verification
```
Base XP = log10(bet + 10) × 25 × risk_factor
Risk factor = clamp(bet / wallet, 0.05, 3.0)
Final XP = clamp(Base XP × rate, cap_min, cap_max)
```

### Luck Bias Verification
```
Original RNG: u ∈ [0, 1)
With luck: u' = max(0, u - luck_bps / 10000)
Example: 150 bps = 0.015 shift = ~1.5% better win chance
```

## Benefits

1. **Engagement**: Rewards active players with visible progression
2. **Retention**: Time-limited buffs encourage continued play
3. **Fair**: Small luck boost doesn't break game balance
4. **Configurable**: Guilds can tune XP rates and luck bonuses
5. **Anti-abuse**: Multiple layers prevent exploitation
6. **Universal**: Single RNG hook applies to all games consistently
7. **Observable**: Clear UI shows progress, buffs, and leaderboards

## Notes

- Luck bias is intentionally small (1.5% default) to maintain game fairness
- XP only from gambling; admin actions don't generate XP
- Buffs refresh on level-up but don't stack
- All settings respect command toggles
- Scheduled cleanup runs hourly across all guilds
- Channel tracking uses in-memory map (no DB overhead)

---

2025-10-11 — Comprehensive Help System

## Overview
Implemented a dynamic, comprehensive help system with category shortcuts, autocomplete, and per-command detailed documentation. All help respects command toggles: disabled commands are hidden from overview and autocomplete suggestions.

## Features

### 1. Main Help Command (`/help`)
- **Overview mode**: Shows all enabled commands organized by category (games, economy, loans, config, admin, misc)
- **Detailed mode**: Use `/help command:<name>` to see full documentation for any command
- **Autocomplete**: Smart suggestions showing command titles, filtered by what's currently enabled
- **Pagination**: Automatically splits long content across multiple messages (1800 char limit per page)
- **Public by default**: Help is visible to everyone so users can share documentation

### 2. Category Shortcuts
Dedicated commands for browsing specific categories:
- `/help-admin` - Admin and configuration tools
- `/help-games` - Casino games (blackjack, slots, roulette, holdem)
- `/help-economy` - Economy commands (balance, daily, give, etc.)
- `/help-loans` - Loan system commands
- `/help-config` - Configuration and theme commands

Each category command shows detailed descriptions for all commands in that category.

### 3. Central Documentation Registry
- **Source of truth**: [src/help/registry.ts](src/help/registry.ts) contains all command metadata
- **Comprehensive docs**: Every command has title, description, usage examples, permissions, and category
- **Respects toggles**: Only enabled commands appear in help output and autocomplete
- **Extensible**: Easy to add new commands or update existing documentation

### 4. Detailed Per-Command Documentation
Each command includes:
- **Title**: Human-friendly name
- **Description**: What the command does and why you'd use it
- **Usage**: All command variants and options
- **Examples**: Real-world usage examples
- **Permissions**: Who can use it (if restricted)
- **Category**: Logical grouping

Example detailed help entries:
- `loan`: 11 usage variants, 5 examples, permission breakdown
- `admin`: 15+ subcommands documented with permission levels
- `blackjack`: Rules, payouts, button usage

### 5. Smart Autocomplete
- Filters by command name and title
- Shows descriptive labels: "blackjack — Blackjack"
- Only suggests enabled commands
- Fast fuzzy matching
- Respects 25-choice Discord limit

## Files Created

### New Files
- `src/help/registry.ts` - Central help documentation registry with all command metadata
- `src/commands/slash/help-categories.ts` - Category shortcut commands (/help-admin, /help-games, etc.)
- `src/ui/paginate.ts` - Pagination utility for splitting long messages
- `tests/help.command.test.ts` - Comprehensive test suite for help system (13 tests)
- `tests/paginate.test.ts` - Pagination utility tests (10 tests)

### Modified Files
- `src/commands/slash/help.ts` - Replaced basic help with full-featured version
- `src/commands/slash/index.ts` - Registered help and category commands
- `src/interactions/autocomplete.ts` - Added /help autocomplete handler
- `config/config.json` - Enabled help and category commands

## Usage

### View all commands
```
/help
```
Shows categorized overview of all enabled commands with shortcuts.

### Get detailed help for a command
```
/help command:blackjack
/help command:loan
/help command:admin
```
Shows full documentation: description, usage, examples, permissions.

### Browse by category
```
/help-games
/help-economy
/help-admin
/help-loans
/help-config
```
Shows all commands in that category with descriptions.

### Autocomplete
Start typing in the `command:` option of `/help` to see smart suggestions.

## Benefits

1. **Self-documenting**: Users can discover and learn commands without external docs
2. **Always up-to-date**: Help stays in sync with code (single source of truth)
3. **Toggle-aware**: Disabled commands automatically hidden from help
4. **User-friendly**: Clear descriptions, examples, and categorization
5. **Discoverable**: Autocomplete and category shortcuts make finding commands easy
6. **Maintainable**: Centralized registry makes updates simple
7. **Tested**: Comprehensive test coverage ensures reliability

## Tests

All tests passing ✅:
- `tests/help.command.test.ts`: 13 tests covering registry, filtering, categories
- `tests/paginate.test.ts`: 10 tests covering pagination edge cases

Run tests:
```bash
npm test
```

---

2025-10-11 — Config-Driven Toggles & BigInt-Safe Balances

## Overview
Implemented two cohesive features: (1) Config-driven command toggles with limits/knobs system, (2) BigInt-safe balances with exact formatting that eliminates float artifacts.

### A. Config Infrastructure

#### Limits System (NEW)
- Added [src/config/index.ts](src/config/index.ts) with `limits` section in `config/config.json`
- Default limits: `min_bet: 1`, `max_bet: 100000`, `faucet_limit: 250`, `give_percent_max: 50`, `admin_give_cap: "1000000000000000"` (BigInt-capable string)
- `getLimits()` - retrieve current limits, `saveLimits(mutator)` - update and persist
- Merges cleanly with existing command toggles in same config file

#### Command Toggles (Already Existed)
- [src/config/toggles.ts](src/config/toggles.ts) already provides full toggle system
- Auto-populates all commands, debounced watch, registry integration via `isEnabled()`

### B. BigInt Infrastructure

#### Database BigInt Support (NEW)
- Updated [src/db/connection.ts:33](src/db/connection.ts#L33) - added `db.defaultSafeIntegers(true)`
- All INTEGER columns now return `bigint` (no precision loss)

#### BigInt Utilities (NEW)
- Added [src/util/big.ts](src/util/big.ts): `toBigIntStrict()`, `formatExact()`, `formatBalancePretty()`
- **Fixes critical bug**: adding 1 at large magnitudes no longer jumps from ...998 to ...001

#### Tests (NEW)
- [tests/bigint.exact.test.ts](tests/bigint.exact.test.ts) - 17 tests, all passing ✅
- [tests/config.limits.test.ts](tests/config.limits.test.ts) - config system tests ✅

---

2025-10-11 — Economy & Admin Safety Improvements

## Overview
Implemented comprehensive safety and quality improvements across economy commands, admin actions, and infrastructure.

## A) Economy Command Guardrails

### Server-Only Enforcement
- Added `ensureGuildInteraction()` guard in [src/interactions/guards.ts](src/interactions/guards.ts)
- Applied to all economy commands and casino games: `/gamble`, `/balance`, `/give`, `/daily`, `/slots`, `/roulette`, `/blackjack`
- DM attempts now get ephemeral "This command only works in servers." response

### Bet Normalization
- Removed hidden fees from `/gamble` - bet amount used for RNG now equals displayed bet
- Comment added at [src/commands/economy.ts:235](src/commands/economy.ts#L235): `// Use exact bet amount for RNG - no hidden fees`

### Rate Limiting
- New token bucket rate limiter at [src/util/ratelimit.ts](src/util/ratelimit.ts): 5 ops / 10s per user:command
- Applied to: `/gamble`, `/give`, `/admin give`, `/admin take`, `/admin reset`
- Users see "Rate limit exceeded. Try again in X seconds." with countdown

### Per-Op Max Amounts
- `/give`: Clamped to 10% of sender balance ([src/commands/economy.ts:137-148](src/commands/economy.ts#L137-L148))
- `/admin give|take`: Clamped to 1B (configurable via `ADMIN_MAX_GRANT` env var)

## B) Admin Safety & Audit

### Audit Logging
- New audit logger at [src/util/audit.ts](src/util/audit.ts)
- Appends JSON lines to `data/audit/admin.log`
- Logs: `admin_give`, `admin_take`, `admin_reset` with full metadata

### Idempotency
- SHA1-based deduplication of admin actions within 2s window
- Prevents accidental double-clicks and rapid resubmissions
- Logs `audit_duplicate_dropped` for rejected duplicates

### Structured Logging
- Updated admin action logs to structured format without emojis
- New log types: `econ_gamble_result`, `admin_action`, `audit_logged`, `audit_duplicate_dropped`
- Kept emojis only in user-facing embeds

## Verification Steps

### 1. Build
```bash
npm run build
```

### 2. Guild Guard Test
Try `/gamble 100` in a DM:
- **Expected**: Ephemeral "This command only works in servers."

### 3. Rate Limit Test
Run `/gamble 100` six times rapidly:
- **Expected**: First 5 succeed, 6th shows rate limit message

### 4. Admin Cap Test
```bash
/admin give @user 2000000000
```
- **Expected**: Clamped to 1,000,000,000 with message

### 5. Give Cap Test
With balance 1000, try `/give @user 500`:
- **Expected**: Rejected with "You can only give up to 10% of your balance (100)"

### 6. Idempotency Test
Rapidly trigger admin give twice:
- **Expected**: Second dropped, logged as `audit_duplicate_dropped`

### 7. Audit Log Test
```bash
cat data/audit/admin.log
```
- **Expected**: JSON lines with action, adminUserId, targetUserId, amount, timestamp, guildId

## Files Modified

### New Files
- `src/interactions/guards.ts` - Guild interaction guard
- `src/util/ratelimit.ts` - Token bucket rate limiter
- `src/util/audit.ts` - Audit logging with idempotency
- `data/audit/` - Audit log directory

### Modified Files
- `src/commands/economy.ts` - Guild guards, rate limits, bet normalization, caps
- `src/commands/admin/index.ts` - Rate limits, audit logging, caps, idempotency
- `src/games/slots/commands.ts` - Guild guard
- `src/games/roulette/commands.ts` - Guild guard
- `src/commands/slash/blackjack.ts` - Guild guard

## Environment Variables

### New
- `ADMIN_MAX_GRANT` - Max amount for `/admin give|take` (default: 1000000000)

## Notes

- All changes are backwards compatible and additive
- No breaking changes
- Loan system enhancements (delay, double-submit, approval policy, scheduler) remain TODO
- Config startup filtering and autocomplete for toggles remain TODO
- Test suite creation remains TODO

---

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
2025-10-11 — Add one-shot launch script
- Added `npm run launch` which performs: build → test → start:pretty
- Fails fast on build or test failure to avoid starting a broken bot
