#!/bin/bash
# Claude Code 타임아웃 해결 스크립트

echo "=== Claude Code 타임아웃 설정 개선 ==="

# 1. 환경변수 설정 (재시작 후에도 유지)
echo "설정할 타임아웃(초): $1"
TIMEOUT=${1:-300}  # 기본값 5분

# 2. 시스템 환경변수 설정
echo "export CLAUDE_CODE_TIMEOUT=${TIMEOUT}" >> ~/.bashrc
echo "export CLAUDE_TIMEOUT_MS=$((TIMEOUT * 1000))" >> ~/.bashrc

# 3. 현재 세션에도 적용
export CLAUDE_CODE_TIMEOUT=${TIMEOUT}
export CLAUDE_TIMEOUT_MS=$((TIMEOUT * 1000))

# 4. 테스트 명령어 생성
echo ""
echo "=== 테스트 명령어 ==="
echo "# 기본 테스트:"
echo "timeout ${TIMEOUT} claude --permission-mode bypassPermissions --print '테스트 응답'"

echo ""
echo "# VF outbound 탭 코드 생성 테스트:"
cat << 'EOF'
timeout ${TIMEOUT} claude --permission-mode bypassPermissions --print "outbound-tabs.tsx 환경변수 처리 코드:

1. process.env.OUTBOUND_GOOGLE_SHEET_URL 읽기
2. 값이 없으면 로컬 JSON 파일 사용
3. 에러 처리 포함
4. TypeScript 타입 정의 포함"
EOF

echo ""
echo "=== 적용 방법 ==="
echo "1. 현재 터미널에서: source ~/.bashrc"
echo "2. 새 터미널에서: 자동 적용됨"
echo "3. 타임아웃 확인: echo \$CLAUDE_CODE_TIMEOUT"

echo ""
echo "=== 권장 타임아웃 값 ==="
echo "- 개발: 300초 (5분)"
echo "- 복잡 작업: 600초 (10분)"
echo "- 매우 복잡: 1800초 (30분)"

# 5. 실제 테스트 실행 (옵션)
if [ "$2" == "test" ]; then
    echo ""
    echo "=== 즉시 테스트 실행 ==="
    timeout ${TIMEOUT} claude --permission-mode bypassPermissions --print "타임아웃 ${TIMEOUT}초 테스트: 간단한 console.log 코드 작성"
fi