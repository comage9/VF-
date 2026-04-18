@echo off
REM OptSync - OpenClaw 옵시디언 자동 동기화 스크립트
REM =============================================
REM Windows 동기화를 위한 OptSync 배치 파일
REM =============================================
REM 사용법: optsync.bat [pull|push|status|all]
REM 기본 동작: sync (pull + commit + push)
REM =============================================

set WORKSPACE_DIR=C:\Users\comage\.openclaw\workspace
set REMOTE_REPO=https://github.com/comage9/VF-.git

REM 사용자 입력 받기 (없으면 기본값 사용)
if "%1"=="" (set ACTION=pull) else (set ACTION=%1)

echo =============================================
echo OptSync - OpenClaw 옵시디언 동기화
echo =============================================
echo 동작: %ACTION%
echo =============================================
echo.

cd /d %WORKSPACE_DIR%

if /i "%ACTION%"=="sync" (
    echo [1] Pull from GitHub...
    git pull %REMOTE_REPO% main
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Pull 성공
    ) else (
        echo [ERROR] Pull 실패
        pause
        exit /b 1
    )
    
    echo.
    echo [2] Staging 모든 변경사항...
    git add .
    
    echo.
    echo [3] Commit...
    git commit -m "auto sync: %date% %time%"
    
    echo.
    echo [4] Push to GitHub...
    git push %REMOTE_REPO% main
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Push 성공
    ) else (
        echo [ERROR] Push 실패
        pause
        exit /b 1
    )
    
    echo.
    echo =============================================
    echo ✓ 동기화 완료!
    echo =============================================
    
) else if /i "%ACTION%"=="pull" (
    echo [Pull] 현재 브랜치에서 최신 코드 받아오기...
    echo ------------------------------------
    git pull %REMOTE_REPO% main
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Pull 완료
    ) else (
        echo [ERROR] 충돌 발생. 수동으로 해결 필요.
    )
    echo ------------------------------------
    
) else if /i "%ACTION%"=="push" (
    echo [Push] 변경사항 GitHub 에 푸시...
    echo ------------------------------------
    
    echo [1] Staging 모든 변경사항...
    git add .
    
    echo.
    echo [2] Commit...
    git commit -m "auto sync: %date% %time%"
    
    echo.
    echo [3] Push to GitHub...
    git push %REMOTE_REPO% main
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Push 완료
    ) else (
        echo [ERROR] Push 실패
    )
    echo ------------------------------------
    
) else if /i "%ACTION%"=="status" (
    echo [Status] Git 상태 확인...
    echo ------------------------------------
    git status
    echo ------------------------------------
    
) else if /i "%ACTION%"=="log" (
    echo [Log] 최근 커밋 확인...
    echo.
    git log --oneline -10
    echo.
    
) else if /i "%ACTION%"=="diff" (
    echo [Diff] 변경 파일 확인...
    echo.
    git status --short
    echo.
    
) else if /i "%ACTION%"=="all" (
    echo [ALL] 전체 작업 수행...
    echo.
    
    echo [1] Pull from GitHub...
    git pull %REMOTE_REPO% main
    if %ERRORLEVEL% NEQ 0 (
        echo [WARNING] Pull 중 충돌 발생. 수동 해결 필요.
    )
    
    echo.
    echo [2] Push 변경사항...
    echo Staging 모든 변경사항...
    git add .
    
    echo.
    echo Commit...
    git commit -m "auto sync: %date% %time%"
    
    echo.
    echo Push to GitHub...
    git push %REMOTE_REPO% main
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Push 완료
    ) else (
        echo [ERROR] Push 실패
    )
    
    echo.
    echo =============================================
    echo ✓ 전체 작업 완료!
    echo =============================================
    
) else (
    echo.
    echo 오용된 명령어입니다: %ACTION%
    echo.
    echo 사용 가능한 명령어:
    echo   sync  - Pull + Commit + Push (기본)
    echo   pull  - 원격에서 Pull 만
    echo   push  - 현재 변경사항 Push
    echo   status - Git 상태 확인
    echo   log - 최근 커밋 확인
    echo   diff - 변경 파일 확인
    echo   all   - 전체 작업 수행
    echo.
)

echo.
echo OptSync 종료
echo =============================================

if "%ACTION%"=="pull" (
    echo.
    echo [주의] pull 명령어는 Push 하지 않습니다.
    echo push 하려면: optsync.bat push
    echo 모두 하려면: optsync.bat sync
    pause
)

exit /b 0
