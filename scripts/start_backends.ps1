# Start both backends required by Vite proxy (5174 frontend)
#   Django :5176  — departure, master CRUD, uploads, etc.
#   Go     :5177  — outbound list/stats, inventory/unified, current-stock, ...
#
# Usage:
#   powershell -File E:\coding\VF-new\scripts\start_backends.ps1
#
# Then: cd frontend\client && npm run dev

$ErrorActionPreference = "Continue"

function Test-Port([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

Write-Host "=== VF backends ===" -ForegroundColor Cyan

# Django 5176
if (Test-Port 5176) {
  Write-Host "[OK] Django already on :5176" -ForegroundColor Green
} else {
  Write-Host "[..] Starting Django manage.py runserver :5176" -ForegroundColor Yellow
  $djangoDir = "E:\coding\VF-new\backend"
  $py = Join-Path $djangoDir ".venv\Scripts\python.exe"
  if (-not (Test-Path $py)) { $py = "python" }
  Start-Process -FilePath $py -ArgumentList "manage.py","runserver","0.0.0.0:5176" `
    -WorkingDirectory $djangoDir -WindowStyle Minimized
  Start-Sleep -Seconds 3
  if (Test-Port 5176) { Write-Host "[OK] Django :5176" -ForegroundColor Green }
  else { Write-Host "[!!] Django failed to listen :5176" -ForegroundColor Red }
}

# Go 5177
if (Test-Port 5177) {
  Write-Host "[OK] vf-go already on :5177" -ForegroundColor Green
} else {
  Write-Host "[..] Starting vf-go-api :5177" -ForegroundColor Yellow
  $goDir = "E:\coding\VF-go"
  $loadEnv = Join-Path $goDir "scripts\load_env.ps1"
  $exe = Join-Path $goDir "bin\vf-go-api.exe"
  if (-not (Test-Path $exe)) {
    Write-Host "    Building $exe ..."
    Push-Location $goDir
    try { go build -o bin\vf-go-api.exe .\cmd\api } finally { Pop-Location }
  }
  # Start with env from .env
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $psi.WorkingDirectory = $goDir
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $false  # show window so user sees logs
  $envFile = Join-Path $goDir ".env"
  if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
      if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
      $i = $_.IndexOf('=')
      if ($i -lt 1) { return }
      $psi.Environment[$_.Substring(0, $i).Trim()] = $_.Substring($i + 1).Trim()
    }
  }
  [void][System.Diagnostics.Process]::Start($psi)
  Start-Sleep -Seconds 2
  if (Test-Port 5177) { Write-Host "[OK] vf-go :5177" -ForegroundColor Green }
  else { Write-Host "[!!] vf-go failed — check .env and: cd E:\coding\VF-go; . .\scripts\load_env.ps1; go run .\cmd\api" -ForegroundColor Red }
}

Write-Host ""
Write-Host "Vite proxy needs BOTH:" -ForegroundColor Cyan
Write-Host "  Django  http://127.0.0.1:5176"
Write-Host "  Go      http://127.0.0.1:5177"
Write-Host "  Front   http://localhost:5174  (npm run dev)"
Write-Host ""
# quick probe
foreach ($u in @(
    "http://127.0.0.1:5176/api/outbound/meta",
    "http://127.0.0.1:5177/api/health"
  )) {
  try {
    $r = Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 5
    Write-Host "  probe $u -> $($r.StatusCode)" -ForegroundColor Green
  } catch {
    Write-Host "  probe $u -> FAIL" -ForegroundColor Red
  }
}
