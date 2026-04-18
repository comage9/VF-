@echo off
rem ===================================================
rem OpenClaw Workspace 자동 동기화
rem 작업 스케줄러용 백그라운드 스크립트
rem ===================================================

set WORKSPACE=C:\Users\%USERNAME%\.openclaw\workspace
set LOG_FILE=C:\Users\%USERNAME%\openclaw_auto_sync_log.txt
set DATE_FORMAT=%date:~0,4%%date:~5,2%%date:~8,2%
set TIME_FORMAT=%time:~0,2%%time:~3,2%%time:~6,2%

rem 숨겨진 로그 파일
set HIDDEN_LOG=%TEMP%\openclaw_sync_%DATE_FORMAT%_%TIME_FORMAT%.log

echo [%DATE_FORMAT% %TIME_FORMAT%] 자동 동기화 시작 >> "%HIDDEN_LOG%"

cd /d "%WORKSPACE%"
git add -A >> "%HIDDEN_LOG%" 2>&1
git commit -m "자동 동기화: %DATE_FORMAT% %TIME_FORMAT%" >> "%HIDDEN_LOG%" 2>&1
if !errorlevel! == 0 (
    git push origin main >> "%HIDDEN_LOG%" 2>&1
)

echo [%DATE_FORMAT% %TIME_FORMAT%] 자동 동기화 종료 >> "%HIDDEN_LOG%"

exit /b 0
