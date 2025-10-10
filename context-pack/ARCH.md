### Primary Frameworks
- **Discord.js v14**: Core bot framework for Discord interactions.
- **Electron**: Desktop GUI application in desktop-gui/.
- **SQLite (better-sqlite3)**: Database for persistent data storage.
- **Node.js 20.x**: Runtime environment.

### Key Directories
- `src/commands/`: Slash command definitions and registry.
- `src/games/`: Game logic implementations (blackjack, slots, roulette, holdem).
- `src/db/`: Database connections, migrations, and schema.
- `src/interactions/`: Event handlers for buttons, selects, and slash commands.
- `data/`: SQLite database files for guilds, admin, and archives.
- `desktop-gui/`: Electron app source (main.js, preload.js, renderer.js).
- `logs/`: Application logs in NDJSON format.

### Data Flow
Discord Gateway → `initInteractionRouter` (src/interactions/router.ts) → `command.run()` → DB operations via `src/db/`.
