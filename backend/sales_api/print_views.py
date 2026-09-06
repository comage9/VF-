# -*- coding: utf-8 -*-
"""
원격 무음 인쇄 API (2026-09-06)
================================
목적: 프린터가 연결된 Windows 실서버(데스크톱)에서 로컬 파일을 무음 인쇄한다.
      Linux 개발 머신(Hermes)은 프린터가 없으므로, 데스크톱 Django 서버(5176, 공인 bonohouse.p-e.kr
      노출됨)가 이 뷰를 실행하면 원격 HTTP 요청만으로 데스크톱 프린터(Canon G2010)를 조작할 수 있다.

엔드포인트
----------
GET  /api/print/status
     → { platform, printers[], default_printer, region_dir, region_files{약어:파일명} }

POST /api/print           (헤더: X-VF-Token: <VF_PRINT_TOKEN>)
     body: { "region": "east", "copies": 15 }                  # 권역지 폴더에서 파일 찾음
        또는 { "path": "C:/dir/file.pdf", "copies": 1 }          # 절대 경로 직접 인쇄
        (선택 "printer": "Canon G2010 series" — 미지정 시 Canon 자동 교정 후 기본 프린터 사용)
     → { ok, spooled, file, printer, note }

인쇄 엔진
---------
- Windows: win32print로 Canon G2010 교정 → os.startfile(file, "print") N회 (0.5s 간격, 스풀러 누적 무음).
  os.startfile "print" = 파일 기본 연결 프로그램(Edge 등 PDF 뷰어)의 무음 인쇄 동사.
  (gwon-yeokji 권역지·KPP EDI 전표 인쇄에서 검증된 방식과 동일)
- Linux:   lp -d <printer> -n <copies> <file> (CUPS 프린터 필요 — 대비용)

보안
-----
- 쓰기(인쇄)는 X-VF-Token == settings.VF_PRINT_TOKEN 일 때만 허용.
  VF_PRINT_TOKEN 미설정 시 503 반환 (의도적 — 인쇄는 물리 출력이라 무검증 허용 금지).
- GET status는 토큰 없이 허용(현황 조회는 무해).
"""
from __future__ import annotations

import json
import os
import platform
import time
from pathlib import Path

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings

# 권역 약어 → 파일명 (기존 gwon-yeokji 스킬 매핑과 동일)
REGION_FILES = {
    "d": "DGU.pdf", "dgu": "DGU.pdf",
    "e": "EAST.pdf", "east": "EAST.pdf",
    "g": "GMH.pdf", "gmh": "GMH.pdf",
    "j": "GWJ.pdf", "gwj": "GWJ.pdf",
    "m": "Middle.pdf", "middle": "Middle.pdf",
    "w": "WEST.pdf", "west": "WEST.pdf",
}
CANON_KEY = "Canon G2010"

# 권역지 폴더 후보: env REGION_DIR > Windows 기본 경로
_REGION_DIR = None


def _region_dir() -> str | None:
    global _REGION_DIR
    if _REGION_DIR is not None:
        return _REGION_DIR or None
    cand = (os.environ.get("REGION_DIR") or "").strip() or r"E:\자주쓰는 문서\권역지"
    _REGION_DIR = cand if os.path.isdir(cand) else ""
    return _REGION_DIR or None


def _win_printers() -> list[str]:
    """Windows 프린터 목록 (pywin32). 실패 시 []."""
    try:
        import win32print  # type: ignore
        return [p[2] for p in win32print.EnumPrinters(2)]
    except Exception:
        return []


def _linux_printers() -> list[str]:
    """Linux CUPS 프린터 목록 (lpstat). 실패 시 []."""
    try:
        import subprocess
        out = subprocess.run(["lpstat", "-e"], capture_output=True, text=True, timeout=10).stdout
        return [ln.strip() for ln in out.splitlines() if ln.strip()]
    except Exception:
        return []


def _default_printer() -> str | None:
    sysname = platform.system()
    try:
        if sysname == "Windows":
            import win32print  # type: ignore
            return win32print.GetDefaultPrinter() or None
        import subprocess
        out = subprocess.run(["lpstat", "-d"], capture_output=True, text=True, timeout=10).stdout
        return out.split(":", 1)[1].strip() if ":" in out else None
    except Exception:
        return None


def _ensure_canon_default(printers: list[str]) -> str | None:
    """Canon G2010이 있으면 기본 프린터로 교정. 교정된 프린터명(없으면 None) 반환."""
    try:
        if platform.system() != "Windows":
            return None
        import win32print  # type: ignore
        canon = [p for p in printers if CANON_KEY in p]
        if not canon:
            return None
        if CANON_KEY not in (win32print.GetDefaultPrinter() or ""):
            win32print.SetDefaultPrinter(canon[0])
        return canon[0]
    except Exception:
        return None


