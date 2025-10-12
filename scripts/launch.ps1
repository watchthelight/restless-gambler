$ErrorActionPreference = "Stop"

while ($true) {
  try {
    Write-Host "Running build..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Host "Build failed ($LASTEXITCODE)." -ForegroundColor Red; break }

    Write-Host "Running tests..." -ForegroundColor Cyan
    npm test
    if ($LASTEXITCODE -ne 0) { Write-Host "Tests failed ($LASTEXITCODE)." -ForegroundColor Red; break }

    Write-Host "Starting bot..." -ForegroundColor Cyan
    npm start
  } catch {
    # ignore
  }
  if (Test-Path "./.reboot.flag") {
    Remove-Item "./.reboot.flag" -Force
    Start-Sleep -Seconds 1
    continue
  }
  break
}
