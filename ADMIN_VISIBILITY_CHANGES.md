# Admin Command Visibility Changes

## Summary

All admin commands have been made visible to all users in the Discord slash command UI, while maintaining runtime authorization checks via the bot's internal admin database. This allows users to discover admin commands but prevents execution unless they are registered bot admins.

## Changes Made

### 1. Created Helper Function

**File**: `src/commands/util/adminBuilder.ts` (NEW)

Created `makePublicAdmin()` helper that:
- Sets `defaultMemberPermissions` to `null` (visible to all)
- Sets `DMPermission` to `false` (requires guild context)
- Returns the builder for chaining

### 2. Updated Commands

All admin commands updated to use `makePublicAdmin()` and added `• v2` to descriptions to force Discord cache invalidation:

#### Main Admin Commands
- `/admin` - `src/commands/admin/index.ts`
- `/dev` - `src/commands/dev.ts`
- `/config` - `src/commands/config.ts`

#### Specialized Admin Commands
- `/rank-admin` - `src/commands/rank/admin.ts`
- `/loan-admin` - `src/commands/loan-admin/index.ts`
- `/admin-repair` - `src/commands/slash/admin-repair.ts`
- `/canary` - `src/commands/slash/canary.ts`

#### Flat Commands (in `src/commands/slash/index.ts`)
- `/dev-demo`
- `/admin-reboot`

### 3. Runtime Gating

All admin commands already have runtime authorization checks using:
- `requireAdmin(interaction)` - Checks bot admin database
- `requireSuper(interaction)` - Checks super admin status

These guards remain unchanged and continue to block execution for non-admins.

### 4. Added Visibility Logging

**File**: `src/register.ts`

Added logging in `buildAllCommands()` to verify command visibility during registration:

```typescript
console.log(JSON.stringify({
  msg: 'command_visibility',
  name: cmd.name,
  defaultMemberPermissions: perms === null ? 'null (visible to all)' : perms,
  dmPermission: (cmd as any).dm_permission ?? true
}));
```

## Before & After

### Before
```typescript
export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin controls')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)  // ❌ Hidden from non-admins
  .setDMPermission(false)
```

**Result**: Only users with Discord Administrator permission could see the command in the UI, even if they were bot admins.

### After
```typescript
export const data = makePublicAdmin(
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin controls • v2')  // Version bump for cache
)
```

**Result**: All users can see the command in the UI, but only bot admins can execute it.

## Verification Steps

### 1. Build
```bash
npm run build
```
✅ Build successful with no errors

### 2. Register Commands
```bash
npm run register:dev
# or for production:
npm run register:prod
```

### 3. Verify Visibility Logs
With `VERBOSE=1`, check for logs like:
```json
{
  "msg": "command_visibility",
  "name": "admin",
  "defaultMemberPermissions": "null (visible to all)",
  "dmPermission": false
}
```

### 4. Test in Discord

**As Non-Admin User:**
1. Type `/admin` in Discord
2. ✅ Command should appear in autocomplete
3. Try to execute: `/admin list`
4. ✅ Should receive: "Access Denied" message

**As Bot Admin:**
1. Type `/admin` in Discord
2. ✅ Command should appear in autocomplete
3. Try to execute: `/admin list`
4. ✅ Should execute successfully

### 5. Force Discord Cache Refresh
If old visibility persists:
- Press `Ctrl+R` (or `Cmd+R` on Mac) to refresh Discord client
- Wait 1-2 minutes for Discord cache to update
- Restart Discord app if needed

## Security Notes

1. **Runtime Gating Preserved**: All commands check `requireAdmin()` or `requireSuper()` before execution
2. **Guild-Scoped**: Admin checks are per-guild via `getGuildDb(guildId)`
3. **No Cross-Guild Leakage**: Admin status in one guild doesn't grant access in another
4. **DM Protection**: All admin commands require guild context (`setDMPermission(false)`)

## Files Changed

### New Files
- `src/commands/util/adminBuilder.ts` - Helper function

### Modified Files
1. `src/commands/admin/index.ts`
2. `src/commands/rank/admin.ts`
3. `src/commands/loan-admin/index.ts`
4. `src/commands/dev.ts`
5. `src/commands/config.ts`
6. `src/commands/slash/admin-repair.ts`
7. `src/commands/slash/canary.ts`
8. `src/commands/slash/index.ts` (flat commands)
9. `src/register.ts` (visibility logging)

## Command List

All these commands are now visible to everyone but runtime-gated:

### Admin Commands
- `/admin` (21 subcommands including add, remove, give, take, reset, sync-commands, etc.)
- `/admin-reboot`
- `/admin-repair`
- `/dev` (demo subcommand)
- `/dev-demo`
- `/canary`

### Configuration
- `/config` (set/get subcommands)

### System-Specific Admin
- `/rank-admin` (set-level, add-xp, set-xp, reset, decay)
- `/loan-admin` (credit-reset, forgive, remind-all, reminders-set-channel)

## Expected Behavior

| User Type | Can See Command | Can Execute | Response |
|-----------|----------------|-------------|----------|
| Regular User | ✅ Yes | ❌ No | "Access Denied" |
| Bot Admin | ✅ Yes | ✅ Yes | Normal execution |
| Super Admin | ✅ Yes | ✅ Yes | Normal execution |

## Troubleshooting

### Commands still hidden
- Verify build: `npm run build`
- Re-register: `npm run register:dev`
- Check logs for `defaultMemberPermissions: "null (visible to all)"`
- Refresh Discord client: `Ctrl+R`

### Commands visible but won't execute
- ✅ This is expected for non-admins
- Check if user is in admin DB: `/admin list`
- Verify runtime guard exists in command handler

### Wrong error message
- Should see themed "Access Denied" embed
- Check that `requireAdmin()` is called before command logic
- Verify import: `import { requireAdmin } from '../../admin/guard.js'`

## Rollback

To revert changes:
1. Replace `makePublicAdmin(...)` with original `.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)`
2. Remove `• v2` from descriptions
3. Rebuild and re-register

## Notes

- The `• v2` suffix forces Discord to update its command cache
- Can be removed after initial deployment if desired
- Runtime guards (`requireAdmin`) are the actual security boundary
- Discord permissions are now purely for UX discoverability
