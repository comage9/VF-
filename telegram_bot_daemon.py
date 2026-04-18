#!/usr/bin/env python3
"""
텔레그램 봇 데몬 실행기
GenericAgent 텔레그램 봇을 데몬 모드로 실행
"""

import os
import sys
import time
import subprocess
import signal
import logging
from pathlib import Path

class TelegramBotDaemon:
    """텔레그램 봇 데몬 관리 클래스"""
    
    def __init__(self):
        self.script_dir = Path("/home/comage/.openclaw/workspace")
        self.ga_dir = Path("/home/comage/GenericAgent")
        self.pid_file = self.script_dir / "telegram_bot.pid"
        self.log_file = self.script_dir / "logs" / f"telegram_bot_{time.strftime('%Y%m%d_%H%M%S')}.log"
        self.process = None
        
        # 로그 디렉토리 생성
        self.log_file.parent.mkdir(exist_ok=True)
        
        # 로깅 설정
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(self.log_file),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
    
    def check_dependencies(self):
        """의존성 확인"""
        self.logger.info("의존성 확인 중...")
        
        # 가상 환경 확인
        if not (self.ga_dir / ".venv" / "bin" / "activate").exists():
            self.logger.error("가상 환경을 찾을 수 없습니다")
            return False
        
        # Python 패키지 확인
        try:
            # 가상 환경에서 Python 실행
            test_cmd = [
                str(self.ga_dir / ".venv" / "bin" / "python"),
                "-c",
                """
import sys
sys.path.insert(0, '/home/comage/GenericAgent')
try:
    import telegram
    print('SUCCESS: python-telegram-bot 설치됨')
    
    import mykey
    if hasattr(mykey, 'tg_bot_token') and mykey.tg_bot_token:
        print(f'SUCCESS: 텔레그램 토큰 설정됨: {mykey.tg_bot_token[:10]}...')
    else:
        print('ERROR: 텔레그램 토큰 설정 안됨')
        sys.exit(1)
        
except Exception as e:
    print(f'ERROR: {e}')
    sys.exit(1)
                """
            ]
            
            result = subprocess.run(test_cmd, capture_output=True, text=True, timeout=10)
            
            if result.returncode != 0:
                self.logger.error(f"의존성 확인 실패: {result.stderr}")
                return False
            
            self.logger.info("의존성 확인 완료")
            for line in result.stdout.strip().split('\n'):
                if line.startswith('SUCCESS:'):
                    self.logger.info(line)
                elif line.startswith('ERROR:'):
                    self.logger.error(line)
            
            return True
            
        except Exception as e:
            self.logger.error(f"의존성 확인 중 오류: {e}")
            return False
    
    def start(self):
        """봇 시작"""
        self.logger.info("텔레그램 봇 시작 중...")
        
        if not self.check_dependencies():
            self.logger.error("의존성 확인 실패로 봇을 시작할 수 없습니다")
            return False
        
        # 이미 실행 중인지 확인
        if self.is_running():
            self.logger.warning("봇이 이미 실행 중입니다")
            return True
        
        try:
            # 가상 환경에서 봇 실행
            cmd = [
                str(self.ga_dir / ".venv" / "bin" / "python"),
                str(self.ga_dir / "frontends" / "tgapp.py")
            ]
            
            self.logger.info(f"명령어 실행: {' '.join(cmd)}")
            
            # 로그 파일 열기
            log_fd = open(self.log_file, 'a')
            
            # 프로세스 시작
            self.process = subprocess.Popen(
                cmd,
                stdout=log_fd,
                stderr=subprocess.STDOUT,
                preexec_fn=os.setsid,
                cwd=str(self.ga_dir)
            )
            
            # PID 저장
            with open(self.pid_file, 'w') as f:
                f.write(str(self.process.pid))
            
            self.logger.info(f"봇 시작됨 (PID: {self.process.pid})")
            self.logger.info(f"로그 파일: {self.log_file}")
            
            # 시작 확인
            time.sleep(3)
            if self.is_running():
                self.logger.info("✅ 텔레그램 봇이 성공적으로 시작되었습니다")
                self.logger.info("🤖 봇 사용자명: @openclaw_comage9_bot")
                self.logger.info("📱 텔레그램에서 봇에게 메시지를 보내보세요!")
                return True
            else:
                self.logger.error("봇이 시작되지 않았습니다")
                return False
                
        except Exception as e:
            self.logger.error(f"봇 시작 중 오류: {e}")
            return False
    
    def stop(self):
        """봇 중지"""
        self.logger.info("텔레그램 봇 중지 중...")
        
        # PID 파일에서 읽기
        if self.pid_file.exists():
            try:
                with open(self.pid_file, 'r') as f:
                    pid = int(f.read().strip())
                
                # 프로세스 종료
                os.kill(pid, signal.SIGTERM)
                time.sleep(2)
                
                # 강제 종료 시도
                if self.is_pid_running(pid):
                    os.kill(pid, signal.SIGKILL)
                    time.sleep(1)
                
                # PID 파일 삭제
                self.pid_file.unlink(missing_ok=True)
                
                self.logger.info("✅ 텔레그램 봇 중지 완료")
                return True
                
            except ProcessLookupError:
                self.logger.warning("프로세스를 찾을 수 없습니다 (이미 종료됨)")
                self.pid_file.unlink(missing_ok=True)
                return True
            except Exception as e:
                self.logger.error(f"봇 중지 중 오류: {e}")
                return False
        else:
            self.logger.warning("PID 파일을 찾을 수 없습니다")
            return True
    
    def is_pid_running(self, pid):
        """PID가 실행 중인지 확인"""
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False
    
    def is_running(self):
        """봇이 실행 중인지 확인"""
        # PID 파일 확인
        if self.pid_file.exists():
            try:
                with open(self.pid_file, 'r') as f:
                    pid = int(f.read().strip())
                return self.is_pid_running(pid)
            except:
                return False
        
        # 프로세스 목록에서 확인
        try:
            result = subprocess.run(
                ["pgrep", "-f", "tgapp.py"],
                capture_output=True,
                text=True
            )
            return result.returncode == 0
        except:
            return False
    
    def status(self):
        """봇 상태 확인"""
        if self.is_running():
            self.logger.info("✅ 텔레그램 봇이 실행 중입니다")
            
            # PID 파일에서 정보 읽기
            if self.pid_file.exists():
                try:
                    with open(self.pid_file, 'r') as f:
                        pid = f.read().strip()
                    self.logger.info(f"📊 PID: {pid}")
                except:
                    pass
            
            # 로그 파일 정보
            if self.log_file.exists():
                size = self.log_file.stat().st_size
                self.logger.info(f"📁 로그 파일: {self.log_file} ({size} bytes)")
            
            self.logger.info("🤖 봇 정보:")
            self.logger.info("  • 이름: openclaw_bot")
            self.logger.info("  • 사용자명: @openclaw_comage9_bot")
            self.logger.info("  • ID: 8750417412")
            self.logger.info("  • 사용자: 5708696961 (주현 김)")
            
            return True
        else:
            self.logger.info("❌ 텔레그램 봇이 중지되었습니다")
            return False
    
    def show_logs(self, lines=20):
        """로그 출력"""
        if self.log_file.exists():
            self.logger.info(f"📄 최근 로그 ({lines}줄):")
            try:
                with open(self.log_file, 'r') as f:
                    log_lines = f.readlines()
                    for line in log_lines[-lines:]:
                        print(line.rstrip())
            except Exception as e:
                self.logger.error(f"로그 읽기 오류: {e}")
        else:
            self.logger.info("로그 파일이 없습니다")

def main():
    """메인 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description="텔레그램 봇 데몬 관리")
    parser.add_argument("action", choices=["start", "stop", "restart", "status", "logs"],
                       help="실행할 액션")
    parser.add_argument("--lines", type=int, default=20,
                       help="로그 출력 줄 수 (기본: 20)")
    
    args = parser.parse_args()
    
    daemon = TelegramBotDaemon()
    
    if args.action == "start":
        success = daemon.start()
        sys.exit(0 if success else 1)
        
    elif args.action == "stop":
        success = daemon.stop()
        sys.exit(0 if success else 1)
        
    elif args.action == "restart":
        daemon.stop()
        time.sleep(2)
        success = daemon.start()
        sys.exit(0 if success else 1)
        
    elif args.action == "status":
        success = daemon.status()
        sys.exit(0 if success else 1)
        
    elif args.action == "logs":
        daemon.show_logs(args.lines)
        sys.exit(0)

if __name__ == "__main__":
    main()