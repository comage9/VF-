@echo off
setlocal enabledelayedexpansion

set "FORM_URL=https://forms.office.com/pages/responsepage.aspx?id=vnSfnWt49kiOGIPPei7vfAL8tnw3ZhhAu6sqpd-f1oNUMjFZM1MzNEZZNE0wNURFVUhLOUg3OTVaNCQlQCN0PWcu"
set "TIMESTAMP=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "TIMESTAMP=%TIMESTAMP: =0%"
set "SCREENSHOT_DIR=.playwright-cli\checkin"
set "SESSION_NAME=vf-checkin"

set "CENTER=VF67"
set "NAME=김주현"
set "PHONE=010-4725-2242"
set "WORK_TIME=14:00~01:00"
set "WORKER_COUNT=3"
set "FACILITY_DAMAGE=없음"

mkdir "%SCREENSHOT_DIR%" 2>nul

echo === VF 체크인 시작: %date% %time% ===

playwright-cli -s=%SESSION_NAME% close 2>nul

echo [1/8] 브라우저 열기...
playwright-cli -s=%SESSION_NAME% open "%FORM_URL%"
timeout /t 2 >nul

echo [2/8] 근무자 성함 입력: %NAME%
playwright-cli -s=%SESSION_NAME% fill e84 "%NAME%"

echo [3/8] 연락처 입력: %PHONE%
playwright-cli -s=%SESSION_NAME% fill e98 "%PHONE%"

echo [4/8] 출고 운영 시간: %WORK_TIME%
playwright-cli -s=%SESSION_NAME% fill e112 "%WORK_TIME%"

echo [5/8] 근무 인원: %WORKER_COUNT%
playwright-cli -s=%SESSION_NAME% fill e127 "%WORKER_COUNT%"

echo [6/8] 시설 피해 유무: %FACILITY_DAMAGE%
if "%FACILITY_DAMAGE%"=="없음" (
    playwright-cli -s=%SESSION_NAME% click e156
) else (
    playwright-cli -s=%SESSION_NAME% click e147
)

echo 제출 전 스크린샷...
playwright-cli -s=%SESSION_NAME% screenshot --filename="%SCREENSHOT_DIR%\before_%TIMESTAMP%.png"

echo [7/8] 제출...
playwright-cli -s=%SESSION_NAME% click e163
timeout /t 3 >nul

echo 제출 후 스크린샷...
playwright-cli -s=%SESSION_NAME% screenshot --filename="%SCREENSHOT_DIR%\after_%TIMESTAMP%.png"

echo [8/8] 브라우저 닫기...
playwright-cli -s=%SESSION_NAME% close

echo === 완료: %date% %time% ===
dir "%SCREENSHOT_DIR%"
