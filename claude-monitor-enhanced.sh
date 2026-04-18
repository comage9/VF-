#!/bin/bash
# Claude Code 향상된 모니터링 시스템
# 무제한 타임아웃 + 진행 상태 모니터링 + OpenClaw 통합

set -euo pipefail

# 설정
LOG_DIR="$HOME/.claude-monitor"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/claude_${TIMESTAMP}.log"
RESULT_FILE="$LOG_DIR/result_${TIMESTAMP}.txt"
PID_FILE="$LOG_DIR/current_pid.txt"
STATUS_FILE="$LOG_DIR/status_${TIMESTAMP}.json"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 상태 초기화
echo '{"status": "starting", "progress": 0, "start_time": "'$(date -Iseconds)'", "last_update": "'$(date -Iseconds)'"}' > "$STATUS_FILE"

# 로깅 함수
log() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO") echo -e "${GREEN}[INFO]${NC} $message" ;;
        "WARN") echo -e "${YELLOW}[WARN]${NC} $message" ;;
        "ERROR") echo -e "${RED}[ERROR]${NC} $message" ;;
        "DEBUG") echo -e "${BLUE}[DEBUG]${NC} $message" ;;
    esac
    
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
}

# 상태 업데이트 함수
update_status() {
    local status=$1
    local progress=$2
    local message=$3
    
    cat > "$STATUS_FILE" << EOF
{
    "status": "$status",
    "progress": $progress,
    "message": "$message",
    "start_time": "$(jq -r '.start_time' "$STATUS_FILE")",
    "last_update": "$(date -Iseconds)",
    "log_file": "$LOG_FILE",
    "result_file": "$RESULT_FILE"
}
EOF
    
    log "INFO" "상태 업데이트: $status ($progress%) - $message"
}

