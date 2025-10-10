# tools/pack-release.ps1
Param()
Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path) | Out-Null
$root = Resolve-Path ".."
Set-Location $root
if (-Not (Test-Path dist)) { Write-Error "dist/ missing. Run: npm run build"; exit 1 }
$items = @("dist","package.json","package-lock.json",".env.example","README.md")
$items | ForEach-Object { if (-Not (Test-Path $_)) { Write-Error "Missing $_"; exit 1 } }
if (Test-Path release.zip) { Remove-Item release.zip -Force }
Compress-Archive -Path $items -DestinationPath release.zip -Force
Write-Host "release.zip created."

