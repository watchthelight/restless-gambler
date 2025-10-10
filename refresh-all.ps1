$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Status($msg) { Write-Host "[STATUS] $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "[ OK ]  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# Suppress noisy npm/node warnings for this session
$env:NPM_CONFIG_LOGLEVEL = 'error'
$env:NPM_CONFIG_PROGRESS = 'false'
$env:NPM_CONFIG_FUND = 'false'
$env:NPM_CONFIG_AUDIT = 'false'
$env:NODE_NO_WARNINGS = '1'

function Remove-Noise {
  param([Parameter(ValueFromPipeline = $true)] [string]$line)
  process {
    if ($null -eq $line) { return }
    if ($line -match '(?i)deprecated|vulnerability|npm audit|are looking for funding|funding|\bWARN\b|warning') { return }
    Write-Output $line
  }
}

# Local-only paths
$BotDir = "D:\restless-gambler"
$GuiDir = "D:\restless-gambler\desktop-gui"

try {
  Write-Status "Verifying Node.js and npm..."
  $nodeVer = (& node -v) 2>$null
  if (-not $nodeVer) { throw "Node.js not found in PATH. Install Node 20+ and try again." }
  $npmVer = (& npm -v) 2>$null
  if (-not $npmVer) { throw "npm not found in PATH. Ensure Node/npm are installed." }

  $nodeMajor = [int]($nodeVer.TrimStart('v').Split('.')[0])
  Write-Ok "node $nodeVer | npm $npmVer"
  if ($nodeMajor -lt 20) { throw "Node $nodeVer detected. This project requires Node >= 20." }

  if (-not $env:DISCORD_TOKEN -or [string]::IsNullOrWhiteSpace($env:DISCORD_TOKEN)) {
    Write-Err "DISCORD_TOKEN is not set in your environment."
    Write-Host ""; Write-Host "Set it permanently (PowerShell):" -ForegroundColor Yellow
    Write-Host '  setx DISCORD_TOKEN "YOUR_TOKEN"' -ForegroundColor Yellow
    Write-Host ""; throw "Missing DISCORD_TOKEN"
  }
  Write-Ok "DISCORD_TOKEN is present."

  if (-not (Test-Path $BotDir)) { throw "BotDir not found: $BotDir" }
  if (-not (Test-Path $GuiDir)) { throw "GuiDir not found: $GuiDir" }

  # 1) Clean bot
  Write-Status "Cleaning bot artifacts in $BotDir ..."
  Push-Location $BotDir
  foreach ($item in @("node_modules", "dist")) {
    if (Test-Path $item) { Write-Host "  Removing $item" -ForegroundColor DarkGray; Remove-Item -Recurse -Force $item }
  }
  if (Test-Path "package-lock.json") { Write-Host "  Removing package-lock.json" -ForegroundColor DarkGray; Remove-Item -Force "package-lock.json" }
  Pop-Location
  Write-Ok "Bot cleanup done."

  # 2) Install bot deps (generate lock if missing, then ci)
  Push-Location $BotDir
  if (-not (Test-Path "package-lock.json")) {
    Write-Status "Generating package-lock.json (npm install --package-lock-only) ..."
    & npm install --package-lock-only --silent --no-audit --progress=false 2>&1 | Remove-Noise
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm install --package-lock-only failed for bot" }
  }
  Write-Status "Installing bot deps (npm ci) ..."
  & npm ci --silent --no-audit --progress=false 2>&1 | Remove-Noise
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm ci failed for bot" }
  Pop-Location
  Write-Ok "Bot deps installed."

  # 3) Build bot
  Write-Status "Building bot (npm run build) ..."
  Push-Location $BotDir
  & npm run build --silent 2>&1 | Remove-Noise
  if ($LASTEXITCODE -ne 0) { throw "Bot build failed" }
  Pop-Location
  Write-Ok "Bot build complete."

  # 4) Clean GUI
  Write-Status "Preparing GUI deps in $GuiDir ..."
  Push-Location $GuiDir
  foreach ($item in @("node_modules")) {
    if (Test-Path $item) { Write-Host "  Removing $item" -ForegroundColor DarkGray; Remove-Item -Recurse -Force $item }
  }
  if (Test-Path "package-lock.json") { Write-Host "  Removing package-lock.json" -ForegroundColor DarkGray; Remove-Item -Force "package-lock.json" }
  Pop-Location
  Write-Ok "GUI cleanup done."

  # 5) Install GUI deps (generate lock if missing, then ci)
  Push-Location $GuiDir
  if (-not (Test-Path "package-lock.json")) {
    Write-Status "Generating GUI package-lock.json (npm install --package-lock-only) ..."
    & npm install --package-lock-only --silent --no-audit --progress=false 2>&1 | Remove-Noise
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "GUI npm install --package-lock-only failed" }
  }
  Write-Status "Installing GUI deps (npm ci) ..."
  & npm ci --silent --no-audit --progress=false 2>&1 | Remove-Noise
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "GUI npm ci failed" }
  Pop-Location
  Write-Ok "GUI deps installed."

  # 6) Start GUI (auto-starts bot and shows logs)
  Write-Status "Launching Electron GUI (npm start) ..."
  Push-Location $GuiDir
  & npm start
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { throw "Electron exited with code $code" }
  Write-Ok "Electron GUI exited cleanly."
  Write-Host ""; Write-Host "To run CLI:  .\startCLI.cmd" -ForegroundColor Cyan
  Write-Host "To run GUI:  .\startGUI.cmd" -ForegroundColor Cyan
}
catch {
  Write-Err $_
  exit 1
}

exit 0
