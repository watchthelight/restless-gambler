### Build
- Run `npm run build` to compile TypeScript sources to `dist/`.

### Start
- Run `npm start` or `npm run start:pretty` to launch the bot from compiled code.
- Run `npm run dev` to start in watch mode with `tsx`.

### Debug
- Use `node dist/index.js` with environment flags like `VERBOSE=1` for detailed logs.
- Use `npm run selftest` to verify build and migration correctness.

### Scripts
- `backup`: Run backups via `tsx scripts/backup.ts`.
- `migrate`: Run DB migrations.
- `register`: Register slash commands globally or per guild.
- `purge:*`: Purge commands globally or per guild.
- `list:commands`: List registered commands.

### Logs
- Logs are stored in `logs/app.ndjson`.
- Verbose logging enabled via `VERBOSE=1`.

### Environment Flags
- `BOT_TOKEN`: Discord bot token (required).
- `DEV_GUILD_ID`: Guild ID for development/testing.
- `REGISTER_ON_START`: If `true`, registers commands on startup.
- `CLEAR_GUILD_COMMANDS_ON_BOOT`: If `true`, purges guild commands on boot.
- `LOG_LEVEL`: Logging level (default `info`).
- `VISIBILITY_MODE`: Interaction response visibility (`public` or `ephemeral`).
