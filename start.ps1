$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== Mesh Splitter ===" -ForegroundColor Cyan

# Backend
Write-Host "[1/4] Setting up backend..." -ForegroundColor Yellow
$venvDir = "$root\backend\.venv"
if (-not (Test-Path $venvDir)) {
    python -m venv $venvDir
    & "$venvDir\Scripts\pip" install -r "$root\backend\requirements.txt"
}

Write-Host "[2/4] Starting backend on :8080..." -ForegroundColor Yellow
$backend = Start-Job -ScriptBlock {
    param($d)
    Set-Location "$d\backend"
    & ".venv\Scripts\python" -m uvicorn main:app --host 0.0.0.0 --port 8080
} -ArgumentList $root

Start-Sleep 2

# Frontend
Write-Host "[3/4] Installing frontend deps..." -ForegroundColor Yellow
if (-not (Test-Path "$root\frontend\node_modules")) {
    Push-Location "$root\frontend"; npm install; Pop-Location
}

Write-Host "[4/4] Starting frontend on :5173..." -ForegroundColor Yellow
$frontend = Start-Job -ScriptBlock {
    param($d)
    Set-Location "$d\frontend"
    npx vite
} -ArgumentList $root

Write-Host "`n  Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "  Backend:  http://localhost:8080`n" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop`n" -ForegroundColor Cyan

try { while ($true) { Start-Sleep 1 } }
finally { Stop-Job $backend,$frontend -PassThru | Remove-Job }
