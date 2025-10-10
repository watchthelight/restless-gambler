@echo off
setlocal enableextensions

rem ===== quiet npm for this session =====
set "NPM_CONFIG_LOGLEVEL=error"
set "NPM_CONFIG_PROGRESS=false"
set "NPM_CONFIG_FUND=false"
set "NPM_CONFIG_AUDIT=false"
set "NODE_NO_WARNINGS=1"

rem ===== repo root =====
cd /d "%~dp0"

echo [STATUS] Bot rebuild starting...

if not exist package.json (
  echo [ERROR] package.json not found in %cd%
  exit /b 1
)

rem ===== check for reset flag =====
set RESET_FLAG=0
if /I "%~1"=="-reset" set RESET_FLAG=1
if /I "%~2"=="-reset" set RESET_FLAG=1

if %RESET_FLAG%==1 (
  echo [STATUS] Reset flag detected - clearing all data and logs
  if exist data rmdir /s /q data
  if exist logs rmdir /s /q logs
  if exist backups rmdir /s /q backups
  if exist .env del /q .env
  echo [OK] Data reset complete.
)

echo [STATUS] Removing node_modules
if exist node_modules rmdir /s /q node_modules

echo [STATUS] Removing dist
if exist dist rmdir /s /q dist

echo [STATUS] Removing package-lock.json (optional)
if exist package-lock.json del /q package-lock.json

echo [STATUS] Generating lockfile
call npm install --package-lock-only --no-audit --progress=false --silent
if errorlevel 1 (
  echo [ERROR] Failed to generate package-lock.json
  exit /b 1
)

echo [STATUS] Installing deps (npm ci)
call npm ci --no-audit --progress=false --silent
if errorlevel 1 (
  echo [ERROR] npm ci failed
  exit /b 1
)
echo [OK] Deps installed.

echo [STATUS] Building bot (npm run build)
call npm run build --silent
if errorlevel 1 (
  echo [ERROR] Bot build failed
  exit /b 1
)
echo [OK] Bot build complete.

echo [STATUS] Setting up environment
call npm run setup:env --silent
if errorlevel 1 (
  echo [ERROR] Environment setup failed
  exit /b 1
)
echo [OK] Environment ready.

echo [STATUS] Running database migrations
call npm run migrate --silent
if errorlevel 1 (
  echo [ERROR] Database migration failed
  exit /b 1
)
echo [OK] Database migrated.

rem ===== optional run without parentheses shenanigans =====
if /I "%~1"=="start" goto :RUN
if /I "%~2"=="start" goto :RUN

echo [OK] Rebuild finished.
exit /b 0

:RUN
echo [STATUS] Starting bot (CLI): node dist\index.js
node dist\index.js
exit /b %ERRORLEVEL%
