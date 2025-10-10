param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('CLI','GUI')]
  [string]$Mode
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Noise suppression env for the session
$env:NODE_NO_WARNINGS    = '1'
$env:NPM_CONFIG_LOGLEVEL = 'error'
$env:NPM_CONFIG_PROGRESS = 'false'
$env:NPM_CONFIG_FUND     = 'false'
$env:NPM_CONFIG_AUDIT    = 'false'

$BotDir = "D:\restless-gambler"
$GuiDir = "D:\restless-gambler\desktop-gui"

function Write-Err($m){ Write-Host $m -ForegroundColor Red }
function Write-Status($m){ Write-Host $m -ForegroundColor Cyan }

try {
  if ($Mode -eq 'CLI') {
    if (-not (Test-Path $BotDir)) { throw "BotDir not found: $BotDir" }
    Push-Location $BotDir
    Write-Status "Starting bot (CLI): node dist/index.js"
    & node dist/index.js
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { throw "Bot exited with code $code" }
    exit 0
  }
  elseif ($Mode -eq 'GUI') {
    if (-not (Test-Path $GuiDir)) { throw "GuiDir not found: $GuiDir" }
    Push-Location $GuiDir
    Write-Status "Launching GUI: npm start"
    & npm start
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { throw "GUI exited with code $code" }
    exit 0
  }
}
catch {
  Write-Err $_
  exit 1
}

