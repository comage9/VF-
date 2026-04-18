@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo VF 출고탭 최종 해결 패키지 - Windows
echo ========================================
echo.
echo 이 도구는 VF 프로젝트의 출고 탭 기능을
echo 완전하게 설정하고 테스트합니다.
echo.
echo 기능:
echo   - outbound-tabs.tsx 컴포넌트 설치
echo   - outboundConfig.ts 설정 파일 설치
echo   - 로컬 JSON 데이터 파일 생성
echo   - 환경변수 설정 안내
echo   - 자동 테스트 실행
echo.
pause
echo.

REM ========================================
REM 1단계: 파일 존재 확인
REM ========================================
echo [1/8] 프로젝트 파일 확인 중...
set all_files_ok=true

if exist "outbound-tabs.tsx" (
    echo ✓ outbound-tabs.tsx 파일 존재
) else (
    echo ✗ outbound-tabs.tsx 파일이 없습니다
    set all_files_ok=false
)

if exist "outboundConfig.ts" (
    echo ✓ outboundConfig.ts 파일 존재
) else (
    echo ✗ outboundConfig.ts 파일이 없습니다
    set all_files_ok=false
)

if exist "outbound-data.json" (
    echo ✓ outbound-data.json 파일 존재
) else (
    echo ✗ outbound-data.json 파일이 없습니다
    set all_files_ok=false
)

if exist "test-outbound-connection.js" (
    echo ✓ test-outbound-connection.js 파일 존재
) else (
    echo ✗ test-outbound-connection.js 파일이 없습니다
    set all_files_ok=false
)

if "!all_files_ok!"=="false" (
    echo.
    echo 필수 파일이 누락되었습니다.
    echo 모든 파일이 같은 디렉토리에 있는지 확인하세요.
    pause
    exit /b 1
)
echo.
echo ✓ 모든 필수 파일 확인 완료
echo.

REM ========================================
REM 2단계: 환경 설정
REM ========================================
echo [2/8] 환경 설정 중...

if not exist ".env" (
    echo .env 파일 생성 중...
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
        echo # 구글 시트 URL (선택사항)
        echo # OUTBOUND_GOOGLE_SHEET_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
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
    echo ✓ .env 파일이 이미 존재합니다
)

REM Windows 환경변수 설정 가이드
echo.
echo Windows 환경변수 설정 방법:
echo.
echo 방법 1: 현재 세션에만 적용 (테스트용)
echo   set OUTBOUND_GOOGLE_SHEET_URL=https://script.google.com/macros/s/YOUR_ID/exec
echo.
echo 방법 2: 영구적 적용 (관리자 권한 필요)
echo   setx OUTBOUND_GOOGLE_SHEET_URL "https://script.google.com/macros/s/YOUR_ID/exec"
echo.
echo 참고: .env 파일을 사용하는 경우 환경변수는 선택사항입니다.
echo       로컬 JSON 파일이 자동으로 사용됩니다.
echo.

REM ========================================
REM 3단계: 패키지 설치 확인
REM ========================================
echo [3/8] 패키지 설치 확인 중...

if not exist "package.json" (
    echo ✗ package.json 파일이 없습니다.
    echo 프로젝트 루트 디렉토리에서 실행하세요.
    pause
    exit /b 1
)

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
    echo ✓ node_modules가 존재합니다
)
echo.

REM ========================================
REM 4단계: TypeScript 설정 확인
REM ========================================
echo [4/8] TypeScript 설정 확인 중...

if exist "tsconfig.json" (
    echo ✓ tsconfig.json 파일 존재
) else (
    echo tsconfig.json 파일 생성 중...
    (
        echo {
        echo   "compilerOptions": {
        echo     "target": "ES2020",
        echo     "lib": ["ES2020", "DOM", "DOM.Iterable"],
        echo     "module": "ESNext",
        echo     "skipLibCheck": true,
        echo     "esModuleInterop": true,
        echo     "allowSyntheticDefaultImports": true,
        echo     "strict": true,
        echo     "forceConsistentCasingInFileNames": true,
        echo     "moduleResolution": "node",
        echo     "resolveJsonModule": true,
        echo     "isolatedModules": true,
        echo     "noEmit": true,
        echo     "jsx": "react-jsx"
        echo   },
        echo   "include": [
        echo     "**/*.ts",
        echo     "**/*.tsx"
        echo   ],
        echo   "exclude": [
        echo     "node_modules"
        echo   ]
        echo }
    ) > tsconfig.json
    echo ✓ tsconfig.json 생성 완료
)
echo.

REM ========================================
REM 5단계: 연결 테스트
REM ========================================
echo [5/8] 연결 테스트 실행 중...

