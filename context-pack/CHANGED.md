2025-10-10 — Hold'em seating MVP
- Added per-guild tables and players (003_holdem_core.sql)
- `/holdem create` now reports **Blinds**, **Buy-in (min–max)**, and **Seats**
- Implemented `/holdem join`, `/holdem leave`, `/holdem status`
- Wallet debits on join, credits on leave; one seat per user per guild
- Small, consistent embeds; ephemeral errors with MessageFlags
- Added tests for join/leave and balance effects
- Files: [src/games/holdem/store.ts](src/games/holdem/store.ts), [src/games/holdem/view.ts](src/games/holdem/view.ts), [src/games/holdem/commands.ts](src/games/holdem/commands.ts), [src/games/holdem/tests/join.test.ts](src/games/holdem/tests/join.test.ts), [src/db/migrations/guild/003_holdem_core.sql](src/db/migrations/guild/003_holdem_core.sql)

2025-10-10 — `/loan apply`
- Added `/loan apply amount:<int> apr:<bps> term_days:<int>` which validates against user-specific offers, creates the loan, credits the wallet, and returns a confirmation card with quick-pay buttons.

Verification:
- Build, migrate, start. Run `/holdem create` then verify the embed shows blinds and buy-in range.
- `/holdem join table:<id> buyin:<min..max>` succeeds; `/holdem status` shows your seat and stack.
- `/holdem leave` returns stack and updates wallet.

2025-10-10 — Blackjack image renderer hardened (deterministic sizing)
- Fixed Sharp composite "same dimensions or smaller" errors
- Implemented deterministic DPR-aware canvas sizing (2x device pixel ratio)
- Pre-sized card PNGs to exact dimensions before compositing (120x168 CSS px → 240x336 device px)
- Deterministic layout: configurable card size, gaps, padding, row wrapping
- Added detailed diagnostics on composite failure (base size, per-card size, offsets)
- Card files cached with size suffix to prevent mismatched dimensions
- Vertically stacked dealer/player hands with proper spacing
- Card backs shown for hidden dealer cards
- Graceful fallback to Unicode with improved error logging
- Files: [src/cards/images.ts](src/cards/images.ts), [src/ui/canvas/dpi.ts](src/ui/canvas/dpi.ts), [src/ui/cardsDisplay.ts](src/ui/cardsDisplay.ts)

2025-10-10 — Large, clearly visible playing cards (240px height)
- Increased card size from 72px to 240px height (~3.3x larger) for clear visibility
- Enhanced SVG card generation with professional styling:
  - Large rank (36px) and suit (32px) symbols in corners (rotated in opposite corner)
  - Huge center suit symbol (96px) for instant card recognition
  - White background with shadow effects and border
  - Red cards (hearts/diamonds) and black cards (spades/clubs) properly colored
  - Standard playing card aspect ratio (0.715)
- Added proper card back rendering with blue patterned design
- Updated card compositing to handle larger cards with improved spacing
- Fixed hideDealer logic: shows actual card backs for hidden dealer cards instead of omitting them
- Cards render at 2x resolution (480px) then downscale for crisp, anti-aliased display
- Improved error handling with fallback to Unicode cards
- All card games (blackjack, etc.) automatically benefit from larger cards
- Cards cached in `data/cache/cards/240px/` directory
- Files modified: [src/cards/images.ts](src/cards/images.ts), [src/ui/cardsDisplay.ts](src/ui/cardsDisplay.ts)

2025-10-10 — Admin commands: fixes, prettification, and reboot improvements
- Fixed `/admin add` to properly use User option (type 6); removed fallback string parsing
- Replaced all deprecated `ephemeral: true` with `MessageFlags.Ephemeral` throughout admin commands
- Prettified admin diagnostics with simple embeds (no heavy themed cards):
  - `/admin appinfo` shows App ID, global command count, and first 10 commands in clean fields
  - `/admin list` displays super admin and normal admins with dates in structured embed
  - `/admin list-commands` shows global/guild counts and guild-scoped command list
  - `/admin force-purge` returns embed with purged guild list
