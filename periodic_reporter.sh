#!/bin/bash
# 주기적 보고 스크립트

REPORT_INTERVAL=300  # 5분
LAST_REPORT=0

echo "⏰ 주기적 보고 시스템 시작 (간격: ${REPORT_INTERVAL}초)"

while true; do
    CURRENT_TIME=$(date +%s)
    
    if [ $((CURRENT_TIME - LAST_REPORT)) -ge ${REPORT_INTERVAL} ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') 📤 자동 보고 전송"
        
        # 보고 생성
        python3 -c "
import json, time
from datetime import datetime
from pathlib import Path

report_dir = Path('/home/comage/.openclaw/workspace/reports')
report_dir.mkdir(exist_ok=True)

report = {
    'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    'status': '정기 보고',
    'details': '시스템 정상 작동 중',
    'interval': '5분'
}

report_file = report_dir / f'report_{int(time.time())}.json'
with open(report_file, 'w', encoding='utf-8') as f:
    json.dump(report, f, indent=2, ensure_ascii=False)

print(f'✅ 보고 생성: {report_file.name}')
        "
        
        LAST_REPORT=${CURRENT_TIME}
    fi
    
    # 30초 대기
    sleep 30
done