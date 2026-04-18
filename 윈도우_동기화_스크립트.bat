@echo off
REM =============================================
REM Windows OptSync - OpenClaw 옵시디언 동기화 스크립트
REM =============================================
REM 사용법: optync.bat [sync|pull|push|status|all]
REM 기본 동작: sync (git pull + git push)
REM =============================================

REM 환경 설정
set WORKSPACE_DIR=C:\Users\comage\.openclaw\workspace
set REMOTE_REPO=https://github.com/comage9/VF-.git
set GH_TOKEN=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

REM 사용자 입력 받기 (없으면 기본값 사용)
if "%1"=="" (set ACTION=sync) else (set ACTION=%1)

echo =============================================
echo OptSync - OpenClaw 옵시디언 동기화 도구
echo =============================================
echo 작업: %ACTION%
echo =============================================

cd /d %WORKSPACE_DIR%

REM 상태 확인 함수
function CheckStatus() {
    echo.
    echo [단계 1] Git 상태 확인
    echo --------------------------------
    git status
    echo.
    echo --------------------------------
}

REM Pull 함수
function PullRepo() {
    echo.
    echo [단계 2] 원격 저장소에서 Pull
    echo --------------------------------
    git pull %REMOTE_REPO% main
    if %ERRORLEVEL% EQU 0 (
        echo ✓ Pull 성공
    ) else (
        echo ✗ Pull 실패
        exit /b 1
    )
    echo --------------------------------
}

REM Push 함수
function PushRepo() {
    echo.
    echo [단계 3] 변경사항 Push
    echo --------------------------------
    
    REM 변경사항 확인
    git diff --name-only HEAD
    echo.
    
    REM 단계 1: 모든 변경사항 Staging
    git add .
    echo [추가] 변경된 파일들을 Staging
    
    REM 단계 2: 커밋
    REM 자동 커밋 메시지 생성
    for /f "tokens=1-3 delims=/ " %%a in ('echo %date: =/%') do (
        set current_date=%%a-%%b-%%c
    )
    git commit -m "sync: %ACTION% - %date% %time%"
    echo [커밋] 자동 커밋 완료
    
    REM 단계 3: Push
    git push %REMOTE_REPO% main
    if %ERRORLEVEL% EQU 0 (
        echo ✓ Push 성공
    ) else (
        echo ✗ Push 실패
        exit /b 1
    )
    echo --------------------------------
}

REM 명령어 처리
if /i "%ACTION%"=="sync" (
    echo.
    echo [순서] Pull → Commit → Push
    echo.
    
    REM 1. Pull 먼저 수행
    Call :PullRepo
    
    REM 2. Push
    Call :PushRepo
    
    echo.
    echo ✓ 동기화 완료!
    
) else if /i "%ACTION%"=="pull" (
    Call :PullRepo
    
) else if /i "%ACTION%"=="push" (
    Call :PushRepo
    
) else if /i "%ACTION%"=="status" (
    Call :CheckStatus
    
) else if /i "%ACTION%"=="all" (
    echo.
    echo [완료] 전체 작업 수행
    echo.
    
    Call :CheckStatus
    Call :PullRepo
    Call :PushRepo
    
    echo.
    echo ✓ 전체 작업 완료!
    
) else (
    echo.
    echo 오용된 명령어입니다: %ACTION%
    echo.
    echo 사용 가능한 명령어:
    echo   sync  - Pull + Commit + Push (기본)
    echo   pull  - 원격에서 Pull 만
    echo   push  - 현재 변경사항 Push
    echo   status - Git 상태 확인
    echo   all   - 모든 작업 수행
    echo.
)

echo =============================================
echo OptSync 종료
echo =============================================
pause

exit /b 0
