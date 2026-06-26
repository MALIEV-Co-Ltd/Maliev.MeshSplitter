param(
  [string]$InstallDir = '',
  [string]$ComposeFile = '',
  [string]$EnvFile = ''
)

if (-not $InstallDir) {
  $InstallDir = (Get-Location).Path
}

if (-not $ComposeFile) {
  $ComposeFile = Join-Path -Path $InstallDir -ChildPath 'docker-compose.lan.yml'
}

if (-not $EnvFile) {
  $EnvFile = Join-Path -Path $InstallDir -ChildPath '.env.mesh-splitter.local'
}

if (-not (Test-Path -Path $ComposeFile)) {
  Write-Error "Compose file not found: $ComposeFile"
  exit 1
}

if (-not (Test-Path -Path $EnvFile)) {
  Write-Error "Env file not found: $EnvFile"
  exit 1
}

$composeCmd = @()
if (Get-Command docker -ErrorAction SilentlyContinue) {
  try {
    docker compose version 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $composeCmd = @('docker', 'compose')
    }
  } catch {
    $composeCmd = @()
  }
}

if (-not $composeCmd -and (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
  $composeCmd = @('docker-compose')
}

if (-not $composeCmd) {
  Write-Error 'No docker compose binary found. Install Docker Compose from Synology Container Manager.'
  exit 1
}

function Invoke-MeshSplitterCompose {
  param(
    [Parameter(Mandatory = $true)][string[]]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  if ($Command.Length -eq 1) {
    & $Command[0] @Arguments
  } else {
    & $Command[0] $Command[1] @Arguments
  }
}

$healthPort = 3000
if (Test-Path -Path $EnvFile) {
  $envFileHealthPort = Get-Content -Path $EnvFile | ForEach-Object {
    if ($_ -match '^\s*MESH_SPLITTER_HOST_PORT\s*=\s*(.+)$') {
      ($Matches[1] -split '#')[0].Trim().Trim("'", '"')
    }
  } | Select-Object -First 1
  if ($envFileHealthPort) {
    $healthPort = $envFileHealthPort
  }
}

$host = 'mesh-splitter.local'
$expectedImage = $env:MESH_SPLITTER_IMAGE
if (-not $expectedImage) {
  $expectedImage = Get-Content -Path $EnvFile | ForEach-Object {
    if ($_ -match '^\s*MESH_SPLITTER_IMAGE\s*=\s*(.+)$') {
      ($Matches[1] -split '#')[0].Trim().Trim("'", '"')
    }
  } | Select-Object -First 1
}
if (-not $expectedImage) {
  $expectedImage = 'ghcr.io/maliev-co-ltd/maliev.meshsplitter:main'
}

Push-Location -Path $InstallDir

Invoke-MeshSplitterCompose -Command $composeCmd -Arguments @('-f', $ComposeFile, '--env-file', $EnvFile, 'ps')

if (Get-Command docker -ErrorAction SilentlyContinue) {
  try {
    $imageId = docker inspect --format '{{.Config.Image}}' mesh-splitter 2>$null
    if ($imageId) {
      Write-Output "Running image: $imageId"
      if ($imageId -ne $expectedImage) {
        Write-Error "Running image is not pinned to expected image: $expectedImage"
        Pop-Location
        exit 1
      }
    }
  } catch {
    Write-Error 'mesh-splitter container not found.'
    Pop-Location
    exit 1
  }
}

Write-Output "Checking hostname resolution for ${host}:"
if (Test-Connection -Count 1 -Quiet -ComputerName $host) {
  Write-Output "Hostname resolves."
} else {
  Write-Error "Hostname $host did not resolve."
  Pop-Location
  exit 1
}

if (Get-Command Invoke-WebRequest -ErrorAction SilentlyContinue) {
  try {
    Write-Output "Checking local health endpoint (http://127.0.0.1:$healthPort/health):"
    $localHealth = Invoke-WebRequest -Uri "http://127.0.0.1:$healthPort/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    if ($localHealth.StatusCode -eq 200) {
      Write-Output 'Local health endpoint OK.'
    } else {
      Write-Error 'Local health endpoint failed.'
      Pop-Location
      exit 1
    }
  } catch {
    Write-Error 'Local health endpoint failed.'
    Pop-Location
    exit 1
  }

  try {
    Write-Output "Checking LAN hostname endpoint (https://mesh-splitter.local/health):"
    $lanHealth = Invoke-WebRequest -Uri "https://$host/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    if ($lanHealth.StatusCode -eq 200) {
      Write-Output 'LAN HTTPS endpoint OK.'
    } else {
      Write-Error 'LAN HTTPS endpoint failed.'
      Pop-Location
      exit 1
    }
  } catch {
    Write-Error 'LAN HTTPS endpoint failed.'
    Pop-Location
    exit 1
  }
} else {
  Write-Output 'Invoke-WebRequest not found; skip endpoint checks.'
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
  Write-Output 'Watchtower activity (last 10m):'
  docker logs mesh-splitter-watchtower --since 10m 2>$null | Select-String -Pattern 'mesh-splitter' -SimpleMatch | ForEach-Object { $_.Line }
}

Pop-Location
