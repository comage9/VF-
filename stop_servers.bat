@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

echo ================================================
echo   VF Analytics Dashboard - Stop All Servers
echo ================================================
echo.
echo [1/5] Ports 5174 / 5176 (LISTENING only)...
echo.

REM --- Kill unique PIDs listening on 5174 / 5176 ---
set "KILLED="
for %%P in (5174 5176) do (
    for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /R /C:":%%P .*LISTENING"') do (
        set "PID=%%a"
        if not "!PID!"=="0" if not "!PID!"=="" (
            echo   Port %%P -^> PID !PID!
            taskkill /PID !PID! /T /F >nul 2>&1
            set "KILLED=1"
        )
    )
)

echo.
echo [2/5] Duplicate Django runserver (manage.py runserver)...
echo.

REM --- Kill all manage.py runserver (including orphans not holding the port) ---
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$n=0; Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and ($_.CommandLine -match 'manage\.py\s+runserver' -or $_.CommandLine -match 'gunicorn.*config\.wsgi') } | ForEach-Object { Write-Host ('  kill runserver PID=' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $n++ }; if ($n -eq 0) { Write-Host '  (none)' } else { Write-Host ('  stopped ' + $n + ' process(es)') }"

echo.
echo [3/5] Vite / frontend (vite, npm run dev on 5174)...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$n=0; Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and ( ($_.CommandLine -match 'vite' -and $_.CommandLine -match '5174|VF-new\\frontend|VF-new/frontend') -or ($_.CommandLine -match 'npm.*run.*dev' -and $_.CommandLine -match 'frontend') ) } | ForEach-Object { Write-Host ('  kill frontend PID=' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $n++ }; if ($n -eq 0) { Write-Host '  (none)' } else { Write-Host ('  stopped ' + $n + ' process(es)') }"

echo.
echo [4/5] LS automation watch (ls_automation.py)...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$n=0; Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -match 'ls_automation\.py' } | ForEach-Object { Write-Host ('  kill ls_automation PID=' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $n++ }; if ($n -eq 0) { Write-Host '  (none)' } else { Write-Host ('  stopped ' + $n + ' process(es)') }"

echo.
echo [5/5] Stale lock / leftover port holders...
echo.

REM --- Remove LS watch lock so next start is clean ---
if exist "%~dp0backend\departure\data\.ls_watch.lock" (
    del /f /q "%~dp0backend\departure\data\.ls_watch.lock" >nul 2>&1
    echo   removed backend\departure\data\.ls_watch.lock
) else (
    echo   (no .ls_watch.lock)
)

REM --- Second pass: anything still LISTENING on 5174/5176 ---
timeout /t 1 /nobreak >nul
for %%P in (5174 5176) do (
    for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /R /C:":%%P .*LISTENING"') do (
        echo   still on port %%P -^> force kill PID %%a
        taskkill /PID %%a /T /F >nul 2>&1
    )
)

timeout /t 1 /nobreak >nul

echo.
echo ================================================
echo   Status after stop
echo ================================================
netstat -ano 2>nul | findstr /R /C:":5174 .*LISTENING" /C:":5176 .*LISTENING"
if errorlevel 1 (
    echo   5174 / 5176 : free
) else (
    echo   WARNING: some listeners remain - check Task Manager
)

echo.
echo Servers stopped. Duplicates cleaned.
echo ================================================
echo.
pause
endlocal
