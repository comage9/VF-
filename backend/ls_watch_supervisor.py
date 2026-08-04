# -*- coding: utf-8 -*-
"""
LS 감시 슈퍼바이저: ls_automation --watch 가 죽어도 자동 재기동.
매일 15:00 LS 확인 → PDF → Departure 등록이 끊기지 않게 유지.
"""
import os
import sys
import time
import subprocess
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "departure", "data")
LOCK_PATH = os.path.join(DATA_DIR, ".ls_watch.lock")
SCRIPT = os.path.join(BASE_DIR, "ls_automation.py")
RESTART_SEC = 30


def _write_lock(pid: int) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LOCK_PATH, "w", encoding="utf-8") as f:
        f.write(str(pid))


def main() -> None:
    interval = os.getenv("LS_WATCH_INTERVAL", "10")
    start_h = os.getenv("LS_WATCH_START_HOUR", "15")
    end_h = os.getenv("LS_WATCH_END_HOUR", "23")
    py = sys.executable

    print(
        f"[LS-supervisor] start {datetime.now():%Y-%m-%d %H:%M:%S} "
        f"python={py} interval={interval} {start_h}:00~{end_h}:00"
    )
    sys.stdout.flush()
    _write_lock(os.getpid())

    while True:
        cmd = [
            py,
            "-u",
            SCRIPT,
            "--watch",
            "--interval",
            str(interval),
            "--start-hour",
            str(start_h),
            "--end-hour",
            str(end_h),
        ]
        print(f"\n[LS-supervisor] spawn watch {datetime.now():%H:%M:%S}")
        sys.stdout.flush()
        try:
            env = os.environ.copy()
            env["PYTHONUNBUFFERED"] = "1"
            env["PYTHONIOENCODING"] = "utf-8"
            proc = subprocess.Popen(
                cmd,
                cwd=BASE_DIR,
                env=env,
            )
            # 자식 PID도 기록 (감시는 자식)
            _write_lock(proc.pid)
            code = proc.wait()
            print(
                f"[LS-supervisor] watch 종료 code={code} "
                f"at {datetime.now():%H:%M:%S} → {RESTART_SEC}s 후 재기동"
            )
        except Exception as e:
            print(f"[LS-supervisor] spawn 실패: {e}")
        sys.stdout.flush()
        _write_lock(os.getpid())
        time.sleep(RESTART_SEC)


if __name__ == "__main__":
    main()
