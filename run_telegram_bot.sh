#!/bin/bash
# 텔레그램 봇 실행 스크립트

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GA_DIR="/home/comage/GenericAgent"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}   GenericAgent 텔레그램 봇 실행${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

check_dependencies() {
    echo -e "${YELLOW}의존성 확인 중...${NC}"
    
    # 가상 환경 확인
    if [ ! -f "$GA_DIR/.venv/bin/activate" ]; then
        echo -e "${RED}❌ 가상 환경을 찾을 수 없습니다${NC}"
        return 1
    fi
    
    # Python 패키지 확인
    source "$GA_DIR/.venv/bin/activate"
    
    python3 -c "
import sys
sys.path.insert(0, '$GA_DIR')
try:
    import telegram
    print('✅ python-telegram-bot 설치됨')
except ImportError:
    print('❌ python-telegram-bot 미설치')
    sys.exit(1)
    
try:
    import mykey
    print('✅ mykey.py 로드 성공')
    if not hasattr(mykey, 'tg_bot_token'):
        print('❌ 텔레그램 토큰 설정 안됨')
        sys.exit(1)
    print(f'✅ 텔레그램 토큰: {mykey.tg_bot_token[:10]}...')
except Exception as e:
    print(f'❌ 설정 오류: {e}')
    sys.exit(1)
" || return 1
    
    echo -e "${GREEN}✅ 모든 의존성 확인 완료${NC}"
    return 0
}

start_bot() {
    echo -e "${GREEN}텔레그램 봇 시작 중...${NC}"
    
    cd "$GA_DIR"
    source .venv/bin/activate
    
    # 로그 파일 설정
    LOG_FILE="$SCRIPT_DIR/logs/telegram_bot_$(date +%Y%m%d_%H%M%S).log"
    mkdir -p "$(dirname "$LOG_FILE")"
    
    echo -e "${YELLOW}로그 파일: $LOG_FILE${NC}"
    echo -e "${YELLOW}텔레그램 봇을 시작합니다...${NC}"
    echo -e "${YELLOW}종료하려면 Ctrl+C를 누르세요${NC}"
    echo ""
    
    # 텔레그램 봇 실행
    python frontends/tgapp.py 2>&1 | tee "$LOG_FILE"
    
    echo -e "${RED}텔레그램 봇이 종료되었습니다${NC}"
}

stop_bot() {
    echo -e "${YELLOW}텔레그램 봇 중지 중...${NC}"
    
    pkill -f "tgapp.py" 2>/dev/null
    sleep 2
    
    if pgrep -f "tgapp.py" > /dev/null; then
        echo -e "${RED}❌ 봇 중지 실패, 강제 종료 시도...${NC}"
        pkill -9 -f "tgapp.py" 2>/dev/null
    fi
    
    echo -e "${GREEN}✅ 텔레그램 봇 중지 완료${NC}"
}

check_status() {
    echo -e "${YELLOW}텔레그램 봇 상태 확인...${NC}"
    
    if pgrep -f "tgapp.py" > /dev/null; then
        echo -e "${GREEN}✅ 텔레그램 봇 실행 중${NC}"
        ps aux | grep "tgapp.py" | grep -v grep
        return 0
    else
        echo -e "${RED}❌ 텔레그램 봇 중지됨${NC}"
        return 1
    fi
}

show_logs() {
    echo -e "${YELLOW}최근 로그 확인...${NC}"
    
    LOG_DIR="$SCRIPT_DIR/logs"
    if [ -d "$LOG_DIR" ]; then
        LATEST_LOG=$(ls -t "$LOG_DIR"/telegram_bot_*.log 2>/dev/null | head -1)
        if [ -n "$LATEST_LOG" ]; then
            echo -e "${BLUE}로그 파일: $LATEST_LOG${NC}"
            tail -20 "$LATEST_LOG"
        else
            echo -e "${YELLOW}로그 파일이 없습니다${NC}"
        fi
    else
        echo -e "${YELLOW}로그 디렉토리가 없습니다${NC}"
    fi
}

case "$1" in
    start)
        print_header
        check_dependencies && start_bot
        ;;
    
    stop)
        print_header
        stop_bot
        ;;
    
    status)
        print_header
        check_status
        ;;
    
    logs)
        print_header
        show_logs
        ;;
    
    restart)
        print_header
        stop_bot
        sleep 2
        check_dependencies && start_bot
        ;;
    
    test)
        print_header
        echo -e "${GREEN}텔레그램 봇 테스트 모드...${NC}"
        
        # 테스트 메시지 전송 (간단한 테스트)
        source "$GA_DIR/.venv/bin/activate"
        python3 -c "
import asyncio
import sys
sys.path.insert(0, '$GA_DIR')

try:
    import mykey
    print(f'토큰: {mykey.tg_bot_token[:10]}...')
    print(f'사용자 ID: {mykey.tg_allowed_users}')
    
    # 간단한 API 테스트
    import requests
    token = mykey.tg_bot_token
    url = f'https://api.telegram.org/bot{token}/getMe'
    response = requests.get(url, timeout=10)
    
    if response.status_code == 200:
        data = response.json()
        if data.get('ok'):
            bot_info = data['result']
            print('✅ 텔레그램 봇 연결 성공!')
            print(f'🤖 봇 이름: {bot_info.get(\"first_name\")}')
            print(f'📝 봇 사용자명: @{bot_info.get(\"username\")}')
            print(f'🆔 봇 ID: {bot_info.get(\"id\")}')
        else:
            print('❌ 텔레그램 API 오류')
    else:
        print(f'❌ HTTP 오류: {response.status_code}')
        
except Exception as e:
    print(f'❌ 테스트 실패: {e}')
"
        ;;
    
    help|*)
        print_header
        echo -e "${GREEN}사용법: $0 {start|stop|status|logs|restart|test|help}${NC}"
        echo ""
        echo -e "${YELLOW}명령어 설명:${NC}"
        echo -e "  ${GREEN}start${NC}    - 텔레그램 봇 시작"
        echo -e "  ${GREEN}stop${NC}     - 텔레그램 봇 중지"
        echo -e "  ${GREEN}status${NC}   - 봇 상태 확인"
        echo -e "  ${GREEN}logs${NC}     - 로그 확인"
        echo -e "  ${GREEN}restart${NC}  - 봇 재시작"
        echo -e "  ${GREEN}test${NC}     - 연결 테스트"
        echo -e "  ${GREEN}help${NC}     - 도움말"
        echo ""
        echo -e "${YELLOW}텔레그램 봇 정보:${NC}"
        echo -e "  토큰: 8750417412:AAF3Zs8aHwp-sG8zTsZhLc6Q-Sssl5RsW2k"
        echo -e "  사용자 ID: 5708696961 (주현 김)"
        echo -e "  실행 파일: $GA_DIR/frontends/tgapp.py"
        ;;
esac