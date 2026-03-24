# VF Analytics Dashboard - Windows 환경 프로젝트 요약

> Ubuntu로 작성된 프로젝트를 Windows 환경에서 실행하기 위한 전체 설정 및 관리 문서

## 📋 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 프로젝트명 | VF Analytics Dashboard |
| 개발 환경 | Ubuntu |
| 실행 환경 | Windows 11 |
| 아키텍처 | Django + React + Node.js |
| 데이터베이스 | SQLite |

---

## 🚀 빠른 시작

### 배치 파일 사용 (가장 쉬운 방법)

```
start_all.bat        - 모든 서버 시작
start_backend.bat    - Django 백엔드만 시작
start_frontend.bat   - 프론트엔드만 시작
stop_servers.bat     - 모든 서버 중지
```

### 수동 시작

**백엔드 (PowerShell):**
```powershell
cd backend
.venv\Scripts\activate
python manage.py runserver 0.0.0.0:5176
```

**프론트엔드 (PowerShell):**
```powershell
cd frontend
$env:SERVER_HOST="0.0.0.0"
npx tsx server/index.ts
```

---

## 📁 프로젝트 파일 구조

### 문서 파일

| 파일 | 설명 |
|------|------|
| `README.md` | 프로젝트 메인 문서 |
| `CLAUDE.md` | Claude Code용 프로젝트 지침 |
| `WINDOWS_SETUP_GUIDE.md` | Windows 환경 전체 설정 가이드 |
| `WINDOWS_QUICK_REFERENCE.md` | Windows 명령어 빠른 참조 |
| `WINDOWS_PROJECT_SUMMARY.md` | 이 문서 |

### 실행 파일

| 파일 | 설명 |
|------|------|
| `start_all.bat` | 모든 서버 시작 |
| `start_backend.bat` | Django 백엔드 시작 |
| `start_frontend.bat` | 프론트엔드 시작 |
| `stop_servers.bat` | 모든 서버 중지 |

---

## 🔧 Windows vs Ubuntu 주요 차이점

### 가상 환경 활성화

| Ubuntu | Windows (PowerShell) | Windows (Git Bash) |
|--------|---------------------|-------------------|
| `source .venv/bin/activate` | `.venv\Scripts\activate` | `source .venv/Scripts/activate` |

### 환경 변수 설정

| Ubuntu | Windows (PowerShell) |
|--------|---------------------|
| `NODE_ENV=development npm run dev` | `$env:NODE_ENV="development"` |

### 경로 구분자

| Ubuntu | Windows |
|--------|---------|
| `/` | `\` (Git Bash에서 `/` 사용 가능) |

---

## 🌐 네트워크 설정

### 포트 구성

| 서비스 | 포트 | 접속 방법 |
|--------|------|-----------|
| Frontend | 5174 | `0.0.0.0:5174` |
| Backend | 5176 | `0.0.0.0:5176` |

### 외부 접속

1. **IP 주소 확인:**
   ```powershell
   ipconfig | findstr "IPv4"
   ```

2. **방화벽 규칙 추가:**
   ```powershell
   netsh advfirewall firewall add rule name="VF Frontend" dir=in action=allow protocol=TCP localport=5174
   netsh advfirewall firewall add rule name="VF Backend" dir=in action=allow protocol=TCP localport=5176
   ```

3. **접속 URL:**
   - 로컬: `http://localhost:5174`
   - 외부: `http://[IP주소]:5174`

---

## 🛠️ 일반적인 문제 해결

### 1. ModuleNotFoundError: No module named 'django'

**원인:** 가상 환경 활성화되지 않음

**해결:**
```powershell
cd backend
.venv\Scripts\activate
```

### 2. 'NODE_ENV'은(는) 내부 또는 외부 명령이 아닙니다

**원인:** Windows에서 환경 변수 설정 문법 오류

**해결:**
```powershell
# PowerShell
$env:NODE_ENV="development"

# 또는 배치 파일 사용
start_frontend.bat
```

### 3. 포트가 이미 사용 중

**해결:**
```powershell
# 포트 확인
netstat -ano | findstr :5174

# 프로세스 종료
taskkill /PID [PID] /F

# 또는
stop_servers.bat
```

### 4. git에서 pull 할 때 충돌

**해결:**
```powershell
# 변경사항 저장
git stash

# 최신 가져오기
git pull

# 변경사항 복원
git stash pop
```

---

## 📝 Git 워크플로우

```powershell
# 1. 상태 확인
git status

# 2. 최신 변경사항 가져오기
git pull

# 3. 변경사항 확인
git diff

# 4. 변경사항 스테이징
git add .

# 5. 커밋
git commit -m "메시지"

# 6. 푸시
git push
```

---

## 🔍 유용한 명령어

### 시스템 확인

```powershell
# Python 버전
python --version

# Node.js 버전
node --version

# Git 버전
git --version
```

### 서버 관리

```powershell
# 포트 사용 확인
netstat -ano | findstr :5174

# 프로세스 확인
tasklist | findstr python
tasklist | findstr node

# 로그 확인
# 각 서버 터미널에서 실시간 확인
```

### 파일 검색

```powershell
# 파일 찾기
Get-ChildItem -Recurse -Filter "*.py"

# 내용 검색
Select-String -Path "*.py" -Pattern "def view"
```

---

## 📊 현재 서버 상태

```
✅ Django Backend (5176) - 0.0.0.0:5176 대기 중
✅ Frontend (5174) - 0.0.0.0:5174 대기 중
✅ 외부 접속 허용됨
```

---

## 🎯 다음 단계

1. **자주 묻는 질문:** `WINDOWS_SETUP_GUIDE.md` 참조
2. **빠른 명령어:** `WINDOWS_QUICK_REFERENCE.md` 참조
3. **프로젝트 구조:** `PROJECT_DESCRIPTION.md` 참조
4. **코드 작성:** `CLAUDE.md` 참조

---

## 📞 지원

- 문제 발생 시: `WINDOWS_SETUP_GUIDE.md`의 문제 해결 섹션 확인
- 버그 보고: GitHub Issues 사용
- 기여 요청: Pull Request 제출

---

**마지막 업데이트:** 2026-02-14
**프로젝트 관리:** Claude Code
**환경:** Windows 11
