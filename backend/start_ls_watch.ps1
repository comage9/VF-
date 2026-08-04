# LS 포털 감시 (15:00~23:00, 10분 간격)
# 로그인(patchright) → 배정 조회(Scrapling) → PDF 다운로드 → Departure 즉시 등록
#
# 사용:
#   cd E:\coding\VF-new\backend
#   .\start_ls_watch.ps1
#   .\start_ls_watch.ps1 -Interval 10 -StartHour 15

param(
    [int]$Interval = 10,
    [int]$StartHour = 15,
    [int]$EndHour = 23,
    [string]$Date = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Py = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Py)) {
    $Py = "python"
}

$args = @("ls_automation.py", "--watch", "--interval", "$Interval", "--start-hour", "$StartHour", "--end-hour", "$EndHour")
if ($Date) {
    $args += @("--date", $Date)
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " LS Watch 시작" -ForegroundColor Cyan
Write-Host "  interval=${Interval}m  ${StartHour}:00~${EndHour}:00" -ForegroundColor Cyan
Write-Host "  python: $Py" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

& $Py @args
