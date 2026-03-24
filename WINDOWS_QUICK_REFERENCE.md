# Windows 환경 빠른 참조 (Quick Reference)

> VF Analytics Dashboard 프로젝트의 Windows 환경에서 자주 사용하는 명령어와 설정

## 서버 시작

### Django Backend (PowerShell)
```powershell
cd backend
.venv\Scripts\activate
python manage.py runserver 0.0.0.0:5176
```

### Frontend (PowerShell)
```powershell
cd frontend
$env:SERVER_HOST="0.0.0.0"
npx tsx server/index.ts
```

### Git Bash에서 실행
```bash
# Backend
cd backend
source .venv/Scripts/activate
python manage.py runserver 0.0.0.0:5176

# Frontend (다른 터미널)
cd frontend
SERVER_HOST=0.0.0.0 npx tsx server/index.ts
```

## 포트/프로세스 관리

### 포트 사용 확인
```powershell
netstat -ano | findstr :5174   # Frontend
netstat -ano | findstr :5176   # Backend
```

### 포트로 프로세스 찾기
```powershell
netstat -ano | findstr :5174
# 출력된 마지막 숫자가 PID
```

### 프로세스 종료
```powershell
taskkill /PID [PID] /F
```

### 모든 포트 포함 확인
```powershell
netstat -ano | findstr "LISTENING"
```

## Git 명령어

```powershell
# 상태 확인
git status

# 최신 변경사항 가져오기
git pull

# 변경사항 스테이징
git add .

# 커밋
git commit -m "message"

# 푸시
git push

# 변경사항 무시
git restore [파일명]
```

## 가상 환경 관리

### 가상 환경 생성
```powershell
cd backend
python -m venv .venv
```

### 가상 환경 활성화
```powershell
# PowerShell
.venv\Scripts\activate

# Git Bash
source .venv/Scripts/activate
```

### 가상 환경 비활성화
```powershell
deactivate
```

### 의존성 설치
```bash
pip install -r requirements.txt
```

## Django 관리

```bash
# 마이그레이션
python manage.py migrate

# 슈퍼유저 생성
python manage.py createsuperuser

# 정적 파일 수집
python manage.py collectstatic

# 개발 서버 시작
python manage.py runserver 0.0.0.0:5176
```

## 환경 변수 설정

### PowerShell
```powershell
$env:NODE_ENV="development"
$env:SERVER_HOST="0.0.0.0"
```

### .env 파일 형식
```env
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0
DJANGO_BASE_URL=http://localhost:5176
```

## 네트워크 관련

### IP 주소 확인
```powershell
ipconfig | findstr "IPv4"
```

### 방화벽 규칙 추가
```powershell
# Frontend 포트
netsh advfirewall firewall add rule name="VF Frontend" dir=in action=allow protocol=TCP localport=5174

# Backend 포트
netsh advfirewall firewall add rule name="VF Backend" dir=in action=allow protocol=TCP localport=5176
```

### 방화벽 규칙 삭제
```powershell
netsh advfirewall firewall delete rule name="VF Frontend"
netsh advfirewall firewall delete rule name="VF Backend"
```

## 파일 검색

### 파일 찾기
```powershell
Get-ChildItem -Recurse -Filter "*.py"    # 모든 Python 파일
Get-ChildItem -Recurse -Filter "settings.py"  # 특정 파일
```

### 내용 검색
```powershell
Select-String -Path "*.py" -Pattern "def view"  # Python 파일에서 검색
```

## 디렉토리 이동

```powershell
# 루트로 이동
cd E:\coding\VF-new

# 백엔드로 이동
cd backend

# 이전 디렉토리
cd ..

# 홈 디렉토리
cd ~
```

## 로그 확인

### 로그 파일 위치
- Django: 터미널 출력
- Frontend: 터미널 출력
- API 요청: 터미널에서 실시간 확인

## 일반적인 오류 및 해결

### ModuleNotFoundError
```powershell
# 가상 환경 활성화 확인
cd backend
.venv\Scripts\activate
```

### PermissionError
```powershell
# 관리자 권한으로 PowerShell 실행
```

### Port already in use
```powershell
# 포트 확인 및 종료
netstat -ano | findstr :5174
taskkill /PID [PID] /F
```

## 자주 사용하는 포트

| 서비스 | 포트 | 설명 |
|--------|------|------|
| Frontend | 5174 | 사용자 인터페이스 |
| Backend API | 5176 | Django API |

---

**빠른 접근:**
- 전체 가이드: `WINDOWS_SETUP_GUIDE.md`
- 프로젝트: `CLAUDE.md`
- 메인 README: `README.md`
