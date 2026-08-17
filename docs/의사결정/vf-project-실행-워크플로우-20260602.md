---
type: 의사결정
created: 2026-06-02 23:15
updated: 2026-06-02 23:15
status: 완료
tags: [VF-project, Django, Vite, start_all.sh, Cross-Platform, Linux/Windows]
---

# VF-project 실행 워크플로우 (2026-06-02 확정)

> **목적:** VF-project(보노하우스 생산관리, Django+Vite)를 Linux/Windows 어디서든
> 일관되게 실행하기 위한 확정 절차. 마스터/실행본 분리, Windows venv/Windows
> esbuild → Linux 재생성 규칙, 동시 실행 금지.

## 핵심 결정 (한 줄 요약)

- **마스터**: `/media/comage/data/coding/VF-new - 복사본/` (Windows+Linux 공유, NTFS rw)
- **Linux 실행본**: `/home/comage/VF-project/` (마스터에서 매번 복사, Linux용 재생성)
- **Windows 실행**: 마스터에서 `start_all.bat` 직접
- **동시 실행 금지** (SQLite 락 충돌)

## 왜 이렇게 됐나 (맥락)

2026-06-02 시점에 다음을 발견:
1. `/home/comage/data/coding/`은 사실 **read-only 아님** (`fuseblk rw`, NTFS 직접 마운트)
2. 마스터는 **Windows에서 만든 venv** (`Scripts/`, `bin/` 없음, `pyvenv.cfg`에 `C:\Users\kis\...`)
3. 마스터의 `frontend/client/node_modules`도 **Windows용** (`@esbuild/win32-x64`만 존재)
4. 사용자가 명시: **Windows와 Linux가 같은 마스터 폴더를 공유**, "수정이 있다면 마스터에 바로 진행"

**기존 운영원칙 오류 정정**:
- 옛: "Any project from /media/comage/data/coding/ must be copied to /home/comage/ before it can be run or modified"
- 새: "VF-new - 복사본은 마스터. Linux/Windows 모두 마스터에서 직접 실행, **단 Linux는 /home/comage/VF-project/ 복사본 사용**"

## 파일 위치

| 역할 | 경로 | 비고 |
|------|------|------|
| **마스터 (Windows+Linux 공유)** | `/media/comage/data/coding/VF-new - 복사본/` | NTFS, rw, Windows .bat + Linux .sh 둘 다 |
| **Linux 실행본** | `/home/comage/VF-project/` | 마스터 복사본, Linux venv + Linux node_modules |
| **외부 접속 URL** | `http://59.9.19.188:5174/` | 이 머신 공인 IP (2026-06-02 확인) |
| **외부 IP 확인법** | `hostname -I` + `curl -m 5 https://ifconfig.me` | DHCP/VPN 변경 가능, 매번 재확인 |
| **옛 IP** | `220.121.225.76` | 2026-04 시점, 위키 10개 파일 정정 완료 |

## Linux 실행 절차 (매번)

```bash
# 1. 마스터에서 복사 (필요 시)
cp -r "/media/comage/data/coding/VF-new - 복사본" /home/comage/VF-project

# 2. Linux venv 재생성 (Windows venv → Linux venv)
cd /home/comage/VF-project/backend
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Linux용 node_modules 재생성 (Windows esbuild → Linux esbuild)
cd /home/comage/VF-project/frontend/client
mv node_modules node_modules.win.bak  # Windows 빌드 백업 (선택)
npm install

# 4. 실행
cd /home/comage/VF-project
./start_all.sh

# 5. 종료
./stop_all.sh
```

## Windows 실행 절차

```cmd
cd E:\coding\VF-new - 복사본
start_all.bat
```

`start_all.bat`는 Windows venv (`backend/.venv/Scripts/python.exe`)를 그대로 사용.

## 스크립트 (start_all.sh, stop_all.sh)

**위치**: 마스터와 VF-project 둘 다 동일하게 복사되어 있음
- `/media/comage/data/coding/VF-new - 복사본/start_all.sh`
- `/media/comage/data/coding/VF-new - 복사본/stop_all.sh`
- `/home/comage/VF-project/start_all.sh`
- `/home/comage/VF-project/stop_all.sh`

**기능**:
- 환경 자동 점검 (.venv, manage.py, node_modules, 포트)
- 백엔드 5176 + 프론트엔드 5174 동시 실행
- 헬스 체크 + 로그 안내
- PID 파일: `/tmp/vf-{backend,frontend}.pid`
- 로그: `/tmp/vf-logs/{backend,frontend}.log`
- 종료 시 자동 정리 (trap)

## 환경 차이 정리 (Windows vs Linux)

| 항목 | Windows 마스터 | Linux VF-project |
|------|----------------|-----------------|
| Python | `C:\Users\kis\AppData\Local\Programs\Python\Python313\python.exe` | `/usr/bin/python3` (3.12.3) |
| .venv 구조 | `Scripts/python.exe`, `Lib/site-packages` | `bin/python`, `lib/python3.12/site-packages` |
| esbuild | `@esbuild/win32-x64/` | `@esbuild/linux-x64/` |
| Django/Node | Windows 호환 | Linux 호환 |
| 실행 스크립트 | `start_all.bat` | `start_all.sh` |
| 백엔드 포트 | 5176 | 5176 |
| 프론트엔드 포트 | 5174 | 5174 |

