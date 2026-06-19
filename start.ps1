param([switch]$Open)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== Mesh Splitter ===" -ForegroundColor Cyan
Write-Host "Fully offline - no backend required" -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path "$root\frontend\node_modules")) {
    Write-Host "Installing frontend deps..." -ForegroundColor Yellow
    Push-Location "$root\frontend"
    npm install
    Pop-Location
}

Push-Location "$root\frontend"
if ($Open) {
    npx vite --open
} else {
    npx vite
}
Pop-Location
