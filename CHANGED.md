2025-10-10 — Interaction idempotency + components fixed; bet limits schema
- Centralized safe replies (safeReply/safeDefer) to prevent AlreadyReplied errors
- Component flows now use deferUpdate + editReply; added per-message mutex to avoid racey updates
- Replaced deprecated `ephemeral: true` with flags everywhere
- Null-safe config access; /config now reads/writes KV and sets game bet limits appropriately
- Verified: /slots, roulette, blackjack buttons no longer throw ERR-COMPONENT; /config set max_bet works

