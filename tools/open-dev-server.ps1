param(
  [string]$Path = "/"
)

# Starts `npm run dev` (port 5183, strictPort) hidden if nothing answers yet,
# then opens the page in the default browser. Stop it with stop-dev-server.ps1.
$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Port = 5183
# Vite binds to "localhost" (may be ::1 only), so 127.0.0.1 can be refused.
$Url = "http://localhost:${Port}${Path}"

function Test-Ready {
  param([string]$TargetUrl)
  try {
    $Response = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 1
    return $Response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-Ready -TargetUrl $Url)) {
  $LogDir = Join-Path $Root ".dev-server"
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
  $OutLog = Join-Path $LogDir "dev-server.out.log"
  $ErrLog = Join-Path $LogDir "dev-server.err.log"

  Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev") `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog | Out-Null

  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 120; $Attempt += 1) {
    Start-Sleep -Milliseconds 250
    if (Test-Ready -TargetUrl $Url) {
      $Ready = $true
      break
    }
  }

  if (-not $Ready) {
    Write-Host "Dev server could not start on localhost:${Port}."
    Write-Host "Logs:"
    Write-Host "  $OutLog"
    Write-Host "  $ErrLog"
    exit 1
  }
}

Start-Process $Url
Write-Host "Opened $Url"
