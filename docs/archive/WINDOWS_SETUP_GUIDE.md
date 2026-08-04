# VF Analytics Dashboard - Windows 환경 실행 가이드

> 이 프로젝트는 Ubuntu에서 개발되었으나 Windows 환경에서 실행할 때 필요한 수정 사항과 설정을 정리했습니다.

## 목차

1. [시스템 요구사항](#시스템-요구사항)
2. [초기 설정](#초기-설정)
3. [Windows vs Ubuntu 차이점](#windows-vs-ubuntu-차이점)
4. [서버 시작 방법](#서버-시작-방법)
5. [외부 접속 설정](#외부-접속-설정)
6. [일반적인 문제 해결](#일반적인-문제-해결)
7. [프로젝트 구조](#프로젝트-구조)

---

## 시스템 요구사항

### 필수 소프트웨어

| 소프트웨어 | 버전 | 설치 확인 명령 |
|-----------|------|--------------|
| Python | 3.10+ | `python --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | 최신 | `git --version` |

### 권장 도구
- **Git Bash** - Linux 명령어 호환성 제공
- **Visual Studio Code** - 프로젝트 개발용
- **PowerShell 7** - 향상된 명령줄 환경

---

## 초기 설정

### 1. Git 저장소 복제

```bash
git clone https://github.com/your-repo/VF-new.git
cd VF-new
```

### 2. 가상 환경 설정 (Backend)

**Windows PowerShell:**
```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
```

**Git Bash:**
```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
python manage.py migrate
```

### 3. 프론트엔드 의존성 설치

```bash
cd frontend
npm install
cd ..
```

### 4. 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 추가:

```env
# Django Settings
SECRET_KEY=django-insecure-change-me-in-production
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0

# Google Sheets CSV Export URL
OUTBOUND_GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=810884704&single=true&output=csv

# Django Base URL
DJANGO_BASE_URL=http://localhost:5176
```

---

## Windows vs Ubuntu 차이점

### 1. 가상 환경 활성화

| Ubuntu | Windows (PowerShell) | Windows (Git Bash) |
|--------|---------------------|-------------------|
| `source .venv/bin/activate` | `.venv\Scripts\activate` | `source .venv/Scripts/activate` |

### 2. 경로 구분자

| Ubuntu | Windows |
|--------|---------|
| `/` (forward slash) | `\` (backward slash) |
| `/path/to/file` | `C:\path\to\file` |
| Git Bash에서 `/` 사용 가능 | PowerShell에서 `\` 사용 |

### 3. 환경 변수 설정

**Ubuntu/Linux:**
```bash
NODE_ENV=development npm run dev
SERVER_HOST=0.0.0.0 npm run dev
```

**Windows (작동하지 않음):**
```cmd
NODE_ENV=development npm run dev  # ❌ 오류 발생
```

**Windows (PowerShell):**
```powershell
$env:NODE_ENV="development"
npm run dev
```

**Windows (Git Bash/WSL):**
```bash
NODE_ENV=development npm run dev  # ✅ 작동
```

**Windows (cmd - 일시적 설정):**
```cmd
set NODE_ENV=development
npm run dev
```

### 4. 쉘 명령어

| Ubuntu | Windows (PowerShell) | Windows (cmd) |
|--------|---------------------|---------------|
| `ls` | `ls` (별칭) / `Get-ChildItem` | `dir` |
| `rm` | `Remove-Item` / `rm` (별칭) | `del` |
| `cp` | `Copy-Item` / `cp` (별칭) | `copy` |
| `mv` | `Move-Item` / `mv` (별칭) | `move` |
| `grep` | `Select-String` / `grep` (별칭) | `findstr` |

### 5. 프로세스 관리

| 작업 | Ubuntu | Windows |
|------|--------|---------|
| 실행 중인 프로세스 확인 | `ps aux \| grep python` | `tasklist \| findstr python` |
| 포트 사용 확인 | `lsof -i :5174` | `netstat -ano \| findstr :5174` |
| 프로세스 종료 | `kill <pid>` | `taskkill /PID <pid> /F` |

---

## 서버 시작 방법

### 옵션 1: 개별 터미널 사용 (권장)

#### 터미널 1 - Django Backend

**PowerShell:**
```powershell
cd backend
.venv\Scripts\activate
python manage.py runserver 0.0.0.0:5176
```

**Git Bash:**
```bash
cd backend
source .venv/Scripts/activate
python manage.py runserver 0.0.0.0:5176
```

#### 터미널 2 - Frontend

**PowerShell:**
```powershell
cd frontend
$env:SERVER_HOST="0.0.0.0"
npx tsx server/index.ts
```

**Git Bash:**
```bash
cd frontend
SERVER_HOST=0.0.0.0 npx tsx server/index.ts
```

### 옵션 2: 배치 파일 사용

프로젝트 루트에 다음 배치 파일들을 생성:

**start_backend.bat:**
```batch
@echo off
cd backend
call .venv\Scripts\activate
python manage.py runserver 0.0.0.0:5176
```

**start_frontend.bat:**
```batch
@echo off
cd frontend
set SERVER_HOST=0.0.0.0
npx tsx server/index.ts
```

사용법: 배치 파일 더블 클릭

---

## 외부 접속 설정

### 현재 포트 구성

| 서비스 | 포트 | 외부 접속 | 설명 |
|--------|------|-----------|------|
| Frontend | 5174 | 0.0.0.0 | 사용자 인터페이스 |
| Django API | 5176 | 0.0.0.0 | 백엔드 API |

### IP 주소 확인

```powershell
# IPv4 주소 확인
ipconfig | findstr "IPv4"
```

### 방화벽 설정

```powershell
# 포트 5174 허용
netsh advfirewall firewall add rule name="VF Frontend" dir=in action=allow protocol=TCP localport=5174

# 포트 5176 허용
netsh advfirewall firewall add rule name="VF Backend" dir=in action=allow protocol=TCP localport=5176
```

### 접속 URL

- **로컬:** `http://localhost:5174`
- **네트워크:** `http://[IP주소]:5174` (예: `http://59.9.19.188:5174`)

---

## 일반적인 문제 해결

### 1. ModuleNotFoundError: No module named 'django'

**원인:** 가상 환경이 활성화되지 않음

**해결:**
```powershell
# PowerShell
cd backend
.venv\Scripts\activate

# 또는 Git Bash
cd backend
source .venv/Scripts/activate
```

### 2. 'NODE_ENV'은(는) 내부 또는 외부 명령이 아닙니다

**원인:** Windows에서 환경 변수 설정 문법 오류

**해결:**
```powershell
# PowerShell
$env:NODE_ENV="development"

# 또는 직접 실행 (환경 변수 필요 없음)
npx tsx server/index.ts
```

### 3. 포트가 이미 사용 중

**원인:** 이전 서버가 완전히 종료되지 않음

**해결:**
```powershell
# 사용 중인 프로세스 확인
netstat -ano | findstr :5174
netstat -ano | findstr :5176

# PID로 프로세스 종료
taskkill /PID [PID] /F
```

### 4. ENOENT: no such file or directory

**원인:** 잘못된 디렉토리에서 명령 실행

**해결:**
```bash
# frontend 디렉토리에서 실행 확인
cd frontend
npm run dev
```

### 5. 데이터베이스 마이그레이션 오류

**해결:**
```bash
cd backend
source .venv/Scripts/activate  # 또는 .venv\Scripts\activate
python manage.py migrate
python manage.py createsuperuser  # 관리자 계정 필요 시
```

### 6. Django ALLOWED_HOSTS 오류

**해결:** `.env` 파일에 호스트 추가
```env
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,59.9.19.188
```

---

## 프로젝트 구조

```
VF-new/
├── backend/                      # Django 백엔드
│   ├── sales_api/                # 메인 앱
│   │   ├── models.py            # DB 모델
│   │   ├── views.py             # API 뷰
│   │   ├── urls.py             # URL 라우팅
│   │   └── serializers.py      # DRF 시리얼라이저
│   ├── config/                  # Django 설정
│   │   └── settings.py         # 메인 설정
│   ├── manage.py                # Django 관리
│   ├── .venv/                   # Python 가상 환경
│   └── db.sqlite3              # SQLite DB (git 제외)
├── frontend/                    # React + Node.js
│   ├── client/                 # React 앱
│   │   └── src/              # 소스 코드
│   ├── server/                # Node.js 프록시 서버
│   │   ├── index.ts           # 서버 진입점
│   │   └── routes.ts          # API 라우팅
│   └── package.json           # Node 의존성
├── .env                       # 환경 변수 (git 제외)
├── .gitignore                # Git 제외 파일
├── README.md                 # 프로젝트 설명
├── WINDOWS_SETUP_GUIDE.md    # 이 문서
└── CLAUDE.md                # Claude Code용 지침
```

---

## 개발자 참고사항

### 코드 작성 시 주의사항

1. **경로 처리:** 항상 `path.join()` 또는 `os.path.join()` 사용
   ```python
   # 좋은 예
   from pathlib import Path
   data_dir = Path(__file__).parent / 'data'

   # 나쁜 예
   data_dir = './data'  # Windows에서 문제 발생 가능
   ```

2. **줄바꿈:** Unix (`\n`) 사용 권장
   ```python
   # 좋은 예
   with open('file.txt', 'w', newline='\n') as f:
       f.write('line1\nline2')
   ```

3. **파일 모드:** 텍스트 파일에 항상 인코딩 지정
   ```python
   # 좋은 예
   with open('file.txt', 'r', encoding='utf-8') as f:
       content = f.read()
   ```

### Git 워크플로우

```bash
# 1. 변경사항 확인
git status

# 2. 변경사항 스테이징
git add .

# 3. 커밋
git commit -m "message"

# 4. 푸시
git push
```

### 배포 준비

1. `DEBUG=False` 설정
2. ALLOWED_HOSTS 업데이트
3. SECRET_KEY 변경
4. 정적 파일 수집: `python manage.py collectstatic`

---

## 참고 링크

- [Django 공식 문서](https://docs.djangoproject.com/)
- [React 공식 문서](https://react.dev/)
- [Node.js 문서](https://nodejs.org/docs/)
- [Windows Python 설치](https://docs.python.org/3/using/windows.html)

---

**마지막 업데이트:** 2026-02-14
**관리자:** Claude Code (Project Management)
