@echo off
rem ===================================================
rem OpenClaw Workspace Git 동기화.bat
rem 윈도우에서 옵시디언同步용 자동화 스크립트
rem ===================================================

echo ============================================
echo   OpenClaw Workspace Git 동기화
echo ============================================
echo.

rem 사용자명 자동 감지
set WORKSPACE=C:\Users\%USERNAME%\.openclaw\workspace
set LOG_FILE=C:\Users\%USERNAME%\openclaw_sync_log.txt

echo [1] 작업 폴더 이동...
cd /d "%WORKSPACE%"
if errorlevel 1 (
    echo [에러] 작업 폴더를 찾을 수 없습니다: %WORKSPACE%
    pause
    exit /b 1
)

echo [2] 현재 상태 확인...
echo %date% %time% - 동기화 시작 >> "%LOG_FILE%"
git status >> "%LOG_FILE%" 2>&1
echo.

rem git add -A 명령 추가
echo [3] 변경사항 수집 중...
git add -A
if errorlevel 1 (
    echo [경고] Git add 중 문제가 발생했습니다.
    echo >> "%LOG_FILE%"
    date /t time /t >> "%LOG_FILE%"
    echo [경고] - 오류 발생: %ERRORLEVEL% >> "%LOG_FILE%"
) else (
    echo   ✓ 변경사항 수집 완료
)

echo.
echo [4] 커밋 생성 중...
set /p COMMIT_MSG="커밋 메시지 입력 (기본:자동 업데이트 [%date%-%time%]): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=자동 업데이트 [%date% %time%]

git commit -m "%COMMIT_MSG%" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo   (변경사항이 없음 또는 커밋 오류)
) else (
    echo   ✓ 커밋 완료: %COMMIT_MSG%
)

echo.
echo [5] 원격 저장소로 푸시 중...
git push origin main >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo.
    echo [경고] Git Push 중 문제가 발생했습니다.
    echo   - 오류 코드: %ERRORLEVEL%
    echo   - 로그 확인: %LOG_FILE%
    rem 푸시 실패 시에도 계속 진행
) else (
    echo   ✓ 원격 저장소 동기화 완료
)

echo.
echo ============================================
echo   동기화 완료 (시간: %date% %time%)
echo   로그 파일: %LOG_FILE%
echo ============================================
echo.

pause
