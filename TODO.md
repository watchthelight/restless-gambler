# TODO: Implement ESM Jest + Numeric Wallet Changes

- [x] Edit src/commands/admin/tests/reboot.test.ts: Add 'import { jest } from '@jest/globals';' at the top.
- [x] Edit src/admin/tests/roles.test.ts: Add 'import { jest } from '@jest/globals';' at the top.
- [x] Edit src/economy/wallet.ts: Change getBalance to return bigint with safe coercion; update adjustBalance to accept/return bigint, use Number() for DB; update transfer to return {from: bigint, to: bigint}, use Number() for DB.
- [x] Create tests/setupTests.ts: Add content to silence schema migration logs in CI/JEST_SILENCE.
- [x] Edit package.json: Add "setupFilesAfterEnv": ["<rootDir>/tests/setupTests.ts"] to jest config.
- [x] Edit context-pack/CHANGED.md: Append the change note.
- [x] Run 'npm run build' to verify compilation.
- [ ] Run 'npm test' to ensure all tests pass.
- [ ] Manual checks: Test wallet functions return bigint, DB balances are integers, UI displays formatted correctly.
