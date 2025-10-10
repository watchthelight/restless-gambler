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
