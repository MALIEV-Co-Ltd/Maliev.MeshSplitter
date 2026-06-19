param([switch]$Open)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== Mesh Splitter ===" -ForegroundColor Cyan
Write-Host "Fully offline — no backend required`n" -ForegroundColor Yellow

if (-not (Test-Path "$root\frontend\node_modules")) {
    Write-Host "Installing frontend deps..." -ForegroundColor Yellow
    Push-Location "$root\frontend"; npm install; Pop-Location
}

if ($Open) {
    Push-Location "$root\frontend"; npx vite --open; Pop-Location
} else {
    Push-Location "$root\frontend"; npx vite; Pop-Location
}
