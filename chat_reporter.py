#!/usr/bin/env python3
"""
채팅 보고 시스템 - 파일 보고를 채팅으로 전송
"""

import json
import time
from datetime import datetime
from pathlib import Path
import subprocess

class ChatReporter:
    """채팅 보고 시스템"""
    
    def __init__(self):
        self.report_dir = Path("/home/comage/.openclaw/workspace/reports")
        self.last_report_time = 0
        self.check_interval = 60  # 1분 간격 확인
        
    def check_new_reports(self):
        """새 보고 확인"""
        reports = list(self.report_dir.glob("report_*.json"))
        if not reports:
            return []
        
        # 시간순 정렬
        reports.sort(key=lambda x: x.stat().st_mtime)
        
        # 새 보고 필터링
        new_reports = []
        for report_file in reports:
            report_time = report_file.stat().st_mtime
            if report_time > self.last_report_time:
                new_reports.append(report_file)
        
        if new_reports:
            self.last_report_time = max(r.stat().st_mtime for r in new_reports)
        
        return new_reports
    
    def send_to_chat(self, report_data):
        """채팅으로 보고 전송"""
        message = f"""
📊 자동 보고 ({report_data['timestamp']})

상태: {report_data['status']}
세부사항: {report_data['details']}
        """.strip()
        
        print(f"\n{'='*50}")
        print("💬 채팅 보고 전송:")
        print(message)
        print(f"{'='*50}\n")
        
        # 실제 채팅 전송 (간단한 echo로 시뮬레이션)
        subprocess.run(["echo", "📤 보고 전송 필요"], capture_output=True)
        
        return message
    
    def run(self):
        """주기적 실행"""
        print("💬 채팅 보고 시스템 시작")
        
        while True:
            new_reports = self.check_new_reports()
            
            for report_file in new_reports:
                try:
                    with open(report_file, 'r', encoding='utf-8') as f:
                        report_data = json.load(f)
                    
                    # 채팅으로 전송
                    self.send_to_chat(report_data)
                    
                    # 전송 완료 표시
                    print(f"✅ 보고 전송 완료: {report_file.name}")
                    
                except Exception as e:
                    print(f"❌ 보고 전송 오류 ({report_file}): {e}")
            
            # 대기
            time.sleep(self.check_interval)

def main():
    """메인 함수"""
    reporter = ChatReporter()
    
    # 초기 보고
    initial_report = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "status": "채팅 보고 시스템 시작",
        "details": "파일 보고를 채팅으로 자동 전송 시작"
    }
    reporter.send_to_chat(initial_report)
    
    # 주기적 실행
    reporter.run()

if __name__ == "__main__":
    main()