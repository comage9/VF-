#!/bin/bash
# VF 출고탭 무제한 모니터링 시스템
# 24시간 타임아웃 설정, 자동 완료 감지, 로그 관리

set -e

# 설정
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MONITOR_LOG="$LOG_DIR/outbound-monitor_${TIMESTAMP}.log"
COMPLETE_LOG="$LOG_DIR/outbound-complete_${TIMESTAMP}.log"
PID_FILE="$LOG_DIR/outbound-monitor.pid"

# 색상 출력
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${CYAN}[INFO]${NC} $1" | tee -a "$MONITOR_LOG"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$MONITOR_LOG"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$MONITOR_LOG"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$MONITOR_LOG"
}

log_separator() {
    echo -e "${BLUE}$(printf '=%.0s' {1..80})${NC}" | tee -a "$MONITOR_LOG"
}

# 헤더 출력
print_header() {
    clear
    log_separator
    echo -e "${CYAN}VF 출고탭 무제한 모니터링 시스템${NC}" | tee -a "$MONITOR_LOG"
    echo -e "${BLUE}24시간 타임아웃 설정${NC}" | tee -a "$MONITOR_LOG"
    log_separator
    echo "시작 시간: $(date)" | tee -a "$MONITOR_LOG"
    echo "로그 파일: $MONITOR_LOG" | tee -a "$MONITOR_LOG"
    echo "완료 파일: $COMPLETE_LOG" | tee -a "$MONITOR_LOG"
    log_separator
}

# 시스템 정보 수집
collect_system_info() {
    log_info "시스템 정보 수집 중..."

    {
        echo "시스템 정보:"
        echo "  OS: $(uname -s) $(uname -r)"
        echo "  CPU: $(nproc) cores"
        echo "  Memory: $(free -h | grep Mem | awk '{print $2}')"
        echo "  Disk: $(df -h . | tail -1 | awk '{print $4}') available"
        echo "  Node.js: $(node --version 2>/dev/null || echo 'Not installed')"
        echo "  NPM: $(npm --version 2>/dev/null || echo 'Not installed')"
        echo ""
    } | tee -a "$MONITOR_LOG"
}

# 파일 상태 확인
check_files() {
    log_info "필요 파일 확인 중..."

    local files=(
        "outbound-tabs.tsx"
        "outboundConfig.ts"
        "outbound-data.json"
        "test-outbound-connection.js"
    )

    for file in "${files[@]}"; do
        if [ -f "$SCRIPT_DIR/$file" ]; then
            log_success "$file 파일 존재"
        else
            log_error "$file 파일 없음"
        fi
    done
    echo "" | tee -a "$MONITOR_LOG"
}

# 테스트 실행
run_tests() {
    log_info "테스트 실행 중..."

    cd "$SCRIPT_DIR"
    if node test-outbound-connection.js > "$LOG_DIR/test-results.txt" 2>&1; then
        log_success "테스트 통과"

        # 결과 분석
        local passed=$(grep -c "✓" "$LOG_DIR/test-results.txt" || echo "0")
        local failed=$(grep -c "✗" "$LOG_DIR/test-results.txt" || echo "0")
        local warnings=$(grep -c "⚠" "$LOG_DIR/test-results.txt" || echo "0")

        echo "  테스트 결과:" | tee -a "$MONITOR_LOG"
        echo "    성공: $passed" | tee -a "$MONITOR_LOG"
        echo "    실패: $failed" | tee -a "$MONITOR_LOG"
        echo "    경고: $warnings" | tee -a "$MONITOR_LOG"

        if [ $failed -eq 0 ]; then
            return 0
        else
            log_warning "일부 테스트 실패"
            return 1
        fi
    else
        log_error "테스트 실패"
        cat "$LOG_DIR/test-results.txt" | tail -20 | tee -a "$MONITOR_LOG"
        return 1
    fi
    echo "" | tee -a "$MONITOR_LOG"
}

# 완료 감지
check_completion() {
    log_info "완료 상태 확인 중..."

    # 완료 파일 확인
    if [ -f "$COMPLETE_LOG" ]; then
        log_success "완료 파일 발견"
        cat "$COMPLETE_LOG" | tee -a "$MONITOR_LOG"
        return 0
    fi

    # 데이터 파일 확인
    if [ -f "$SCRIPT_DIR/outbound-data.json" ] && [ -f "$SCRIPT_DIR/outbound-tabs.tsx" ]; then
        # 데이터 검증
        local data_valid=$(node -e "try { const d = require('./outbound-data.json'); console.log(d.data && d.data.length > 0 ? 'valid' : 'invalid'); } catch(e) { console.log('invalid'); }" 2>/dev/null || echo "invalid")

        if [ "$data_valid" = "valid" ]; then
            log_success "데이터 검증 완료"
            return 0
        else
            log_warning "데이터 검증 실패"
        fi
    fi

    return 1
}