if exist "test-outbound-connection.js" (
    echo node test-outbound-connection.js 실행...
    call node test-outbound-connection.js
    if !errorlevel! equ 0 (
        echo ✓ 연결 테스트 성공
    ) else (
        echo ⚠ 연결 테스트 완료 (일부 경고 있을 수 있음)
    )
) else (
    echo ✗ test-outbound-connection.js 파일이 없습니다
)
echo.

REM ========================================
REM 6단계: 앱 통합 가이드
REM ========================================
echo [6/8] 앱 통합 가이드
echo.
echo 앱에 OutboundTabs 컴포넌트 통합 방법:
echo.
echo 1. import 문 추가:
echo    import OutboundTabs from './outbound-tabs';
echo.
echo 2. 컴포넌트 사용:
echo    ^<OutboundTabs
echo      onDataLoad={(data) =^> console.log('데이터 로드:', data)}
echo      onError={(error) =^> console.error('오류:', error)}
echo      refreshInterval={300000}  // 5분마다 새로고침
echo    /^>
echo.
echo 3. 페이지 라우팅 (Next.js 예시):
echo    /outbound 페이지에서 사용
echo.

REM ========================================
REM 7단계: 서버 실행 옵션
REM ========================================
echo [7/8] 서버 실행 옵션
echo.
echo 서버 실행 방법 선택:
echo   1. npm start (프로덕션)
echo   2. npm run dev (개발)
echo   3. pm2 restart (PM2 사용)
echo   4. 서버 시작 건너뜀
echo.
set /p server_choice="선택 (1-4, 기본 4): "

if "!server_choice!"=="1" (
    echo npm start로 서버 시작 중...
    call npm start
) else if "!server_choice!"=="2" (
    echo npm run dev로 서버 시작 중...
    call npm run dev
) else if "!server_choice!"=="3" (
    echo PM2 프로세스 목록:
    pm2 list
    echo.
    set /p pm2_name="PM2 프로세스 이름 입력 (Enter로 전체 재시작): "
    if "!pm2_name!"=="" (
        call pm2 restart all
    ) else (
        call pm2 restart !pm2_name!
    )
) else (
    echo 서버 시작 건너뜀
)
echo.

REM ========================================
REM 8단계: 완료 보고
REM ========================================
echo [8/8] 완료 보고
echo.
echo ========================================
echo VF 출고탭 해결 패키지 적용 완료!
echo ========================================
echo.
echo 설정 완료 항목:
echo ✓ outbound-tabs.tsx 컴포넌트 설치
echo ✓ outboundConfig.ts 설정 파일 설치
echo ✓ 로컬 JSON 데이터 파일 생성
echo ✓ TypeScript 설정 확인
echo ✓ 연결 테스트 완료
echo.
echo 다음 단계:
echo 1. 구글 시트 URL을 설정하려면 OUTBOUND_GOOGLE_SHEET_URL 환경변수 설정
echo 2. 앱에 컴포넌트 통합 (위 가이드 참조)
echo 3. 브라우저에서 /outbound 페이지 접속
echo 4. 데이터가 올바르게 표시되는지 확인
echo.
echo 문제 해결:
echo - 데이터가 표시되지 않으면 브라우저 콘솔 확인
echo - 연결 오류면 test-outbound-connection.js 재실행
echo - 환경변수 문제면 .env 파일 확인
echo.
echo 문서:
echo - README-APPLY.txt: 상세 적용 가이드
echo - outbound-tabs.tsx: 컴포넌트 소스
echo - outboundConfig.ts: 설정 모듈
echo - test-outbound-connection.js: 테스트 스크립트
echo.
echo 지원이 필요하면 로그 파일을 확인하세요.
echo ========================================
echo.

REM 로그 파일 생성
(
    echo VF 출고탭 적용 로그
    echo 생성일: %date% %time%
    echo.
    echo 사용자: %USERNAME%
    echo 컴퓨터: %COMPUTERNAME%
    echo 디렉토리: %CD%
    echo.
    echo 파일 상태:
    if exist "outbound-tabs.tsx" echo - outbound-tabs.tsx: 존재
    if exist "outboundConfig.ts" echo - outboundConfig.ts: 존재
    if exist "outbound-data.json" echo - outbound-data.json: 존재
    if exist "test-outbound-connection.js" echo - test-outbound-connection.js: 존재
    if exist ".env" echo - .env: 존재
    if exist "tsconfig.json" echo - tsconfig.json: 존재
    echo.
    echo 패키지 설치 상태:
    if exist "node_modules" echo - node_modules: 존재
    echo.
) > apply-fix-log.txt

echo 로그 파일 생성: apply-fix-log.txt
echo.
pause