@echo off
REM LS 포털 감시 — 15:00~23:00, 10분 간격
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" ls_automation.py --watch --interval 10 --start-hour 15 --end-hour 23 %*
) else (
  python ls_automation.py --watch --interval 10 --start-hour 15 --end-hour 23 %*
)
