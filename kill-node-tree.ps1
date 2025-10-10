param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Status($msg) { Write-Host "[STATUS] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)     { Write-Host "[ OK ]  $msg" -ForegroundColor Green }
function Write-Err($msg)    { Write-Host "[ERROR] $msg" -ForegroundColor Red }

try {
  Write-Status "Enumerating node.exe processes..."
  $procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" }
  if (-not $procs -or $procs.Count -eq 0) { Write-Ok "No node.exe processes found."; exit 0 }

  Write-Host "Candidates:" -ForegroundColor Yellow
  $procs | Sort-Object CreationDate | ForEach-Object {
    $start = [Management.ManagementDateTimeConverter]::ToDateTime($_.CreationDate)
    "{0,6}  {1}  {2}" -f $_.ProcessId, $start.ToString("u"), ($_.ExecutablePath ?? "(unknown path)")
  }

  if (-not $Force) {
    $answer = Read-Host "Kill all listed node.exe process trees? (Y/N)"
    if ($answer -notin @("Y","y")) { Write-Host "Aborted." -ForegroundColor Yellow; exit 0 }
  }

  foreach ($p in $procs) {
    $pid = $p.ProcessId
    Write-Status "Killing PID $pid ..."
    & taskkill /PID $pid /T /F | Out-Host
  }

  Write-Ok "Completed taskkill for all listed node.exe processes."
}
catch {
  Write-Err $_
  exit 1
}

