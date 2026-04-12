@echo off
chcp 65001 >nul
echo ================================================
echo   VF Analytics Dashboard - Start All Servers
echo ================================================
echo.
echo This will start both Django Backend and Frontend
echo in separate windows.
echo.
echo Press Ctrl+C in each window to stop the servers.
echo.
pause

echo Starting Django Backend...
start "VF Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\activate && python manage.py runserver 0.0.0.0:5176"

timeout /t 3 /nobreak >nul

echo Starting Frontend Server...
start "VF Frontend" cmd /k "cd /d %~dp0frontend\client && set SERVER_HOST=0.0.0.0 && npx tsx server/index.ts"

echo.
echo ================================================
echo Servers started!
echo.
echo Frontend: http://localhost:5174
echo Backend API: http://localhost:5176/api
echo.
echo Close this window to keep servers running,
echo or close the server windows to stop.
echo ================================================
echo.
pause
