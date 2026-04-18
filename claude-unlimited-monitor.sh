#!/bin/bash
# Claude Code 무제한 작업 모니터링 시스템

set -e

# 설정
LOG_DIR="$HOME/.claude-monitor"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/claude_${TIMESTAMP}.log"
RESULT_FILE="$LOG_DIR/result_${TIMESTAMP}.txt"
PID_FILE="$LOG_DIR/current_pid.txt"

echo "=== Claude Code 무제한 작업 모니터링 ==="
echo "로그: $LOG_FILE"
echo "결과: $RESULT_FILE"
echo "="$(printf '=%.0s' {1..50})

# 인자 확인
if [ $# -lt 1 ]; then
    echo "사용법: $0 \"Claude Code 작업 설명\""
    echo "예: $0 \"복잡한 React 컴포넌트 작성\""
    exit 1
fi

PROMPT="$1"
echo "작업: $PROMPT"
echo "시작 시간: $(date)"

# 1. Claude Code 백그라운드 실행
echo "[1단계] Claude Code 작업 시작..."
claude --permission-mode bypassPermissions --print "$PROMPT" > "$RESULT_FILE" 2>&1 &
CLAUDE_PID=$!

echo "Claude Code PID: $CLAUDE_PID"
echo $CLAUDE_PID > "$PID_FILE"

# 2. 진행 상황 모니터링 로그
echo "[2단계] 모니터링 시작..."
{
    echo "모니터링 시작: $(date)"
    echo "작업: $PROMPT"
    echo "PID: $CLAUDE_PID"
    echo "-"$(printf '-%.0s' {1..50})
} > "$LOG_FILE"

# 3. 모니터링 루프
MONITOR_COUNT=0
while kill -0 $CLAUDE_PID 2>/dev/null; do
    MONITOR_COUNT=$((MONITOR_COUNT + 1))
    
    # CPU/메모리 사용량 확인
    if command -v ps > /dev/null 2>&1; then
        CPU_MEM=$(ps -p $CLAUDE_PID -o %cpu,%mem,etime,cmd --no-headers 2>/dev/null || echo "N/A")
    else
        CPU_MEM="ps 명령어 없음"
    fi
    
    # 로그 기록
    {
        echo "[$(date '+%H:%M:%S')] 모니터링 #$MONITOR_COUNT"
        echo "  상태: 실행 중 (PID: $CLAUDE_PID)"
        echo "  리소스: $CPU_MEM"
        echo "  경과 시간: $((MONITOR_COUNT * 10))초"
        echo ""
    } >> "$LOG_FILE"
    
    # 10초마다 확인
    sleep 10
    
    # 장시간 실행 안전장치 (옵션)
    if [ $MONITOR_COUNT -gt 360 ]; then  # 1시간 경과
        echo "⚠️ 경고: 작업이 1시간을 초과했습니다." >> "$LOG_FILE"
    fi
done

# 4. 작업 완료 처리
CLAUDE_EXIT_CODE=$?
echo "[3단계] 작업 완료 (종료 코드: $CLAUDE_EXIT_CODE)"

{
    echo "="$(printf '=%.0s' {1..50})
    echo "작업 완료: $(date)"
    echo "종료 코드: $CLAUDE_EXIT_CODE"
    echo "총 모니터링 횟수: $MONITOR_COUNT"
    echo "총 소요 시간: $((MONITOR_COUNT * 10))초"
    echo "="$(printf '=%.0s' {1..50})
} >> "$LOG_FILE"

# 5. 결과 분석
RESULT_SIZE=$(stat -c%s "$RESULT_FILE" 2>/dev/null || echo "0")
RESULT_LINES=$(wc -l < "$RESULT_FILE" 2>/dev/null || echo "0")

echo "[4단계] 결과 분석"
echo "  결과 파일 크기: $RESULT_SIZE 바이트"
echo "  결과 줄 수: $RESULT_LINES 줄"

# 6. 성공/실패 판단
if [ $CLAUDE_EXIT_CODE -eq 0 ] && [ $RESULT_SIZE -gt 100 ]; then
    STATUS="✅ 성공"
    echo "$STATUS: 작업이 성공적으로 완료되었습니다."
    
    # 결과 미리보기
    echo ""
    echo "=== 결과 미리보기 (첫 20줄) ==="
    head -20 "$RESULT_FILE"
    echo "... (총 $RESULT_LINES줄)"
    
elif [ $RESULT_SIZE -le 100 ]; then
    STATUS="⚠️ 경고"
    echo "$STATUS: 결과가 매우 작습니다. 문제가 있을 수 있습니다."
    echo "결과 내용:"
    cat "$RESULT_FILE"
    
else
    STATUS="❌ 실패"
    echo "$STATUS: 작업이 실패했습니다. (종료 코드: $CLAUDE_EXIT_CODE)"
    echo "마지막 에러:"
    tail -20 "$RESULT_FILE"
fi

# 7. 정리
rm -f "$PID_FILE"

{
    echo ""
    echo "최종 상태: $STATUS"
    echo "로그 파일: $LOG_FILE"
    echo "결과 파일: $RESULT_FILE"
} >> "$LOG_FILE"

echo ""
echo "=== 모니터링 완료 ==="
echo "상태: $STATUS"
echo "로그: $LOG_FILE"
echo "결과: $RESULT_FILE"

# 상태 코드 반환
if [ "$STATUS" = "✅ 성공" ]; then
    exit 0
else
    exit 1
fi