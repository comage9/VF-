#!/bin/bash
# VF 자정 자동 이동 스크립트
# 매일 자정에 과거 미완료 작업을 Archive로 이동

set -e

LOG_DIR="./logs"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d).log"
ARCHIVE_DIR="Archive"
VF_ROOT="/home/comage/coding/VF"

# 로그 디렉토리 생성
mkdir -p "$LOG_DIR"

# 로그 함수
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== VF 자정 자동 이동 시작 ==="

# VF 프로젝트 디렉토리 확인
if [ ! -d "$VF_ROOT" ]; then
    log "❌ VF 프로젝트 디렉토리 없음: $VF_ROOT"
    exit 1
fi

cd "$VF_ROOT"

# Archive 디렉토리 생성
mkdir -p "$ARCHIVE_DIR"

# 어제 날짜 계산 (YYYY-MM-DD)
YESTERDAY=$(date -d "yesterday" '+%Y-%m-%d')

log "어제 날짜: $YESTERDAY"
log "VF 루트: $(pwd)"

# 어제 날짜 디렉토리 찾기
if [ -d "$YESTERDAY" ]; then
    log "어제 디렉토리 발견: $YESTERDAY"
    
    # 미완료 작업 파일 찾기 (.task 확장자 또는 특정 패턴)
    UNFINISHED_FILES=$(find "$YESTERDAY" -type f \( -name "*.task" -o -name "*_미완료*" -o -name "*_pending*" \) 2>/dev/null || true)
    
    if [ -n "$UNFINISHED_FILES" ]; then
        log "미완료 작업 파일 발견:"
        echo "$UNFINISHED_FILES" | while read file; do
            log "  - $file"
            
            # Archive로 이동
            mv "$file" "$ARCHIVE_DIR/" 2>/dev/null && \
                log "    ✅ 이동 완료: $(basename "$file")" || \
                log "    ❌ 이동 실패: $(basename "$file")"
        done
    else
        log "✅ 어제 디렉토리에 미완료 작업 없음"
    fi
    
    # 빈 디렉토리 삭제 (선택사항)
    find "$YESTERDAY" -type d -empty -delete 2>/dev/null && \
        log "✅ 빈 디렉토리 정리 완료" || \
        log "ℹ️  빈 디렉토리 없음"
else
    log "ℹ️  어제 디렉토리 없음: $YESTERDAY"
fi

# 추가 정리: 7일 이상된 Archive 파일
find "$ARCHIVE_DIR" -type f -mtime +7 -name "*.task" 2>/dev/null | while read old_file; do
    log "🗑️  오래된 파일 삭제: $(basename "$old_file") (7일 이상)"
    rm -f "$old_file"
done

log "=== VF 자정 자동 이동 완료 ==="
log "총 로그 크기: $(wc -l < "$LOG_FILE") 줄"

# 간단한 알림 (선택사항)
if command -v curl >/dev/null && [ -n "$SLACK_WEBHOOK" ]; then
    curl -X POST -H 'Content-type: application/json' \
         --data "{\"text\":\"VF 자정 이동 완료 – 로그: $LOG_FILE\"}" \
         "$SLACK_WEBHOOK" >/dev/null 2>&1
fi

exit 0