- Simplified `/admin remove` and `/admin reset` to use plain embeds (no image cards)
- Fixed `/admin reboot` interaction flow: button now uses `deferUpdate()` then `editReply()` to prevent ERR-COMPONENT
- Created `scripts/restart.bat` for Windows restart with detached batch process
- Updated `performReboot()` to use platform-specific detached spawn (Windows batch vs POSIX shell)
- Reboot now test-safe: skips spawn and exit when running under Jest
- Added tests for admin add (validates User option and prevents self-promotion)
- Updated reboot test to mock `spawn` instead of deprecated `execFile`

2025-10-10 — Test-safe reboot
- Added env helpers; logger is quiet under Jest
- `performReboot()` skips timers and `process.exit` when tests run
- Removed post-reply "Goodbye 👋" branch to avoid late logs
- Jest config loads a tiny setup file to drop incidental `console.info`

2025-10-10 — Tests green: ESM Jest + numeric wallet
- ESM tests now `import { jest } from '@jest/globals'` where needed.
- Wallet API returns raw integers (bigint) only; no string concatenation.
- DB writes use integer values to satisfy NOT NULL constraints.
- Optional test setup reduces noisy migration logs.

2025-10-09 — Compact amounts with exact reveal
- Added BigInt-safe `describeAmount`, `renderAmountInline`, and `componentsForExact`
- Buttons: 🔎 Exact and Copy (ephemeral detail with scientific notation and unit legend)
- Settings: `ui.show_exact_mode` ("off" | "inline" | "on_click"), `ui.compact_sigfigs` (3..5)
- New admin controls: `/admin ui exact-mode …`, `/admin ui sigfigs …`
- Applied across balance/give/take/daily/games/leaderboards/messages

2025-10-09 — Project-wide compact balance formatting
- Added bigint-safe `formatBalance(value)` and `parseBalance(str)` up to centillion
- Replaced all user-visible amounts across commands, games, and embeds
- Decimal rule per tier: 1-digit→2dp, 2-digit→1dp, 3-digit→0dp (e.g., 1.00k, 10.0k, 100k)
- No DB changes; display-only

2025-10-09 — Dynamic status line
- Presence now shows: "<n> games, <n> commands, across <n> lines of code"
- Counts derive from command builders and a simple LOC scan of ./src
- New `/admin refresh-status` recomputes and updates presence on demand
- Optional periodic refresh controlled by STATUS_REFRESH_MINUTES (default 10)

2025-10-09 — Logger emoji strip; slots KV limits; admin reboot guard; blackjack guild_id adaptive

- Created src/log.ts with pino pretty transport stripping emoji-like chars from messages
- Wired new logger in src/index.ts for unhandledRejection and updated log calls to pino style
- Added slotsLimits to src/game/config.ts reading from KV with defaults
- Seeded slots KV defaults in src/db/connection.ts getGuildDb
- Updated src/games/slots/commands.ts to use slotsLimits, safeDefer/safeEdit/replyError
- Fixed src/commands/admin/index.ts handleButton to reply exactly once then setTimeout exit(0)
- Added adaptive guild_id column to src/game/blackjack/sessionStore.ts ensureBlackjackSessionsSchema

2025-10-09 — Blackjack session store refactor to prevent SqliteError on concurrent sessions

- Introduced src/game/blackjack/sessionStore.ts with schema adaptation, session creation, updates, and settlement functions
- Modified src/db/connection.ts to call ensureBlackjackSessionsSchema on guild DB open
- Refactored src/commands/slash/blackjack.ts to use sessionStore API instead of direct DB queries
- Refactored src/games/blackjack/commands.ts to use sessionStore API
- Sessions are now per user per guild (not per channel) to prevent concurrency issues
- Legacy table data is migrated with status column and backfilled

2025-10-09 — Admin USER option (type 6) + handler fallback
- /admin add, /admin give, /admin super-add now use a proper USER option
- Handlers read getUser("user") and fall back to string parsing for legacy payloads
- Fixes TypeError `[CommandInteractionOptionType]: Option "user" is of type: 6; expected 3`

2025-10-09 — Fix KV numeric reads; seed and clamp game limits
- KV numeric helper no longer treats null/"" as 0; falls back to defaults correctly
- Blackjack limits now clamp and recover from nonsense; never returns max=0
- On-open seeding populates sane defaults for blackjack.* and roulette.* if missing
- Verified: blackjack/roulette accept normal bets; no more “Maximum bet is 0.”