# 인자 확인
if [ $# -lt 1 ]; then
    echo "사용법: $0 \"Claude Code 작업 설명\" [타임아웃_초]"
    echo "예: $0 \"VF outbound-tabs.tsx 완전 수정\" 86400"
    echo "기본 타임아웃: 86400초 (24시간)"
    exit 1
fi

PROMPT="$1"
TIMEOUT=${2:-86400}  # 기본 24시간

echo "==========================================="
echo "Claude Code 향상된 모니터링 시스템"
echo "==========================================="
echo "작업: $PROMPT"
echo "타임아웃: $TIMEOUT초 ($(($TIMEOUT/3600))시간)"
echo "로그: $LOG_FILE"
echo "상태: $STATUS_FILE"
echo "==========================================="

# 상태 파일 초기화
update_status "initializing" 0 "시스템 초기화 중"

# 1. Claude Code 실행 준비
log "INFO" "Claude Code 실행 준비 중..."
update_status "preparing" 10 "Claude Code 준비 중"

# 2. 임시 파일 생성 (진행률 확인용)
TEMP_OUTPUT="$LOG_DIR/temp_output_${TIMESTAMP}.txt"
touch "$TEMP_OUTPUT"

# 3. Claude Code 백그라운드 실행
log "INFO" "Claude Code 작업 시작..."
update_status "running" 20 "Claude Code 실행 중"

{
    echo "==========================================="
    echo "Claude Code 작업 시작: $(date)"
    echo "프롬프트: $PROMPT"
    echo "타임아웃: $TIMEOUT초"
    echo "==========================================="
    
    # 무제한 타임아웃으로 Claude Code 실행
    timeout $TIMEOUT claude --permission-mode bypassPermissions --print "$PROMPT"
    
    EXIT_CODE=$?
    echo "==========================================="
    echo "Claude Code 작업 종료: $(date)"
    echo "종료 코드: $EXIT_CODE"
    echo "==========================================="
    
    exit $EXIT_CODE
} > "$RESULT_FILE" 2>&1 &
CLAUDE_PID=$!

echo $CLAUDE_PID > "$PID_FILE"
log "INFO" "Claude Code PID: $CLAUDE_PID"
update_status "running" 30 "Claude Code 실행 중 (PID: $CLAUDE_PID)"

# 4. 진행률 모니터링
MONITOR_COUNT=0
LAST_SIZE=0
STUCK_COUNT=0
MAX_STUCK_COUNT=12  # 2분 동안 변화 없으면 문제로 간주

while kill -0 $CLAUDE_PID 2>/dev/null; do
    MONITOR_COUNT=$((MONITOR_COUNT + 1))
    ELAPSED_SEC=$((MONITOR_COUNT * 5))
    
    # 결과 파일 크기 확인 (진행률 추정)
    CURRENT_SIZE=$(stat -c%s "$RESULT_FILE" 2>/dev/null || echo 0)
    SIZE_CHANGE=$((CURRENT_SIZE - LAST_SIZE))
    
    # 진행률 계산 (간단한 추정)
    if [ $CURRENT_SIZE -gt 1000 ]; then
        PROGRESS=$((30 + (MONITOR_COUNT * 70 / 120)))  # 최대 120회 모니터링 (10분)
        if [ $PROGRESS -gt 90 ]; then
            PROGRESS=90
        fi
    else
        PROGRESS=$((30 + (MONITOR_COUNT * 20 / 120)))  # 초기에는 느리게
    fi
    
    # 상태 메시지
    if [ $SIZE_CHANGE -eq 0 ]; then
        STUCK_COUNT=$((STUCK_COUNT + 1))
        if [ $STUCK_COUNT -gt $MAX_STUCK_COUNT ]; then
            STATUS_MSG="진행 정지 가능성 (${STUCK_COUNT}회 연속 변화 없음)"
            log "WARN" "$STATUS_MSG"
        else
            STATUS_MSG="실행 중 (${ELAPSED_SEC}초 경과)"
        fi
    else
        STUCK_COUNT=0
        STATUS_MSG="작업 중 (${ELAPSED_SEC}초, +${SIZE_CHANGE}바이트)"
    fi
    
    # 리소스 사용량 확인
    if command -v ps > /dev/null 2>&1; then
        RESOURCE_INFO=$(ps -p $CLAUDE_PID -o %cpu,%mem,etime,cmd --no-headers 2>/dev/null || echo "N/A")
    else
        RESOURCE_INFO="리소스 정보 없음"
    fi
    
    # 상태 업데이트
    update_status "running" $PROGRESS "$STATUS_MSG"
    
    # 상세 로그 (10회마다)
    if [ $((MONITOR_COUNT % 10)) -eq 0 ]; then
        log "DEBUG" "모니터링 #$MONITOR_COUNT - 경과: ${ELAPSED_SEC}초, 크기: ${CURRENT_SIZE}바이트"
        log "DEBUG" "리소스: $RESOURCE_INFO"
        
        # 결과 미리보기 (마지막 5줄)
        if [ $CURRENT_SIZE -gt 0 ]; then
            log "DEBUG" "결과 미리보기:"
            tail -5 "$RESULT_FILE" | while IFS= read -r line; do
                log "DEBUG" "  $line"
            done
        fi
    fi
    
    LAST_SIZE=$CURRENT_SIZE
    sleep 5  # 5초마다 확인
done

# 5. 작업 완료 처리
wait $CLAUDE_PID
CLAUDE_EXIT_CODE=$?
log "INFO" "Claude Code 작업 종료 (종료 코드: $CLAUDE_EXIT_CODE)"

# 결과 분석
RESULT_SIZE=$(stat -c%s "$RESULT_FILE" 2>/dev/null || echo 0)
RESULT_LINES=$(wc -l < "$RESULT_FILE" 2>/dev/null || echo 0)

# 성공/실패 판단
if [ $CLAUDE_EXIT_CODE -eq 0 ] && [ $RESULT_SIZE -gt 500 ]; then
    FINAL_STATUS="completed"
    FINAL_MESSAGE="✅ 작업 성공 (${RESULT_LINES}줄, ${RESULT_SIZE}바이트)"
    log "INFO" "$FINAL_MESSAGE"
    
    # 결과 미리보기
    echo ""
    echo "==========================================="
    echo "작업 결과 미리보기 (첫 10줄)"
    echo "==========================================="
    head -10 "$RESULT_FILE"
    echo "... (총 $RESULT_LINES줄)"
    echo "==========================================="
    
elif [ $RESULT_SIZE -le 100 ]; then
    FINAL_STATUS="failed"
    FINAL_MESSAGE="⚠️ 결과가 너무 작습니다 (${RESULT_SIZE}바이트)"
    log "WARN" "$FINAL_MESSAGE"
    echo "결과 내용:"
    cat "$RESULT_FILE"
    
else
    FINAL_STATUS="failed"
    FINAL_MESSAGE="❌ 작업 실패 (종료 코드: $CLAUDE_EXIT_CODE)"
    log "ERROR" "$FINAL_MESSAGE"
    echo "마지막 에러:"
    tail -20 "$RESULT_FILE"
fi

# 최종 상태 업데이트
update_status "$FINAL_STATUS" 100 "$FINAL_MESSAGE"

# 정리
rm -f "$PID_FILE" "$TEMP_OUTPUT"

# 최종 보고
echo ""
echo "==========================================="
echo "작업 완료 보고"
echo "==========================================="
echo "상태: $FINAL_MESSAGE"
echo "소요 시간: ${ELAPSED_SEC}초"
echo "로그 파일: $LOG_FILE"
echo "결과 파일: $RESULT_FILE"
echo "상태 파일: $STATUS_FILE"
echo "==========================================="

# 상태 파일 내용 출력
echo "상태 파일 내용:"
cat "$STATUS_FILE"
echo ""

# 종료 코드
if [ "$FINAL_STATUS" = "completed" ]; then
    exit 0
else
    exit 1
fi