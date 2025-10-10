# 🧩 PROBLEM LOG — `play-money-casino-bot`

A running log of technical failures, migration misfires, and other crimes against SQLite.  
Environment: Node 20.18.1 · SQLite · Windows 11 · Project Root: `D:\restless-gambler`

---

## 1. ⚙️ Build & Compilation Issues

### ❗ Problem
**TypeScript build fails with `TS6059` when registering guild commands.**

**Environment:**  
`REGISTER_ON_START=true`, `DEV_GUILD_ID=1414225727179591712`

### 🧠 Error
```
npm run build
> tsc -p tsconfig.json
error TS6059: File '...' is not under 'rootDir' 'src'.
```

### 📉 Cause
`rootDir` misalignment in `tsconfig.json` — the compiler tries to include generated `.d.ts` files or loose test scripts outside `/src`.

### ✅ Fix Plan
- [ ] Set `"rootDir": "./src"` explicitly in `tsconfig.json`.  
- [ ] Exclude build and data folders:  
  ```json
  "exclude": ["dist", "data", "node_modules"]
  ```
- [ ] Re-run `npm run build` after cleaning with:
  ```bash
  rd /s /q dist && tsc -b
  ```

---

## 2. 🧬 Database Migration Desync

### ❗ Problem
**Migrations reported as “already applied,” but schema is missing columns.**

**Environment:**  
Prod DB (`data/guilds/1285395569618980926.db`)

### 🧠 Error Log
```
✖ Applying migrations (63ms) - table guild_settings has no column named updated_at
SqliteError: table guild_settings has no column named updated_at
```

**Files marked applied:**
- `000_core.sql`
- `000a_create_balances.sql`
- `001_add_indices.sql`
- `002_add_cooldowns.sql`

### ⚙️ Cause
Migration tracker table out of sync with actual DB schema.  
`guild_settings` table missing `updated_at`, expected by command handlers and future migrations.

### 🧩 Quick Patch
Run manually:
```sql
ALTER TABLE guild_settings ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP;
```

### ✅ Permanent Fix
- [ ] Create migration: `003_add_updated_at_to_guild_settings.sql`
- [ ] Add column guard to `migrate.js`:
  ```js
  const hasCol = rows.some(r => r.name === 'updated_at');
  ```
- [ ] Enforce schema preflight check via `PRAGMA table_info(guild_settings)`
- [ ] Add migration sanity log per guild

---

## 3. 🎮 Command Handler Failures — Missing `updated_at`

### ❗ Problem
**Every command touching `guild_settings` fails (`/ping`, `/admin add`).**

**Guild ID:** `1285395569618980926`  
**Channel:** `#gambling` in *Bash Corporation Evil Town*  
**User:** `watchthelight#697169405422862417`

### 🧠 Error Output
```
{"msg":"handler_error","name":"ping","error":"SqliteError: table guild_settings has no column named updated_at"}
{"msg":"handler_error","name":"admin","error":"SqliteError: table guild_settings has no column named updated_at"}
```

### ⚙️ Cause
Command layer depends on an ORM update that references `updated_at`.  
The table was never upgraded because migrations skipped it as “already applied.”

### 🧰 Fix Plan
- [ ] Re-run patched migration after applying schema patch  
- [ ] Add `updated_at` column fallback in handler:
  ```js
  try {
    db.prepare("ALTER TABLE guild_settings ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP;").run();
  } catch (e) {}
  ```
- [ ] Add schema self-repair flag during boot  
- [ ] Validate `guild_settings` structure during every migration run

---

## 4. 🧪 Notes & Meta

### Observed Malfunctions
- Recurring SQLite column errors  
- Command handler exceptions on `/ping` and `/admin add`  
- TypeScript build failures under strict mode  

### Timeline
| Date       | Event                       | Result                      |
| ---------- | --------------------------- | --------------------------- |
| 2025-10-09 | Build run (`npm run build`) | TS6059 compiler error       |
| 2025-10-10 | Migration selftest          | Missing `updated_at` column |
| 2025-10-10 | `/ping` execution           | SQL handler crash           |
| 2025-10-10 | `/admin add` execution      | SQL handler crash           |

### Affected Modules
- `src/register.ts`
- `src/interactions/router.ts`
- `dist/db/migrate.js`
- `tsconfig.json`

---

## 🧩 Summary of Fix Chain

| Priority | Task                                                     | Status |
| -------- | -------------------------------------------------------- | ------ |
| 🔴        | Add `003_add_updated_at_to_guild_settings.sql` migration | ☑      |
| 🤶        | Enforce schema sanity check in `migrate.js`              | ☑      |
| 🟡        | Add handler fallback for `updated_at`                    | ☑      |
| 🟢        | Clean `tsconfig.json` and re-build                       | ☑      |

