$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Backend setup
Write-Host "Setting up backend..." -ForegroundColor Cyan
if (-not (Test-Path "$root\backend\.venv")) {
    python -m venv "$root\backend\.venv"
    & "$root\backend\.venv\Scripts\pip" install -r "$root\backend\requirements.txt"
}

Write-Host "Starting backend..." -ForegroundColor Cyan
$backendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    & ".\backend\.venv\Scripts\uvicorn" backend.main:app --host 0.0.0.0 --port 8080 --reload
} -ArgumentList $root

# Frontend setup
Write-Host "Setting up frontend..." -ForegroundColor Cyan
Set-Location "$root\frontend"
if (-not (Test-Path "node_modules")) {
    npm install
}

Write-Host "Starting frontend..." -ForegroundColor Cyan
$frontendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location "$dir\frontend"
    npx vite --host
} -ArgumentList $root

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Mesh Splitter is running!" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "  Backend:  http://localhost:8080" -ForegroundColor Green
Write-Host "  API docs: http://localhost:8080/docs" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop both servers." -ForegroundColor Yellow

try {
    while ($true) { Start-Sleep -Seconds 1 }
} finally {
    $backendJob | Stop-Job -PassThru | Remove-Job
    $frontendJob | Stop-Job -PassThru | Remove-Job
}
