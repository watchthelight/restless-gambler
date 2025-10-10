### Slash Commands (src/commands/slash/)
- canary: Test command
- help: Help command
- dev-demo: Demo rendering (admin only)
- admin-reboot: Reboot bot (admin only)
- admin-repair: Admin repair commands
- ping: Ping command
- theme: Theme command

### Economy Commands (src/commands/economy.ts)
- balance: Check balance
- wallet: Wallet management
- faucet: Claim faucet
- leaderboard: Economy leaderboard

### Config Commands (src/commands/config.ts)
- config: Configuration commands

### Game Commands
- slots (src/games/slots/commands.ts)
- roulette (src/games/roulette/commands.ts)
- blackjack (src/games/blackjack/commands.ts)
- holdem (src/games/holdem/commands.ts)

### Admin Commands (src/commands/admin/index.ts)
- admin: Admin subcommands

### Dev Commands (src/commands/dev.ts)
- dev: Dev subcommands

### Event Handlers
- No dedicated event handlers in src/events/; interactions handled in src/interactions/router.ts

### Electron IPC Channels (desktop-gui/)
- ipcMain.on in main.js: 'minimize', 'maximize', 'close', 'restart-bot'
- ipcRenderer.send in preload.js: 'minimize', 'maximize', 'close', 'restart-bot'
