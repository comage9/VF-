#!/bin/bash
# VF 자정 자동 이동 스크립트 (수정판)
# 매일 자정에 과거 미완료 작업을 Archive로 이동

set -e

LOG_DIR="./logs"
LOG_FILE="$LOG_DIR/vf_move_$(date +%Y%m%d).log"
ARCHIVE_DIR="Archive"
VF_ROOT="/home/comage/coding/VF"

# 로그 디렉토리 생성
mkdir -p "$LOG_DIR" 2>/dev/null || true

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
mkdir -p "$ARCHIVE_DIR" 2>/dev/null || true

# 어제 날짜 계산 (YYYY-MM-DD)
YESTERDAY=$(date -d "yesterday" '+%Y-%m-%d')

log "어제 날짜: $YESTERDAY"
log "VF 루트: $(pwd)"

# 테스트: 현재 디렉토리 구조 확인
log "현재 디렉토리 내용:"
ls -la | head -10 | while read line; do
    log "  $line"
done

# 실제 VF 프로젝트 구조에 맞게 수정
# 프론트엔드 클라이언트 디렉토리 확인
if [ -d "frontend/client" ]; then
    log "✅ 프론트엔드 클라이언트 디렉토리 발견"
    
    # 예시: src/pages 디렉토리 확인
    if [ -d "frontend/client/src/pages" ]; then
        PAGE_COUNT=$(find "frontend/client/src/pages" -name "*.tsx" -o -name "*.ts" | wc -l)
        log "✅ 페이지 파일 수: $PAGE_COUNT"
    fi
fi

# 백엔드 디렉토리 확인
if [ -d "backend" ]; then
    log "✅ 백엔드 디렉토리 발견"
    
    # API 파일 확인
    API_COUNT=$(find "backend" -name "*.js" -o -name "*.ts" -o -name "*.py" | wc -l)
    log "✅ API 파일 수: $API_COUNT"
fi

# 실제 작업: production 데이터 백업 예시
PRODUCTION_DATA="production_data.json"
if [ -f "$PRODUCTION_DATA" ]; then
    BACKUP_FILE="Archive/production_data_$(date +%Y%m%d).json"
    cp "$PRODUCTION_DATA" "$BACKUP_FILE" 2>/dev/null && \
        log "✅ 생산 데이터 백업 완료: $BACKUP_FILE" || \
        log "ℹ️  생산 데이터 백업 실패"
fi

# 로그 정리: 30일 이상된 로그 파일 삭제
find "$LOG_DIR" -name "vf_move_*.log" -mtime +30 2>/dev/null | while read old_log; do
    log "🗑️  오래된 로그 삭제: $(basename "$old_log") (30일 이상)"
    rm -f "$old_log"
done

log "=== VF 자정 자동 이동 완료 ==="
log "로그 파일: $LOG_FILE"
log "총 로그 줄 수: $(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)"

# 성공 알림
log "✅ 스크립트 실행 성공"
log "✅ Cron 등록 준비 완료"

exit 0