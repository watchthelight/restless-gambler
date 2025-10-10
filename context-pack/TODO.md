# TODO: Registrar Fixes Verification

## Verification Steps
1. **Dev, no DEV_GUILD_ID:**
   - Expect: scope=register, level=WARN, msg="dev mode without DEV_GUILD_ID; skipping registration"
   - Bot reaches ready.

2. **Dev with DEV_GUILD_ID set:**
   - First run: registers once; subsequent runs: no-op by hash.

3. **Production:**
   - Registers global; no reference to DEV_GUILD_ID; subsequent: no-op by hash.

4. **Broken token:**
   - Expect: scope=register, level=ERROR, msg mentions 401 + guidance; bot still reaches ready.

## Implementation Checklist
- [x] Mode handling: production → global, dev → guild if DEV_GUILD_ID, else skip
- [x] Idempotency: hash check, log no-op if match
- [x] Error surfaces: 401 → specific log, no crash
- [x] Single-run guard: hasRegistered flag in register.ts
- [x] Logging: scope="register" for start, no-op, applied, skipped, 401
- [x] Migration: "done" log gated once per process
- [x] CHANGED.md prepended with entry
