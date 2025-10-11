m# TODO: Make /admin list per-guild and public (no leaks)

## Steps
- [x] Create migrations_admin/002_admin_guild_scope.sql with schema changes
- [x] Update src/db/migrate.ts to run migrations from migrations_admin/ on adminDb
- [x] Update src/admin/adminStore.ts with new per-guild helpers
- [x] Update src/commands/admin/view.ts for new embed format
- [x] Update src/commands/admin/index.ts for per-guild add/remove/list with public replies
- [x] Create tests/admin.perguild.test.ts for per-guild isolation
- [ ] Run migrations and tests to verify
