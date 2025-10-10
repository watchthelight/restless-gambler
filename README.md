## start

- Prereqs: Node 20.x LTS, npm
- Set env: `cp .env.example .env` and set `BOT_TOKEN`
- Install/build:
  - `npm ci`
  - `npm run build`
- Migrate/register (dev or prod):
  - Dev (tsx): `npm run migrate` and `npm run register`
  - Prod (dist): `npm run migrate:prod` and `npm run register:prod`
- Start: `npm run start`

## Currency

- Bolts (🔩)
- Displayed everywhere with the emoji, e.g., `1,000 🔩`

## Visibility

- Control reply visibility via `VISIBILITY_MODE` in `.env`:
  - `public` (default) replies in-channel
  - `ephemeral` replies only to the invoker

## Deploy to EC2 (Ubuntu)

1) Build locally and pack release (Windows):
   - `npm run build`
   - `./tools/pack-release.ps1` → creates `release.zip`
2) Copy to server:
   - `scp release.zip ubuntu@your-ec2:/home/ubuntu/casino-bot`
3) Install system packages + Node 20:
   - `sudo apt update && sudo apt install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev unzip`
   - Install Node 20.x and verify `node -v`
4) Unpack and install:
   - `cd ~/casino-bot && unzip -o release.zip`
   - `cp .env.example .env` and set `BOT_TOKEN`
   - `npm ci`
   - `npm run migrate:prod`
   - `npm run register:prod`
5) Run as a user service (systemd):
   - Create `~/.config/systemd/user/casino-bot.service`:
```
[Unit]
Description=Play-money Casino Bot
After=network.target

[Service]
Environment=NODE_ENV=production
Environment=REBOOT_CMD=systemctl --user restart casino-bot
WorkingDirectory=/home/ubuntu/casino-bot
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```
   - `systemctl --user daemon-reload && systemctl --user enable --now casino-bot`
   - `loginctl enable-linger ubuntu`

Notes: `/admin reboot` uses `REBOOT_CMD` if set. If not set, the bot self‑reexecs.

## Syncing Changes to Production

### A) Git-based Deploy
1) Commit and push locally
   - `git add -A && git commit -m "deploy" && git push`
2) SSH to EC2 and pull
   - `ssh ubuntu@your-ec2`
   - `cd ~/casino-bot && git pull`
3) Install and build
   - `npm ci && npm run build && npm run register:prod`
4) Restart service
   - `systemctl --user restart casino-bot`

Environment (`.env`) and data files live server‑side and are not versioned.

### B) Release‑zip Deploy
1) Build/package locally
   - `npm run build`
   - `./tools/pack-release.ps1` → creates `release.zip`
2) Upload and unpack on EC2
   - `scp release.zip ubuntu@your-ec2:/home/ubuntu/casino-bot`
   - `cd ~/casino-bot && unzip -o release.zip`
3) Install and register
   - `npm ci && npm run register:prod`
4) Restart service
   - `systemctl --user restart casino-bot`

## First Push to GitHub

Windows PowerShell example:

```
cd path\to\your\project
git init
git branch -M main
git add -A
git commit -m "Initial commit"
git remote add origin https://github.com/watchthelight/restless-gambler
git push -u origin main
```

Notes:
- Use a GitHub Personal Access Token (PAT) for HTTPS push.
- EC2 pulls from the same URL.

## Fast Dev Guild Registration

Guild registrations are instant; global can take up to ~1 hour.

- Set `DEV_GUILD_ID` in `.env` to your test server ID
- Dev register: `npm run build && npm run register:dev`
- Global register: `npm run register:global`

Troubleshooting:
- If `ping` isn’t in the registered names log, verify the loader sees modules exporting `data` and `execute` (or `run`).
- Refresh Discord (Ctrl+R). Ensure the bot has `applications.commands` scope and is present in the server.

Slash command scope & duplicates:
- The register step now enforces exclusive scope to prevent duplicates.
- If `DEV_GUILD_ID` is set and `REGISTER_GLOBAL` is not `1`, it registers to that guild and clears GLOBAL commands.
- If `REGISTER_GLOBAL=1`, it registers globally and clears commands in `DEV_GUILD_ID` (if set).

