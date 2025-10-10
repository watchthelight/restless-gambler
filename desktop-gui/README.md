# Restless Gambler — Desktop GUI

Simple Electron app to control your local Discord bot and send messages as the bot.

## Prereqs

- Node.js v20+
- Electron (installed via `npm i` below)
- Set your bot token in the environment (main process only):

Windows PowerShell:

```
setx DISCORD_TOKEN "YOUR_TOKEN"
```

Open a new shell after setting the variable so Electron can see it.

## Configure

Edit `config.json`:

```json
{
  "botDir": "D:/restless-gambler",
  "buildCommand": "npm run build",
  "startCommand": "node dist/index.js",
  "env": { "NODE_ENV": "development", "REGISTER_ON_START": "false" }
}
```

- `botDir`: absolute path to your bot repo
- `buildCommand`: shell command to build the bot
- `startCommand`: shell command to start the bot
- `env`: extra env vars applied when building/starting

## Run

```
cd desktop-gui
npm i
npm start
```

## Features

- Buttons: Build, Start, Stop, Reboot (Windows-friendly process kill)
- Live log viewer streaming stdout/stderr from the bot process
- Send Message panel (Guild ID optional, Channel ID required)
- Token never leaves the Electron main process; renderer cannot read it

## Security Notes

- The Authorization header for Discord API is constructed in the main process using `process.env.DISCORD_TOKEN` (or `BOT_TOKEN`).
- The renderer accesses a minimal API via `preload.js` (contextBridge); no secrets exposed to the web context.

## Troubleshooting

- If Start says the bot is already running, use Stop first or terminate any orphaned Node processes.
- On Windows, Stop uses `taskkill /PID <pid> /T /F` to kill the entire tree.
- If you see `DISCORD_TOKEN not set`, re-open your terminal after running `setx`, or set it directly before `npm start` for a one-off: `DISCORD_TOKEN=... npm start`.