def _spool_windows(file_path: str, copies: int, printer: str | None) -> bool:
    """os.startfile(file, 'print') N회 — 스풀러 누적 (무음). printer 지정 시 교정."""
    try:
        import win32print  # type: ignore
        if printer and platform.system() == "Windows":
            win32print.SetDefaultPrinter(printer)
    except Exception:
        pass
    try:
        sleep_s = 1.0 if copies >= 10 else 0.5
        for _ in range(copies):
            os.startfile(file_path, "print")  # Windows 전용
            time.sleep(sleep_s)
        return True
    except Exception:
        return False


def _spool_linux(file_path: str, copies: int, printer: str | None) -> bool:
    """lp -d <printer> -n <copies> (CUPS). printer 없으면 기본 프린터 사용."""
    try:
        import subprocess
        cmd = ["lp"]
        if printer:
            cmd += ["-d", printer]
        cmd += ["-n", str(copies), file_path]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return r.returncode == 0
    except Exception:
        return False


@csrf_exempt
def print_status(request):
    """GET /api/print/status — 플랫폼·프린터·권역지 파일 현황 (토큰 불필요)."""
    if request.method != "GET":
        return JsonResponse({"error": "GET만 지원합니다"}, status=405)
    sysname = platform.system()
    printers = _win_printers() if sysname == "Windows" else _linux_printers()
    rd = _region_dir()
    region_files = {}
    if rd:
        for alias, fname in REGION_FILES.items():
            if (Path(rd) / fname).is_file():
                region_files[alias] = fname
    return JsonResponse({
        "platform": sysname,
        "printers": printers,
        "default_printer": _default_printer(),
        "region_dir": rd,
        "region_files": region_files,
        "token_set": bool((getattr(settings, "VF_PRINT_TOKEN", "") or "").strip()),
    })


@csrf_exempt
def print_job(request):
    """POST /api/print — 무음 인쇄 (X-VF-Token 필수).

    body: { region: "east", copies: 15 } | { path: "C:/...", copies: 1 }  (+선택 printer)
    """
    if request.method != "POST":
        return JsonResponse({"error": "POST만 지원합니다"}, status=405)

    token = (getattr(settings, "VF_PRINT_TOKEN", "") or "").strip()
    if not token:
        return JsonResponse({"error": "VF_PRINT_TOKEN 미설정 — backend/.env에 설정 후 재시작 필요"}, status=503)
    if request.headers.get("X-VF-Token", "") != token:
        return JsonResponse({"error": "인쇄 토큰이 올바르지 않습니다"}, status=403)

    try:
        body = json.loads(request.body)
    except Exception:
        return JsonResponse({"error": "JSON 형식이 올바르지 않습니다"}, status=400)

    copies = body.get("copies", 1)
    try:
        copies = max(1, min(99, int(copies)))
    except Exception:
        return JsonResponse({"error": "copies는 1~99 정수여야 합니다"}, status=400)

    # ① 인쇄 대상 파일 결정: region(권역지) 또는 path(직접)
    file_path = None
    region = (body.get("region") or "").strip().lower()
    raw_path = (body.get("path") or "").strip()
    if region:
        rd = _region_dir()
        if not rd:
            return JsonResponse({"error": "권역지 폴더 없음 — REGION_DIR 설정 필요 (Windows 기본: E:\\자주쓰는 문서\\권역지)"}, status=404)
        fname = REGION_FILES.get(region)
        if not fname:
            return JsonResponse({"error": f"알 수 없는 권역 '{region}' — 허용: {', '.join(sorted(set(REGION_FILES)))}"}, status=400)
        file_path = str(Path(rd) / fname)
        if not os.path.isfile(file_path):
            return JsonResponse({"error": f"파일 없음: {file_path}"}, status=404)
    elif raw_path:
        if not os.path.isfile(raw_path):
            return JsonResponse({"error": f"파일 없음: {raw_path}"}, status=404)
        file_path = raw_path
    else:
        return JsonResponse({"error": "region(권역) 또는 path(파일) 중 하나가 필요합니다"}, status=400)

    # ② 프린터 결정: 지정 > Canon 자동 교정 > 기본
    printer = (body.get("printer") or "").strip() or None
    sysname = platform.system()
    printers = _win_printers() if sysname == "Windows" else _linux_printers()
    canon_name = None
    if printer:
        if not any(printer in p for p in printers):
            return JsonResponse({"error": f"프린터 없음: '{printer}' — 사용 가능: {printers}"}, status=404)
    elif sysname == "Windows":
        canon_name = _ensure_canon_default(printers)  # Canon 있으면 기본 교정
        if not canon_name:
            return JsonResponse({"error": f"Canon G2010 프린터 없음 — 사용 가능: {printers}"}, status=404)

    # ③ 스풀러 전송
    ok = _spool_windows(file_path, copies, printer or canon_name) if sysname == "Windows" else _spool_linux(file_path, copies, printer)
    if not ok:
        return JsonResponse({"error": "인쇄 스풀러 전송 실패 — 서버 로그/프린터 상태 확인"}, status=500)

    return JsonResponse({
        "ok": True,
        "spooled": copies,
        "file": file_path,
        "printer": printer or canon_name or _default_printer(),
        "note": "스풀러 전송 완료 — 출력물 확인 부탁드립니다",
    })