2025-10-09 — Admin add routes to NORMAL admins; guarded super-add
- `/admin give` and `/admin add` now insert into `guild_admins` (per-guild) instead of `super_admins`
- New `/admin super-add` adds a super admin; only existing super admins can use it
- Input validation and idempotent inserts; clean error messages
- `/admin list` remains focused on normal admins with super admin shown in the header

2025-10-09 — Command diagnostics and dedupe
- Added /admin appinfo, /admin list-commands, /admin force-purge
- Registrar now warns if token’s application id != APP_ID
- Command builders are deduped by name before global registration
- Verified: global count matches; guild-scoped leftovers can be purged on demand

2025-10-09 — Global slash command registration with guild purge
- Removed dev-guild registration paths; commands now register globally only
- /admin sync-commands now syncs global commands and purges all guild duplicates
- Added REGISTER_ON_START for optional auto-sync on boot
- Removed DEV_GUILD_ID from config

### Changes Made
- NEW: src/registry/sync.ts with buildCommands, registerGlobal, purgeGuildCommands, syncAll
- NEW: src/registry/util-builders.ts to export allCommandBuilders
- MOD: src/commands/admin/index.ts to wire /admin sync-commands to syncAll, remove scope option
- MOD: src/register.ts to remove DEV_GUILD_ID logic and add registerOnStart function
- MOD: context-pack/ENV.sample to remove DEV_GUILD_ID and set REGISTER_ON_START=false

### Testing
1) Build the bot
2) Run /admin sync-commands in a guild; expect global sync and guild purge summary
3) Verify commands work globally without guild-scoped duplicates

2025-10-09 — /admin list now lists NORMAL admins
Primary list now comes from guild_admins (per guild)

Super admin is shown as a header line only

Compatible with legacy timestamps via COALESCE(created_at, added_at)

Empty-state copy clarified

2025-10-09 — Admin hardening + Roulette moves to KV with legacy fallback
/admin add validates Discord IDs/mentions; adaptive insert handles added_at and legacy created_at with NOT NULL

/admin list selects COALESCE(created_at, added_at) and orders by the same

/admin sync-commands now replies cleanly when APP_ID/CLIENT_ID is missing

Roulette reads limits from guild_settings keys (roulette.*) with sane defaults, falling back to legacy table if present

Verified flows in dev-only mode: admin add/list/sync and roulette bets behave without schema errors

## 2025-10-09 — Dev-only gate supports multiple roles
Added RG_DEVONLY_ROLES (comma-separated) and defaulted to 1425816468041236521,142585311451451582

Runtime exposes devOnlyRoles: Set<string>; middleware checks “any-of”

startCLI.cmd sets both IDs by default when -devonly is used

Verified both roles can execute commands; others receive the standard dev-only message

## 2025-10-09 — Admin list: schema-agnostic timestamp
- /admin list now selects COALESCE(created_at, added_at) AS created_at and orders by the same
- Compatible with legacy and modern super_admins shapes
- Verified in dev-only mode: list renders without SQL errors

## 2025-10-09 — Adaptive super-admin insert respects NOT NULL created_at
- Admin schema now reported via PRAGMA; insertion populates all required timestamp columns
- If created_at exists and is NOT NULL, insert sets it alongside added_at
- Prevents NOT NULL failures on legacy admin DBs without altering table defaults
- Verified migrate:guilds succeeds on legacy and fresh DBs

## 2025-10-09 — Handlers aligned to KV settings; admin timestamp compatibility
- Moved handlers to key/value `guild_settings` via helpers (`getSetting`/`setSetting`)
- `/theme` uses UPSERT; no direct column writes
- `super_admins` reads use `COALESCE(created_at, added_at)`; inserts write `added_at`
- Added optional `v_guild_settings` view for convenience
- Verified `/ping`, `/theme set`, `/admin list`, `/daily` on fresh and existing guild DBs

## 2025-10-09 — Fix migration order: tables before indices; idempotent indexes
- Added 000a_create_balances.sql to create required tables before index migrations
- 001_add_indices.sql now uses CREATE INDEX IF NOT EXISTS
- 002_add_cooldowns.sql ensures table exists before indexing
- Verified migrate:guilds succeeds on fresh and existing guild DBs

