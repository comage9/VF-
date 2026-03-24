@echo off
chcp 65001 >nul
echo ================================================
echo   VF Analytics Dashboard - Stop All Servers
echo ================================================
echo.
echo Stopping servers on ports 5174 and 5176...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174') do (
    echo Killing process %%a on port 5174
    taskkill /PID %%a /F 2>nul
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5176') do (
    echo Killing process %%a on port 5176
    taskkill /PID %%a /F 2>nul
)

timeout /t 2 /nobreak >nul

echo.
echo ================================================
echo Servers stopped!
echo ================================================
echo.
pause
