#!/bin/bash

# VF Outbound-Tabs.tsx 수정 적용 도구 (Unix/Linux/macOS 버전)
# UTF-8 인코딩 지원

set -e

echo "========================================"
echo "VF Outbound-Tabs.tsx 수정 적용 도구"
echo "========================================"
echo ""

# 디렉토리 확인
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# .env 파일 생성
if [ ! -f ".env" ]; then
    echo "[1/4] .env 파일 생성 중..."
    cat > .env << 'EOF'
# VF 프로젝트 환경 설정
# 생성일: $(date)

# API 서버 설정
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_API_TIMEOUT=10000

# 데이터 소스 설정
VF_DATA_SOURCE=local
VF_DATA_PATH=./outbound-data.json

# 개발 모드 설정
NODE_ENV=development
NEXT_PUBLIC_DEBUG=true

# 인증 설정 (필요시)
# VF_API_KEY=your_api_key_here
# VF_API_SECRET=your_secret_here
EOF
    echo "✓ .env 파일 생성 완료"
else
    echo "[1/4] .env 파일이 이미 존재합니다 (건너뜀)"
fi
echo ""

# 데이터 파일 생성
if [ ! -f "outbound-data.json" ]; then
    echo "[2/4] outbound-data.json 생성 중..."
    cat > outbound-data.json << 'EOF'
{
  "success": true,
  "message": "로컬 테스트 데이터입니다",
  "data": {
    "outboundTabs": [
      {
        "id": 1,
        "title": "생산 계획",
        "description": "생산 계획 관리",
        "icon": "📋",
        "active": true,
        "items": [
          {"id": 101, "name": "생산 주문 A", "status": "진행중", "date": "2026-04-16"},
          {"id": 102, "name": "생산 주문 B", "status": "대기", "date": "2026-04-17"}
        ]
      },
      {
        "id": 2,
        "title": "출고 관리",
        "description": "출고 관리",
        "icon": "🚚",
        "active": false,
        "items": [
          {"id": 201, "name": "출고 주문 A", "status": "완료", "date": "2026-04-15"}
        ]
      }
    ]
  },
  "timestamp": "$(date)"
}
EOF
    echo "✓ outbound-data.json 생성 완료"
else
    echo "[2/4] outbound-data.json이 이미 존재합니다 (건너뜀)"
fi
echo ""

# 패키지 설치 확인
echo "[3/4] 패키지 설치 확인 중..."
if [ ! -d "node_modules" ]; then
    echo "필요한 패키지가 없습니다. 설치를 시작합니다..."
    if command -v npm &> /dev/null; then
        npm install
        echo "✓ 패키지 설치 완료"
    elif command -v yarn &> /dev/null; then
        yarn install
        echo "✓ 패키지 설치 완료"
    else
        echo "✗ npm 또는 yarn을 찾을 수 없습니다"
        exit 1
    fi
else
    echo "✓ node_modules가 존재합니다 (건너뜀)"
fi
echo ""

# 서버 재시작 옵션
echo "[4/4] 서버 재시작 옵션"
echo ""
echo "선택할 서버 재시작 방법:"
echo "  1. npm start (기본)"
echo "  2. npm run dev"
echo "  3. yarn start"
echo "  4. yarn dev"
echo "  5. pm2 restart"
echo "  6. 서버 재시작 건너뜀"
echo ""
read -p "선택 (1-6): " restart_choice

case $restart_choice in
    1)
        echo "npm start로 서버 시작 중..."
        npm start
        ;;
    2)
        echo "npm run dev로 서버 시작 중..."
        npm run dev
        ;;
    3)
        echo "yarn start로 서버 시작 중..."
        yarn start
        ;;
    4)
        echo "yarn dev로 서버 시작 중..."
        yarn dev
        ;;
    5)
        if command -v pm2 &> /dev/null; then
            pm2 list
            echo ""
            read -p "PM2 프로세스 이름 입력 (Enter로 전체 재시작): " pm2_name
            if [ -z "$pm2_name" ]; then
                pm2 restart all
            else
                pm2 restart "$pm2_name"
            fi
        else
            echo "✗ pm2가 설치되어 있지 않습니다"
        fi
        ;;
    *)
        echo "서버 재시작 건너뜀"
        ;;
esac
echo ""

# 테스트 실행 가이드
echo "========================================"
echo "테스트 실행 가이드"
echo "========================================"
echo ""
echo "테스트 스크립트 실행:"
echo "  node test-outbound-connection.js"
echo ""
echo "또는 직접 테스트:"
echo "  curl http://localhost:3000/api/outbound-tabs"
echo ""
echo "브라우저 테스트:"
echo "  http://localhost:3000"
echo ""
echo "========================================"
echo "적용 완료!"
echo "========================================"
echo ""
