@echo off
setlocal
set ROOT=%~dp0..
rem Kill any node that's running the bot (dist\index.js)
for /f "tokens=2" %%p in ('tasklist ^| findstr "node.exe"') do (
  wmic process where "ProcessId=%%p" get CommandLine 2^>nul ^| findstr "dist\\index.js" ^>nul
  if not errorlevel 1 (
    taskkill /PID %%p /F >nul 2>&1
  )
)
rem Wait a moment for cleanup
timeout /t 1 /nobreak >nul
rem Start the bot again in the background
cd /d "%ROOT%"
start "" /B node dist\index.js
