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

function Get-EnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key
  )
  $line = Get-Content -Path $Path | Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=\s*" } | Select-Object -First 1
  if ($line -and $line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.+)$") {
    return ($Matches[1] -split '#')[0].Trim().Trim("'", '"')
  }
  return ''
}

$ghcrUser = Get-EnvValue -Path $EnvFile -Key 'GHCR_USERNAME'
$ghcrToken = Get-EnvValue -Path $EnvFile -Key 'GHCR_TOKEN'

if ($ghcrUser -and $ghcrToken) {
  Write-Output 'Ensuring GHCR authentication for Docker daemon (for watchtower and local pulls)...'
  $secureToken = ConvertTo-SecureString $ghcrToken -AsPlainText -Force
  $cred = New-Object System.Management.Automation.PSCredential ($ghcrUser, $secureToken)
  try {
    $plainToken = $cred.GetNetworkCredential().Password
    $null = echo $plainToken | docker login ghcr.io -u $ghcrUser --password-stdin
    Write-Output 'GHCR login succeeded.'
  } catch {
    Write-Warning 'GHCR login failed. Check GHCR_USERNAME/GHCR_TOKEN.'
  }
} else {
  Write-Warning 'GHCR_USERNAME or GHCR_TOKEN is not set in .env file. Watchtower pull may fail for private GHCR images.'
}

if (Test-Path '/root/.docker/config.json') {
  Write-Output 'Using Docker auth config at /root/.docker/config.json.'
} else {
  Write-Warning '/root/.docker/config.json is not present on NAS.'
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
  Write-Output 'Watchtower auth/error signals (if any):'
  docker logs mesh-splitter-watchtower --since 10m 2>$null |
    Select-String -Pattern 'unauthorized|403|auth.*not present' |
    ForEach-Object { $_.Line }
  Write-Output 'Watchtower env & mount checks:'
  $watchtowerEnv = docker inspect mesh-splitter-watchtower --format '{{range .Config.Env}}{{println .}}{{end}}' 2>$null
  $watchtowerMounts = docker inspect mesh-splitter-watchtower --format '{{range .Mounts}}{{println .Source " -> " .Destination}}{{end}}' 2>$null
  $watchTowerRepoUser = $watchtowerEnv | Where-Object { $_ -like 'REPO_USER=*' } | Select-Object -First 1
  $watchTowerRepoPass = $watchtowerEnv | Where-Object { $_ -like 'REPO_PASS=*' } | Select-Object -First 1

  if ($watchTowerRepoUser -and $watchTowerRepoPass) {
    Write-Output 'Watchtower REPO credentials are present in container env (values intentionally not shown).'
  } else {
    Write-Output 'Watchtower container does not currently have REPO_USER/REPO_PASS env values.'
  }

  $watchtowerEnv |
    Where-Object { $_ -match '^DOCKER_CONFIG=' } |
    ForEach-Object { $_ }
  Write-Output 'Watchtower mount check:'
  $watchtowerMounts |
    Select-String -Pattern '/root/.docker|/config' |
    ForEach-Object { $_.Line }

  if (docker exec mesh-splitter-watchtower test -r /config/config.json 2>$null) {
    if (docker exec mesh-splitter-watchtower grep -q '"ghcr.io"' /config/config.json 2>$null) {
      Write-Output 'Found ghcr.io entry in watchtower container /config/config.json.'
    } else {
      Write-Output 'No ghcr.io auth entry found in watchtower container /config/config.json.'
    }
  } else {
    Write-Output '/config/config.json not available inside watchtower container.'
  }
}

Pop-Location
