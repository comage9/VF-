#!/usr/bin/env bash
# VF Analytics Dashboard - 종료 스크립트
# /tmp/vf-{backend,frontend}.pid 참조해서 종료

set -uo pipefail

echo "VF Dashboard 종료 중..."

stopped=0

if [[ -f /tmp/vf-backend.pid ]]; then
  PID=$(cat /tmp/vf-backend.pid)
  if kill -0 $PID 2>/dev/null; then
    kill $PID && echo "  백엔드 PID $PID 종료"
    stopped=$((stopped+1))
  fi
  rm -f /tmp/vf-backend.pid
fi

if [[ -f /tmp/vf-frontend.pid ]]; then
  PID=$(cat /tmp/vf-frontend.pid)
  if kill -0 $PID 2>/dev/null; then
    kill $PID && echo "  프론트엔드 PID $PID 종료"
    stopped=$((stopped+1))
  fi
  rm -f /tmp/vf-frontend.pid
fi

# 포트로도 한 번 더 (스크립트로 띄우지 않은 경우 대비)
pkill -f "manage.py runserver.*5176" 2>/dev/null && stopped=$((stopped+1)) || true
pkill -f "vite.*--port.*5174" 2>/dev/null && stopped=$((stopped+1)) || true

sleep 1

# 확인
remaining=$(ss -tln 2>/dev/null | grep -E ":(5174|5176)" | wc -l)
if [[ $remaining -eq 0 ]]; then
  echo "✓ VF Dashboard 완전히 종료됨 (5174/5176 포트 비어있음)"
else
  echo "⚠ 아직 포트 점유 중:"
  ss -tlnp 2>/dev/null | grep -E ":(5174|5176)"
fi
