@echo off
chcp 65001 >nul
echo ================================================
echo   VF Analytics Dashboard - Django Backend
echo ================================================
echo.
echo Starting Django Backend on port 5176...
echo.

cd /d "%~dp0backend"

if not exist .venv (
    echo Error: Virtual environment not found!
    echo Please run: python -m venv .venv
    echo Then: .venv\Scripts\activate
    echo Then: pip install -r requirements.txt
    pause
    exit /b 1
)

call .venv\Scripts\activate
python manage.py runserver 0.0.0.0:5176

pause