## Data vs Code

- Source code is versioned in git; runtime SQLite databases are NOT committed.
- Databases live under `./data` on the server. The repo ignores `*.db`, `/data/*.db`, and `/backups/`.
- The deploy pipeline performs a pre-migration backup and then runs forward-only, idempotent migrations.
- Never copy local dev DBs to production. Use the built-in backup/restore flow instead.

### Backup & Restore

- To back up all databases (global admin, legacy mono DB if present, and all per-guild DBs): run `npm run backup` on the server. Backups are written to `./backups/<name>-YYYYMMDD-HHMMSS.db`.
- To restore: stop the service, copy a chosen backup file over the current DB, then start the service again.

### Migrations

- SQL/JS migrations live in `src/db/migrations` and are tracked per-DB in the `applied_migrations` table.
- Files are applied in lexical order (e.g., `001_*.sql`, `002_*.sql`) and only once.
- Guild DB migrations are applied to each `./data/guilds/<guildId>.db`. Global admin DB migrations live under `src/db/migrations/global`.

`.env.example` contains only placeholders; real tokens are not committed.

### Command Registration & Purge (No Duplicates)

Goals:
- In DEV, commands exist only on your dev guild (DEV_GUILD_ID). No global commands.
- In PROD, commands exist only as global application commands. No guild commands.

Scripts:
- Register (env-aware, atomic): `npm run register`
- Purge global: `npm run purge:global`
- Purge guild: `npm run purge:guild` (uses `%DEV_GUILD_ID%`)
- Purge both: `npm run purge:all`
- List current: `npm run list:commands`

DEV workflow (no duplicates):
1) `npm run purge:global`
2) `DEV_GUILD_ID=<id> npm run register`

PROD workflow (no duplicates):
1) `DEV_GUILD_ID=<id> npm run purge:guild`
2) `NODE_ENV=production npm run register`

Notes:
- Registration is a single PUT per scope and overwrites the existing set.
- On startup in DEV, if both global and DEV guild have commands, a warning is printed to use the purge tool.

### Pretty Console Output (flags & env)

This project includes a friendly CLI UI with colors, spinners, progress bars, and a structured log file.

- Run: `npm run start` (or `npm run start:pretty` to force a theme)
- Env/flags:
  - `NO_COLOR=1` or `--no-color` disables colors
  - `--quiet` suppresses info lines (errors still show)
  - `CLI_THEME=neo|solarized|mono` switches palette
  - `--banner=off` hides the ASCII banner
- Structured logs are written to `logs/app.ndjson` (pino). Console focuses on human‑friendly output.

### Direct SSH Deploy (no GitHub)

Prereqs (remote EC2 Ubuntu):
- Node.js 20.x LTS installed (`node -v` shows v20)
- `unzip` installed (`sudo apt-get install -y unzip`)
- systemd user services enabled (`systemctl --user ...` works)
- Optional: enable linger so service survives logout: `loginctl enable-linger $(whoami)`

SSH config example (Windows OpenSSH, `~/.ssh/config`):

```
Host restless-gambler
  HostName <your-ec2-public-dns>
  User ubuntu
  IdentityFile ~/.ssh/<your-key>.pem
  IdentitiesOnly yes
```

Usage (from repo root on Windows PowerShell):
- `./sync.ps1`
- `./sync.ps1 -HardReset`  # wipes and recreates remote dir before deploy
- `./sync.ps1 -NoRegister` # skip slash command registration
- `./sync.ps1 -PullDb`     # fetch latest remote backup to ./backups/remote/<ts>/
- `./sync.ps1 -PullDb -OverwriteLocalDb` # replace ./data/*.db from latest backup
- `./sync.ps1 -TailLogs`   # follow logs after restart

Notes:
- The script ships code via SCP (no GitHub pull on server).
- Local `*.db` files are never uploaded. Remote DBs are backed up before migration.
- If `.env` exists locally, it is uploaded to `$HOME/restless-gambler/.env` unless `-NoEnvUpload` is set.
- Remote requires Node 20+. If missing, install via Nodesource:
  `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs`
