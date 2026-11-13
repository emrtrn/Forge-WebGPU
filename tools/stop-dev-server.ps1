$ErrorActionPreference = "Stop"

$Port = 5183
$Connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if (-not $Connections) {
  Write-Host "No dev server is listening on port $Port."
  exit 0
}

$ProcessIds = $Connections | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($ProcessId in $ProcessIds) {
  try {
    $Process = Get-Process -Id $ProcessId -ErrorAction Stop
    Stop-Process -Id $ProcessId -Force
    Write-Host "Stopped process $ProcessId ($($Process.ProcessName)) on port $Port."
  } catch {
    Write-Host "Could not stop process $ProcessId on port ${Port}: $($_.Exception.Message)"
  }
}
