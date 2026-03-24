# VF Analytics Dashboard - 리뉴얼 버전

이 프로젝트는 VF의 판매 및 재고 데이터를 시각화하고 분석하기 위한 대시보드 애플리케이션입니다. Django 백엔드와 React 프론트엔드로 구성되어 있습니다.

## 아키텍처

```
Browser → Node.js (5174) → Django API (5176) → SQLite DB
         ↳ Static Files    ↳ Data Processing
```

- **프론트엔드:** React + Vite
- **백엔드:** Django 6.0 + Django REST Framework
- **데이터베이스:** SQLite
- **서버:** Node.js (정적 파일 서빙 및 Django API 프록시)

## 주요 개선 사항

- **성능:** 대용량 데이터 처리를 위한 Django 백엔드 도입
- **안정성:** 프론트엔드 `RangeError: Invalid time value` 오류 해결
- **최적화:** 차트 렌더링 최적화 (다운샘플링)

## 다른 컴퓨터에서 실행 방법

### Windows 사용자 (권장)

> 이 프로젝트는 Ubuntu에서 개발되었으나 Windows 환경도 완전히 지원합니다.

**빠른 시작:**

1. 배치 파일을 사용하여 서버 시작:
   - `start_all.bat` - 모든 서버 시작 (권장)
   - `start_backend.bat` - Django 백엔드만 시작
   - `start_frontend.bat` - 프론트엔드만 시작
   - `stop_servers.bat` - 모든 서버 중지

2. 자세한 Windows 설정 가이드:
   - `WINDOWS_SETUP_GUIDE.md` - 전체 설정 가이드
   - `WINDOWS_QUICK_REFERENCE.md` - 빠른 명령어 참조

**수동 설정:**

### 1. 프로젝트 클론

```bash
git clone https://github.com/comage9/VF-.git
cd "VF 출고 대시보드"
```

### 2. 환경변수 설정 (.env.local 생성)

프로젝트는 `.env.example` 파일들을 제공합니다. 이를 복사하여 `.env.local`을 만듭니다.

```bash
# 방법 A: .env.example을 복사
cp backend/.env.example backend/.env.local
cp frontend/.env.example frontend/.env.local

# 방법 B: (Linux/Mac) 한 줄로 복사
cat backend/.env.example > backend/.env.local
cat frontend/.env.example > frontend/.env.local

# 방법 C: (Windows) 한 줄로 복사
copy backend\.env.example + backend\.env.local
copy frontend\.env.example + frontend\.env.local
```

**중요:** `.env.local` 파일은 수동으로 생성해야 합니다 (자동 생성되지 않음).

**백엔드/.env.local 내용:**
- `FC_GOOGLE_SHEET_CSV_URL` - FC 입고 데이터 구글 시트 URL
- `MASTER_DATA_CSV_URL` - 마스터 데이터(카테고리) 구글 시트 URL

**프론트엔드/.env.local 내용:**
- `DJANGO_BASE_URL` - Django 백엔드 URL (기본값: http://localhost:5176)
- `SERVER_HOST` - 서버 호스트 (외부 접속: 0.0.0.0, 로컬만: localhost)
- `PORT` - 서버 포트 (기본값: 5174)

**참고:** `.env.local` 파일은 깃에 올라가지 않습니다 (`.gitignore`로 제외). 민감한 토큰 등은 `.env.local`에 직접 입력하세요.

### 3. 의존성 설치

**백엔드:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# 또
.venv\Scripts\activate     # Windows

pip install -r requirements.txt
```

**프론트엔드:**
```bash
cd frontend
npm install
```

### 4. 데이터베이스 마이그레이션

```bash
cd backend
source .venv/bin/activate
python manage.py migrate
```

### 5. 서버 실행

**Windows - 배치 파일 사용 (권장):**
- 더블 클릭으로 `start_all.bat` 실행
- 각 서버가 별도 창에서 실행됩니다

**Windows - 수동 실행:**
```powershell
# 백엔드 (PowerShell)
cd backend
.venv\Scripts\activate
python manage.py runserver 0.0.0.0:5176

# 프론트엔드 (다른 PowerShell 창)
cd frontend
$env:SERVER_HOST="0.0.0.0"
npx tsx server/index.ts
```

**Linux/Mac:**
```bash
# 백엔드 (포트 5176)
cd backend
source .venv/bin/activate
python manage.py runserver 0.0.0.0:5176

# 프론트엔드 (포트 5174)
cd frontend
# 로컬에서만 접속
npm run dev

# 외부에서 접속 허용
SERVER_HOST=0.0.0.0 PORT=5174 npm run dev
```

### 6. 접속

- **로컬:** http://localhost:5174/sales/outbound
- **외부:** http://<서버IP>:5174/sales/outbound

## 환경변수 (선택사항)

| 변수 | 설명 | 기본값 |
|------|------|------|
| `DJANGO_BASE_URL` | 프론트/프록시가 API를 프록시할 Django 주소 | `http://localhost:5176` |
| `SERVER_HOST` | 서버 호스트 (외부 접속용) | `0.0.0.0` |
| `PORT` | 프론트엔드 서버 포트 | `5174` |
| `OUTBOUND_GOOGLE_SHEET_URL` | VF 출고 데이터 Google Sheets URL | - |
| `GOOGLE_SHEETS_API_KEY` | Google Sheets API 키 | - |

## 구글 시트 정보

### VF 출고
- **시트 ID:** 2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6
- **데이터 시트(GID):** 1152588885
- **URL:** https://docs.google.com/spreadsheets/d/e/[시트ID]/pub?gid=1152588885&single=true&output=csv

### FC 입고
- **시트 ID:** 2PACX-1vQwqI0BG-d2aMrql7DK4fQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6
- **데이터 시트(GID):** 810884704
- **마스터 시트(GID):** 1777152272
- **URL:** https://docs.google.com/spreadsheets/d/e/[시트ID]/pub?gid=810884704&single=true&output=csv

## 주요 API 엔드포인트

| 엔드포인트 | 설명 |
|---------|------|
| `GET /api/outbound` | VF 출고 레코드 |
| `GET /api/outbound/stats` | VF 출고 통계 |
| `GET /api/outbound/top-products` | VF 출고 인기 제품 |
| `GET /api/inventory/unified` | 통합 재고 |
| `GET /api/production` | 생산 계획 |
| `GET /api/fc-inbound` | FC 입고 레코드 |
| `GET /api/fc-inbound/stats` | FC 입고 통계 |
| `POST /api/fc-inbound/sync-from-sheet` | FC 입고 동기화 |

## GitHub 업로드/수정 반영 방법

이 프로젝트는 GitHub 저장소(`https://github.com/comage9/VF-.git`)에 업로드합니다.

```bash
# 변경사항 추가
git add .

# 커밋
git commit -m "설명"

# 푸시
git push
```

## 기여 방법

프로젝트에 기여하실 때는 [CONTRIBUTING.md](CONTRIBUTING.md)을 참고해 주세요.

## 보안 원칙

- `.env`, `.env.local` 등 토큰/키가 들어간 파일은 GitHub에 올리지 않습니다 (`.gitignore`로 제외)
- 샘플 데이터(`sample/`) 및 레거시 자료(`legacy/`)는 기본 업로드 대상에서 제외합니다

---

자세한 내용은 `PROJECT_DESCRIPTION.md` 파일을 참조하십시오.
