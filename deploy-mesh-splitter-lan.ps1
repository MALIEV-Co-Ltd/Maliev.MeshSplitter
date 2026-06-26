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
  Write-Error "Env file not found: $EnvFile. Copy .env.mesh-splitter.local.example to .env.mesh-splitter.local and fill required values."
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
    $composeCmd = ''
  }
}

if (-not $composeCmd -and (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
  $composeCmd = @('docker-compose')
}

if (-not $composeCmd) {
  Write-Error 'No docker compose binary found. Install Docker Compose from Synology Container Manager.'
  exit 1
}

$healthPort = 3000
if (Test-Path -Path $EnvFile) {
  $envFileHealthPort = Get-Content -Path $EnvFile | ForEach-Object {
    if ($_ -match '^\s*MESH_SPLITTER_HOST_PORT\s*=\s*(.+)$') {
      $hostPort = ($Matches[1] -split '#')[0].Trim().Trim("'", '"')
      if ($hostPort) { $hostPort } else { $null }
    }
  } | Select-Object -First 1
  if ($envFileHealthPort) {
    $healthPort = $envFileHealthPort
  }
}
$envFileImage = Get-Content -Path $EnvFile | ForEach-Object {
  if ($_ -match '^\s*MESH_SPLITTER_IMAGE\s*=\s*(.+)$') {
    ($Matches[1] -split '#')[0].Trim().Trim("'", '"')
  }
} | Select-Object -First 1
if ($envFileImage -and $envFileImage -like '*:latest') {
  Write-Output "WARNING: .env.mesh-splitter.local has MESH_SPLITTER_IMAGE=$envFileImage"
  Write-Output 'For this NAS workflow, use :main so watchtower tracks your CI main releases.'
  Write-Output 'Set MESH_SPLITTER_IMAGE=ghcr.io/maliev-co-ltd/maliev.meshsplitter:main'
}

Push-Location -Path $InstallDir

Write-Output "Using compose command: $($composeCmd -join ' ')"
if (-not (Test-Path -Path '/root/.docker/config.json' -PathType Leaf)) {
  Write-Output 'WARNING: /root/.docker/config.json not found; private GHCR pull may fail.'
  Write-Output 'If this file is unavailable, set GHCR_USERNAME + GHCR_TOKEN in .env.mesh-splitter.local.'
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

function Get-EnvValueFromFile {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string]$Key
  )
  $line = Get-Content -Path $FilePath | Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  $value = ($line -split '=', 2)[1]
  return (($value -split '#', 2)[0]).Trim().Trim("'", '"')
}

$envGhcrUser = Get-EnvValueFromFile -FilePath $EnvFile -Key 'GHCR_USERNAME'
$envGhcrToken = Get-EnvValueFromFile -FilePath $EnvFile -Key 'GHCR_TOKEN'
if (-not $envGhcrUser -or -not $envGhcrToken) {
  Write-Output 'WARNING: GHCR_USERNAME or GHCR_TOKEN is not set in .env.mesh-splitter.local; private image pulls may fail in watchtower.'
} else {
  Write-Output 'Ensuring GHCR authentication for Docker daemon (for watchtower and local pulls)...'
  try {
    $secureToken = ConvertTo-SecureString $envGhcrToken -AsPlainText -Force
    $credential = New-Object System.Management.Automation.PSCredential ($envGhcrUser, $secureToken)
    $plainToken = $credential.GetNetworkCredential().Password
    $null = echo $plainToken | docker login ghcr.io -u $envGhcrUser --password-stdin
    Write-Output 'GHCR login succeeded.'
  } catch {
    Write-Warning 'GHCR login failed. Check GHCR_USERNAME/GHCR_TOKEN.'
  }
}

if (Test-Path -Path '/root/.docker/config.json' -PathType Leaf) {
  Write-Output 'Using Docker auth config at /root/.docker/config.json.'
} else {
  Write-Warning '/root/.docker/config.json is not present on NAS.'
}

Invoke-MeshSplitterCompose -Command $composeCmd -Arguments @('-f', $ComposeFile, '--env-file', $EnvFile, 'pull')
Invoke-MeshSplitterCompose -Command $composeCmd -Arguments @('-f', $ComposeFile, '--env-file', $EnvFile, 'up', '-d', '--force-recreate')

Start-Sleep -Seconds 5
Invoke-MeshSplitterCompose -Command $composeCmd -Arguments @('-f', $ComposeFile, '--env-file', $EnvFile, 'ps')

try {
  $imageId = docker inspect --format '{{json .Config.Image}}' mesh-splitter 2>$null
  if ($imageId) {
    Write-Output "mesh-splitter image: $imageId"
  }
} catch {
  # Ignore inspect failures if container is not yet available
}
Write-Output "Health check host port: $healthPort"

Write-Output 'Checking container health via mapped host port:'
if (Get-Command Invoke-WebRequest -ErrorAction SilentlyContinue) {
  for ($attempt = 1; $attempt -le 24; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:${healthPort}/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
      if ($response.StatusCode -eq 200) {
        Write-Output 'Container health endpoint OK.'
        break
      }
    } catch {}

    if ($attempt -eq 24) {
      Write-Error 'Timed out waiting for health endpoint.'
      Invoke-MeshSplitterCompose -Command $composeCmd -Arguments @('-f', $ComposeFile, '--env-file', $EnvFile, 'logs', '--tail', '80', 'mesh-splitter')
      exit 1
    }
    Write-Output "Health check attempt $attempt/24 failed; retrying..."
    Start-Sleep -Seconds 5
  }
} elseif (Get-Command curl -ErrorAction SilentlyContinue) {
  Write-Output 'Invoke-WebRequest unavailable; falling back to curl for health check.'
  for ($attempt = 1; $attempt -le 24; $attempt++) {
    try {
      $responseText = & curl -fsS "http://127.0.0.1:${healthPort}/health" 2>$null
      if ($LASTEXITCODE -eq 0 -and $responseText) {
        Write-Output 'Container health endpoint OK.'
        break
      }
    } catch {}

    if ($attempt -eq 24) {
      Write-Error 'Timed out waiting for health endpoint.'
      Invoke-MeshSplitterCompose -Command $composeCmd -Arguments @('-f', $ComposeFile, '--env-file', $EnvFile, 'logs', '--tail', '80', 'mesh-splitter')
      exit 1
    }
    Write-Output "Health check attempt $attempt/24 failed; retrying..."
    Start-Sleep -Seconds 5
  }
} else {
  Write-Output 'Invoke-WebRequest unavailable and curl not found; confirm mesh-splitter is healthy from DSM/Container logs.'
}

Write-Output 'Done. Configure/check HTTPS reverse proxy for https://mesh-splitter.local and test:'
Write-Output 'curl -k https://mesh-splitter.local/health'
Pop-Location
