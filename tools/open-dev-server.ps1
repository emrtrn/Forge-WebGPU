param(
  [string]$Path = "/",
  # Project the editor opens; empty = samples/starter (npm run dev's default).
  [string]$Project = "",
  # When given, $Project is mirrored from this folder before the server starts
  # (a scratch copy: saving in the editor never touches the source).
  [string]$MirrorFrom = ""
)

# Starts `npm run dev` (port 5183, strictPort) hidden for the wanted project,
# then opens the page in the default browser. One editor at a time: a server
# on 5183 serving another project is stopped first. Stop it with
# stop-dev-server.ps1.
$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Port = 5183
# Vite binds to "localhost" (may be ::1 only), so 127.0.0.1 can be refused.
$Base = "http://localhost:${Port}"
$Url = "${Base}${Path}"

function Normalize-Root {
  param([string]$Folder)
  return [System.IO.Path]::GetFullPath($Folder).TrimEnd('\', '/')
}

$WantedRoot = if ($Project -eq "") {
  Normalize-Root (Join-Path $Root "samples/starter")
} else {
  Normalize-Root $Project
}

function Get-ServedRoot {
  try {
    $Response = Invoke-WebRequest -Uri "${Base}/__forge/identity" -Headers @{ "X-Forge-Request" = "1" } -UseBasicParsing -TimeoutSec 1
    if ($Response.StatusCode -ne 200) { return $null }
    $Identity = $Response.Content | ConvertFrom-Json
    return Normalize-Root $Identity.project.root
  } catch {
    return $null
  }
}

function Test-Listening {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

$Served = Get-ServedRoot
if ($null -ne $Served -and $Served -ieq $WantedRoot) {
  Start-Process $Url
  Write-Host "Opened $Url ($WantedRoot)"
  exit 0
}

if (Test-Listening) {
  Write-Host "Port $Port serves $(if ($Served) { $Served } else { 'another server' }); stopping it."
  & (Join-Path $PSScriptRoot "stop-dev-server.ps1")
  for ($Attempt = 0; $Attempt -lt 40 -and (Test-Listening); $Attempt += 1) {
    Start-Sleep -Milliseconds 250
  }
  if (Test-Listening) {
    Write-Host "Port $Port is still taken."
    exit 1
  }
}

if ($MirrorFrom -ne "") {
  $Source = Normalize-Root $MirrorFrom
  if (-not (Test-Path (Join-Path $Source "forge.project.json"))) {
    Write-Host "Not a Forge project: $Source"
    exit 1
  }
  Write-Host "Mirroring $Source -> $WantedRoot"
  # /MIR copies only what changed and deletes what the source lacks; the
  # project's .forge cache stays out.
  robocopy $Source $WantedRoot /MIR /XD (Join-Path $Source ".forge") /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) {
    Write-Host "robocopy failed (exit $LASTEXITCODE)."
    exit 1
  }
}

$LogDir = Join-Path $Root ".dev-server"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$OutLog = Join-Path $LogDir "dev-server.out.log"
$ErrLog = Join-Path $LogDir "dev-server.err.log"

if ($Project -eq "") {
  Remove-Item Env:FORGE_PROJECT_ROOT -ErrorAction SilentlyContinue
} else {
  $env:FORGE_PROJECT_ROOT = $WantedRoot
}

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
  if ((Get-ServedRoot) -ieq $WantedRoot) {
    $Ready = $true
    break
  }
}

if (-not $Ready) {
  Write-Host "Dev server could not start on localhost:${Port} for $WantedRoot."
  Write-Host "Logs:"
  Write-Host "  $OutLog"
  Write-Host "  $ErrLog"
  exit 1
}

Start-Process $Url
Write-Host "Opened $Url ($WantedRoot)"