## 데이터 단일 소스 (옵션 2: symlink)

2026-06-02 시점에 **VF-project의 db.sqlite3과 inventory_unified.json을 마스터로 symlink** 처리:

```
/home/comage/VF-project/backend/db.sqlite3          → /media/comage/data/coding/VF-new - 복사본/backend/db.sqlite3
/home/comage/VF-project/inventory_unified.json     → /media/comage/data/coding/VF-new - 복사본/inventory_unified.json
```

**장점**:
- Windows 실행 → 마스터 db 변경 → Linux 실행 시 자동으로 마스터 db 읽음 (단일 소스)
- `cp` 동기화 불필요, 데이터 누락 0%
- NTFS rw + FUSE/udisks2가 symlink 지원 (확인 완료)

**start_all.sh에 symlink 보장 로직 포함**:
- `cp -r`로 마스터 복사 시 db.sqlite3은 일반 파일로 옴
- start_all.sh 실행 시 일반 파일이면 symlink로 자동 교체 (백업 후)
- 위치: `/home/comage/VF-project/start_all.sh` (마스터와 VF-project 둘 다 동일)

**검증 (2026-06-02 23:17)**:
- VF-project 실행 → `/api/production` 응답 = count: 30, latestDate: 2026-06-02 (마스터 db 데이터)
- 마스터 직접 db의 mtime 변경 → VF-project에서 즉시 반영 (단일 inode 확인)

**제한**:
- 동시 실행 금지 (SQLite single-writer) — 이미 적용
- Windows에서 마스터 직접 수정 → Linux 실행 시 즉시 반영 (의도된 동작)
- Windows의 db.sqlite3을 Windows가 닫은 상태여야 Linux가 rw 가능 (파일 락)

## 정정 작업 이력 (2026-06-02)

1. `220.121.225.76` → `59.9.19.188` 일괄 교체
   - 위키 10개 파일 (apply-outbound-fix.bat, README-APPLY.md 등)
   - `frontend/dist/index.js` allowedHosts 배열
   - 메모리, start_all.sh 안내문
2. `GOOGLE_SHEETS_API_KEY=*** (placeholder) → 삭제 (마스터 .env 8번 라인)
   - 사용자: "이거에 대해 아는게 없어" → 정직하게 삭제
   - read-only CSV fetch는 정상 동작, refresh API만 500 반환 (의도된 동작)
3. 메모리 5번 줄 갱신: 옛 "read-only" + "복사 후 실행" → "rw 마운트" + "마스터 직접 실행 + Linux는 VF-project 복사본"
4. `start_all.sh`, `stop_all.sh` 마스터에도 복사 (이전엔 VF-project에만 있었음)

## 동시 실행 금지 (CRITICAL)

- **Windows와 Linux가 동시에 VF 실행** → SQLite 락 충돌, 데이터 손상
- **확인법**: 한쪽 종료 후 다른 쪽 시작
- **마스터의 db.sqlite3**는 Windows/Linux 둘 다 같은 파일 공유 (NTFS)
  - 한쪽이 쓰는 중 다른 쪽이 읽으면 락

## 검증 체크리스트

- [ ] 마스터 `backend/.venv` = Windows venv (Scripts/ 존재, bin/ 없음)
- [ ] 마스터 `frontend/client/node_modules/@esbuild/` = `win32-x64`만
- [ ] VF-project `backend/.venv` = Linux venv (bin/ 존재, Scripts/ 없음)
- [ ] VF-project `frontend/client/node_modules/@esbuild/` = `linux-x64`만
- [ ] 포트 5174, 5176 둘 다 한쪽만 점유
- [ ] `hostname -I` = `59.9.19.188`
- [ ] `curl -m 5 https://ifconfig.me` = `59.9.19.188` (동일)
- [ ] 메모리 5번 줄에 "VF-new - 복사본은 마스터..." 명시

## 관련 페이지

- `Wiki/index.md` — 위키 메인
- `Wiki/log.md` — 변경 이력
- `01-VF-프로젝트/세션로그/2026-04-11_포트변경-로그인플로우.md` — 포트 8000→5176 변경 (옛)
- `01-VF-프로젝트/메모리/시스템/MEMORY.md` — VF 메모리

## 변경 이력

| 일자 | 내용 |
|:---:|:-----|
| 2026-06-02 23:15 | 최초 작성 — 2026-06-02 VF 실행 워크플로우 확정, 마스터/VF-project 분리, IP/venv/esbuild 정정 작업 기록 |
| 2026-06-02 23:17 | 옵션 2 (symlink) 적용, db.sqlite3/inventory_unified.json → 마스터 단일 소스, start_all.sh 자동화 |