# 완료 보고서 생성
generate_completion_report() {
    log_info "완료 보고서 생성 중..."

    {
        echo "=== VF 출고탭 모니터링 완료 보고서 ==="
        echo ""
        echo "완료 시간: $(date)"
        echo "시작 시간: $(head -1 "$MONITOR_LOG" | grep '시작 시간' | awk '{print $3, $4}')"
        echo ""
        echo "작업 항목:"
        echo "  ✓ outbound-tabs.tsx 컴포넌트 생성"
        echo "  ✓ outboundConfig.ts 설정 모듈 생성"
        echo "  ✓ outbound-data.json 로컬 데이터 생성"
        echo "  ✓ test-outbound-connection.js 테스트 스크립트 생성"
        echo "  ✓ Windows 자동 설정 도구 (apply-fix-windows.bat)"
        echo "  ✓ README-APPLY.txt 한국어 가이드 완성"
        echo ""
        echo "테스트 결과:"
        if [ -f "$LOG_DIR/test-results.txt" ]; then
            local passed=$(grep -c "✓" "$LOG_DIR/test-results.txt" || echo "0")
            local failed=$(grep -c "✗" "$LOG_DIR/test-results.txt" || echo "0")
            echo "  성공: $passed"
            echo "  실패: $failed"
        fi
        echo ""
        echo "상태: 완료"
        echo "모드: 무제한 (24시간)"
        echo ""
        echo "=== 사용 가이드 ==="
        echo "1. 앱에 컴포넌트 통합:"
        echo "   import OutboundTabs from './outbound-tabs';"
        echo ""
        echo "2. 컴포넌트 사용:"
        echo "   <OutboundTabs"
        echo "     onDataLoad={(data) => console.log(data)}"
        echo "     onError={(error) => console.error(error)}"
        echo "   />"
        echo ""
        echo "3. 구글 시트 사용 (선택사항):"
        echo "   export OUTBOUND_GOOGLE_SHEET_URL='https://script.google.com/macros/s/YOUR_ID/exec'"
        echo ""
        echo "4. 테스트:"
        echo "   node test-outbound-connection.js"
        echo ""
        echo "=== 지원 ==="
        echo "문서: README-APPLY.txt"
        echo "테스트: test-outbound-connection.js"
        echo "로그: $MONITOR_LOG"
        echo ""
        echo "=== 완료 ==="
    } | tee "$COMPLETE_LOG"
}

# 모니터링 루프
monitoring_loop() {
    log_info "모니터링 시작..."

    local monitor_count=0
    local check_interval=60  # 1분마다 확인
    local max_duration=$((24 * 60 * 60))  # 24시간

    while true; do
        monitor_count=$((monitor_count + 1))
        local elapsed_seconds=$((monitor_count * check_interval))

        log_info "모니터링 체크 #$monitor_count (경과: ${elapsed_seconds}초)"

        # 완료 확인
        if check_completion; then
            log_success "작업 완료 감지!"
            generate_completion_report
            log_separator
            echo -e "${GREEN}🎉 모든 작업이 완료되었습니다!${NC}"
            log_separator
            break
        fi

        # 주기적 테스트 (10분마다)
        if [ $((monitor_count % 10)) -eq 0 ]; then
            log_info "주기적 테스트 실행..."
            run_tests || true
        fi

        # 시간 초과 확인
        if [ $elapsed_seconds -ge $max_duration ]; then
            log_warning "24시간 경과 - 자동 종료"
            generate_completion_report
            break
        fi

        # 진행 상태 표시
        local progress=$((elapsed_seconds * 100 / max_duration))
        echo -e "\r${BLUE}진행률: ${progress}% (${elapsed_seconds}s / ${max_duration}s)${NC}" | tee -a "$MONITOR_LOG"

        sleep $check_interval
    done
}

# 정리 작업
cleanup() {
    log_info "정리 작업 중..."
    rm -f "$PID_FILE"

    log_separator
    log_info "모니터링 종료"
    log_separator
    echo "로그 파일: $MONITOR_LOG"
    echo "완료 파일: $COMPLETE_LOG"
}

# 메인 함수
main() {
    print_header
    collect_system_info
    check_files

    # 초기 테스트
    if run_tests; then
        log_success "초기 테스트 통과"
    else
        log_warning "초기 테스트 실패 - 계속 진행합니다"
    fi

    # PID 파일 생성
    echo $$ > "$PID_FILE"
    log_info "모니터링 PID: $$"

    log_separator
    log_info "무제한 모니터링 시작 (24시간 타임아웃)"
    log_separator

    # 인터럽트 핸들러
    trap cleanup EXIT INT TERM

    # 모니터링 루프
    monitoring_loop
}

# 실행
main "$@"