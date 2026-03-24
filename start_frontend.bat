@echo off
chcp 65001 >nul
echo ================================================
echo   VF Analytics Dashboard - Frontend Server
echo ================================================
echo.
echo Starting Frontend Server on port 5174...
echo.

cd /d "%~dp0frontend"

set SERVER_HOST=0.0.0.0

echo Server Host: 0.0.0.0
echo Server Port: 5174
echo.

npx tsx server/index.ts

pause