## 2025-10-09 — SQLite migrations: strip nested transactions; SAVEPOINT wrapper; correct schema check
- Runner now strips BEGIN/COMMIT from migration files and wraps each file in a SAVEPOINT
- _migrations considered valid when columns are exactly {name, applied_at}; legacy shapes are rebuilt online
- Standardized _migrations to (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)
- Removed ORDER BY id anywhere in migrator
- Updated 000_core.sql to be non-transactional; atomicity is handled by the runner

## 2025-10-09 — Fix _migrations schema; make migrator schema-agnostic
- Updated _migrations to minimal schema (name PRIMARY KEY, applied_at); rebuild wrong schemas online
- migrateGuildDb now checks and rebuilds _migrations if malformed
- Removed ORDER BY id; queries only name

## 2025-10-09 — Harden per-guild migrations; bootstrap `_migrations`; migrate-on-open; router retry
- Added `000_core.sql` creating `_migrations`, `guild_settings`, and `guild_admins`
- `migrateGuildDb` now bootstraps `_migrations` and applies pending files atomically per DB
- Every guild DB migrates immediately upon open; added startup sweep over `data/guilds/*.db`
- Router retries once after a missing-table error, then fails with `ERR-DB-SCHEMA` and logs detail
- Migrate CLI now uses console-backed logger to avoid pino/sonic-boom flush races

## 2025-10-09 — Bootstrap `_migrations` + core guild schema; migrate-on-open; router retry
- Added `000_core.sql` to create `_migrations`, `guild_settings`, and `guild_admins`
- Per-guild migrator now creates `_migrations` if missing and applies pending files atomically
- Run migrations immediately after opening each `data/guilds/{guildId}.db` and via a startup sweep
- Router retries once on "no such table", then fails gracefully with ERR-DB-SCHEMA
- Verified on guild 1414225727179591712: commands execute after bootstrap

## 2025-10-09 — Per-guild migrate-on-open + core schema + router retry
- Added guild core migration (000_core.sql) creating guild_settings and guild_admins
- Now run per-guild migrations immediately after opening each data/guilds/{guildId}.db
- Added startup sweep over data/guilds/*.db
- Router retries once on "no such table", then fails gracefully with ERR-DB-SCHEMA
- Verified on guild 1414225727179591712: /ping, /admin list, /theme set succeed after bootstrap

### Changes Made
- NEW: src/db/migrations/guild/000_core.sql with core guild schema
- MOD: src/db/migrate.ts to implement migrateGuildDb with _migrations bookkeeping and idempotent runner
- MOD: src/db/connection.ts to call migrateGuildDb after DB open
- MOD: src/index.ts to add startup sweep over data/guilds/*.db before client login
- MOD: src/interactions/router.ts to retry once on "no such table" errors, then fail gracefully
- MOD: package.json to add "migrate:guilds" script

### Testing
1) Build and sweep:
   npm run build
   npm run migrate:guilds
2) Start the bot, then in the problem guild run:
   /ping
   /admin list
   /theme set theme: cherry
   Expect no "no such table" errors; first run may log migrate_guild applies.
3) Kill and restart; migrations should log no new applies; commands should still work.
2025-10-10 — Remove Exact/Copy buttons; Blackjack Play Again → new message
- Economy cards now show pretty value plus secondary `exact: 1,234,567` line. Buttons removed.
- Eliminated InteractionAlreadyReplied by using defer+editReply across econ commands.
- Blackjack “Play Again” now acknowledges the button and posts a new message with a fresh hand; only original player can use it.
2025-10-10 — Public pretty Admin List
- `/admin list` now renders the badge-styled card (Super Admin + Current Admins) and is visible to everyone (non-ephemeral).
- Mentions use `<@id>`; dates show as YYYY-MM-DD; avoids duplicate replies via defer+editReply.

2025-10-10 — `/loan apply`
- Added `/loan apply amount:<int> apr:<bps> term_days:<int>` which validates against user-specific offers, creates the loan, credits the wallet, and returns a confirmation card with quick-pay buttons.
