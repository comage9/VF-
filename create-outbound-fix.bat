@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo VF Outbound-Tabs.tsx 수정 적용 도구
echo ========================================
echo.

REM 디렉토리 확인
if not exist ".env" (
    echo [1/4] .env 파일 생성 중...
    (
        echo # VF 프로젝트 환경 설정
        echo # 생성일: %date% %time%
        echo.
        echo # API 서버 설정
        echo NEXT_PUBLIC_API_URL=http://localhost:3000
        echo NEXT_PUBLIC_API_TIMEOUT=10000
        echo.
        echo # 데이터 소스 설정
        echo VF_DATA_SOURCE=local
        echo VF_DATA_PATH=./outbound-data.json
        echo.
        echo # 개발 모드 설정
        echo NODE_ENV=development
        echo NEXT_PUBLIC_DEBUG=true
        echo.
        echo # 인증 설정 (필요시)
        echo # VF_API_KEY=your_api_key_here
        echo # VF_API_SECRET=your_secret_here
    ) > .env
    echo ✓ .env 파일 생성 완료
) else (
    echo [1/4] .env 파일이 이미 존재합니다 (건너뜀)
)
echo.

REM 데이터 파일 생성
if not exist "outbound-data.json" (
    echo [2/4] outbound-data.json 생성 중...
    (
        echo {
        echo   "success": true,
        echo   "message": "로컬 테스트 데이터입니다",
        echo   "data": {
        echo     "outboundTabs": [
        echo       {
        echo         "id": 1,
        echo         "title": "생산 계획",
        echo         "description": "생산 계획 관리",
        echo         "icon": "📋",
        echo         "active": true,
        echo         "items": [
        echo           {"id": 101, "name": "생산 주문 A", "status": "진행중", "date": "2026-04-16"},
        echo           {"id": 102, "name": "생산 주문 B", "status": "대기", "date": "2026-04-17"}
        echo         ]
        echo       },
        echo       {
        echo         "id": 2,
        echo         "title": "출고 관리",
        echo         "description": "출고 관리",
        echo         "icon": "🚚",
        echo         "active": false,
        echo         "items": [
        echo           {"id": 201, "name": "출고 주문 A", "status": "완료", "date": "2026-04-15"}
        echo         ]
        echo       }
        echo     ]
        echo   },
        echo   "timestamp": "%date% %time%"
        echo }
    ) > outbound-data.json
    echo ✓ outbound-data.json 생성 완료
) else (
    echo [2/4] outbound-data.json이 이미 존재합니다 (건너뜀)
)
echo.

REM 패키지 설치 확인
echo [3/4] 패키지 설치 확인 중...
if not exist "node_modules" (
    echo 필요한 패키지가 없습니다. 설치를 시작합니다...
    call npm install
    if !errorlevel! neq 0 (
        echo ✗ 패키지 설치 실패
        pause
        exit /b 1
    )
    echo ✓ 패키지 설치 완료
) else (
    echo ✓ node_modules가 존재합니다 (건너뜀)
)
echo.

REM 서버 재시작 옵션
echo [4/4] 서버 재시작 옵션
echo.
echo 선택할 서버 재시작 방법:
echo   1. npm start (기본)
echo   2. npm run dev
echo   3. pm2 restart
echo   4. 서버 재시작 건너뜀
echo.
set /p restart_choice="선택 (1-4): "

if "!restart_choice!"=="1" (
    echo npm start로 서버 시작 중...
    call npm start
) else if "!restart_choice!"=="2" (
    echo npm run dev로 서버 시작 중...
    call npm run dev
) else if "!restart_choice!"=="3" (
    pm2 list
    echo.
    set /p pm2_name="PM2 프로세스 이름 입력 (Enter로 전체 재시작): "
    if "!pm2_name!"=="" (
        call pm2 restart all
    ) else (
        call pm2 restart !pm2_name!
    )
) else (
    echo 서버 재시작 건너뜀
)
echo.

REM 테스트 실행 가이드
echo ========================================
echo 테스트 실행 가이드
echo ========================================
echo.
echo 테스트 스크립트 실행:
echo   node test-outbound-connection.js
echo.
echo 또는 직접 테스트:
echo   curl http://localhost:3000/api/outbound-tabs
echo.
echo 브라우저 테스트:
echo   http://localhost:3000
echo.
echo ========================================
echo 적용 완료!
echo ========================================
echo.
pause
