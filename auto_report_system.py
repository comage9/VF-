#!/usr/bin/env python3
"""
자동 보고 시스템 - 서브 에이전트 작업 모니터링
"""

import time
import json
from datetime import datetime
from pathlib import Path

class AutoReportSystem:
    """자동 보고 시스템"""
    
    def __init__(self):
        self.report_dir = Path("/home/comage/.openclaw/workspace/reports")
        self.report_dir.mkdir(exist_ok=True)
        self.report_interval = 300  # 5분 간격 (초)
        self.last_report_time = 0
        
    def create_report(self, status, details):
        """보고 생성"""
        report = {
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "status": status,
            "details": details,
            "type": "auto_report"
        }
        
        # 보고 파일 저장
        report_file = self.report_dir / f"report_{int(time.time())}.json"
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        return report
    
    def should_report(self):
        """보고 필요 여부 확인"""
        current_time = time.time()
        if current_time - self.last_report_time >= self.report_interval:
            self.last_report_time = current_time
            return True
        return False
    
    def send_report(self, report):
        """보고 전송 (채팅으로)"""
        # 간단한 보고 메시지 생성
        message = f"""
📊 자동 보고 ({report['timestamp']})

상태: {report['status']}
세부사항: {report['details']}
        """.strip()
        
        print(f"\n{'='*50}")
        print("📤 보고 전송:")
        print(message)
        print(f"{'='*50}\n")
        
        # 실제 채팅 전송은 외부에서 처리
        return message

def main():
    """메인 함수 - 보고 시스템 테스트"""
    print("🔧 자동 보고 시스템 시작")
    
    report_system = AutoReportSystem()
    
    # 초기 보고
    initial_report = report_system.create_report(
        "시스템 시작",
        "서브 에이전트 생성 및 보고 시스템 구축 시작"
    )
    report_system.send_report(initial_report)
    
    print("✅ 보고 시스템 활성화 완료")
    print(f"📁 보고 저장 위치: {report_system.report_dir}")
    print(f"⏱️  보고 간격: {report_system.report_interval}초 (5분)")
    
    return report_system

if __name__ == "__main__":
    main()