#!/usr/bin/env bash
# VF Analytics Dashboard - 통합 실행 스크립트 (Linux)
# 백엔드 5176 + 프론트엔드 5174 동시 실행
# 종료: Ctrl+C 또는 두 프로세스 중 하나 죽으면 자동 정리

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# --- 환경 점검 ---
VENV_PY="$ROOT_DIR/backend/.venv/bin/python"
MANAGE_PY="$ROOT_DIR/backend/manage.py"
FRONTEND_DIR="$ROOT_DIR/frontend/client"

if [[ ! -x "$VENV_PY" ]]; then
  echo "ERROR: backend/.venv/bin/python 없음. venv 생성 필요:" >&2
  echo "  python3 -m venv backend/.venv" >&2
  echo "  backend/.venv/bin/pip install -r backend/requirements.txt" >&2
  exit 1
fi

if [[ ! -f "$MANAGE_PY" ]]; then
  echo "ERROR: backend/manage.py 없음" >&2
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "ERROR: frontend/client/node_modules 없음. 설치 필요:" >&2
  echo "  cd frontend/client && npm install" >&2
  exit 1
fi

# --- 포트 점유 확인 ---
check_port() {
  local port=$1
  if ss -tln 2>/dev/null | grep -q ":$port "; then
    echo "⚠ 포트 $port 이미 사용 중. 기존 프로세스 종료할까요? [Y/n]" >&2
    read -r ans
    if [[ "$ans" =~ ^[Yy]$ ]] || [[ -z "$ans" ]]; then
      pkill -f "manage.py runserver.*:$port" 2>/dev/null || true
      pkill -f "vite.*--port.*$port" 2>/dev/null || true
      sleep 2
    else
      echo "포트 $port 점유 중. 기존 종료 후 재실행 필요." >&2
      exit 1
    fi
  fi
}

check_port 5176
check_port 5174

# --- 데이터 파일 symlink 보장 (마스터 단일 데이터 소스) ---
# cp -r로 마스터 복사 시 db.sqlite3은 일반 파일로 옴 → symlink로 교체
# 동시 실행 금지 전제 (마스터 ↔ VF-project)
MASTER_DIR_PARENT="$(dirname "$ROOT_DIR")"  # 부모 폴더 = 마스터 위치
MASTER_DB_GUESS=""
if [[ -f "/media/comage/data/coding/VF-new - 복사본/backend/db.sqlite3" ]]; then
  MASTER_DB_GUESS="/media/comage/data/coding/VF-new - 복사본/backend/db.sqlite3"
elif [[ -f "${MASTER_DIR_PARENT}/VF-new - 복사본/backend/db.sqlite3" ]]; then
  MASTER_DB_GUESS="${MASTER_DIR_PARENT}/VF-new - 복사본/backend/db.sqlite3"
fi
if [[ -n "$MASTER_DB_GUESS" && -f "$ROOT_DIR/backend/db.sqlite3" && ! -L "$ROOT_DIR/backend/db.sqlite3" ]]; then
  echo "[데이터] db.sqlite3 → 마스터 symlink로 교체 (단일 소스)"
  mv "$ROOT_DIR/backend/db.sqlite3" "$ROOT_DIR/backend/db.sqlite3.cp.$(date +%H%M%S)" 2>/dev/null
  ln -sf "$MASTER_DB_GUESS" "$ROOT_DIR/backend/db.sqlite3"
fi
# inventory_unified.json도 동일
MASTER_INV_GUESS=""
if [[ -f "/media/comage/data/coding/VF-new - 복사본/inventory_unified.json" ]]; then
  MASTER_INV_GUESS="/media/comage/data/coding/VF-new - 복사본/inventory_unified.json"
elif [[ -f "${MASTER_DIR_PARENT}/VF-new - 복사본/inventory_unified.json" ]]; then
  MASTER_INV_GUESS="${MASTER_DIR_PARENT}/VF-new - 복사본/inventory_unified.json"
fi
if [[ -n "$MASTER_INV_GUESS" && -f "$ROOT_DIR/inventory_unified.json" && ! -L "$ROOT_DIR/inventory_unified.json" ]]; then
  echo "[데이터] inventory_unified.json → 마스터 symlink로 교체"
  mv "$ROOT_DIR/inventory_unified.json" "$ROOT_DIR/inventory_unified.json.cp.$(date +%H%M%S)" 2>/dev/null
  ln -sf "$MASTER_INV_GUESS" "$ROOT_DIR/inventory_unified.json"
fi

# --- 백그라운드 실행 (PTY 사용 안 함) ---
LOG_DIR="/tmp/vf-logs"
mkdir -p "$LOG_DIR"

echo "=========================================="
echo "  VF Dashboard 시작"
echo "=========================================="
echo "[백엔드] http://localhost:5176/  (PID 저장: /tmp/vf-backend.pid)"
echo "[프론트엔드] http://localhost:5174/  (PID 저장: /tmp/vf-frontend.pid)"
echo "[외부 LAN] http://59.9.19.188:5174/  (이 머신 공인 IP, 2026-06-02 확인)"
echo "로그: $LOG_DIR/{backend,frontend}.log"
echo "종료: ./stop_all.sh  또는  Ctrl+C"
echo "=========================================="

# 백엔드
(
  cd "$ROOT_DIR/backend"
  source .venv/bin/activate
  python manage.py runserver 0.0.0.0:5176
) > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /tmp/vf-backend.pid
echo "✓ 백엔드 PID $BACKEND_PID"

# 프론트엔드
(
  cd "$FRONTEND_DIR"
  npm run dev -- --host 0.0.0.0 --port 5174
) > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /tmp/vf-frontend.pid
echo "✓ 프론트엔드 PID $FRONTEND_PID"

# --- 종료 핸들러 ---
cleanup() {
  echo ""
  echo "정리 중..."
  kill $BACKEND_PID 2>/dev/null && echo "  백엔드 종료" || true
  kill $FRONTEND_PID 2>/dev/null && echo "  프론트엔드 종료" || true
  rm -f /tmp/vf-backend.pid /tmp/vf-frontend.pid
  sleep 1
  exit 0
}
trap cleanup INT TERM

# --- 헬스 체크 (5초 대기 후) ---
sleep 5
echo ""
echo "=== 헬스 체크 ==="
curl -s -o /dev/null -w "  백엔드 5176: HTTP %{http_code}\n" http://localhost:5176/api/ || echo "  백엔드 5176: 응답 없음"
curl -s -o /dev/null -w "  프론트 5174: HTTP %{http_code}\n" http://localhost:5174/ || echo "  프론트 5174: 응답 없음"
echo ""
echo "준비 완료. 로그는:"
echo "  tail -f $LOG_DIR/backend.log"
echo "  tail -f $LOG_DIR/frontend.log"

# 둘 중 하나라도 죽으면 정리
wait -n
echo ""
echo "⚠ 한 프로세스 종료. 자동 정리합니다..."
cleanup
