# 프로젝트 설치 및 실행 가이드 (Deployment Setup)

이 프로젝트를 다른 컴퓨터에서 실행할 때 필요한 환경 설정 및 실행 절차입니다.
보안을 위해 `.env` 파일은 Git 저장소에 포함되지 않으므로, 아래 절차에 따라 직접 생성해야 합니다.

## 1. 사전 요구사항 (Prerequisites)
- Node.js (v18 이상 권장)
- Python (v3.10 이상 권장)
- Git

## 2. 프로젝트 클론 (Clone)

```bash
git clone https://github.com/comage9/VF-.git
cd VF-new  # 또는 클론된 디렉토리명
```

## 3. 환경 변수 설정 (Environment Variables)

프로젝트 루트, 프론트엔드, 백엔드 각각에 `.env` 파일이 필요할 수 있습니다.

### 3-1. 백엔드 설정 (`backend/.env`)

`backend` 폴더로 이동하여 `.env` 파일을 생성합니다.
**.env.example** 파일을 복사하여 생성할 수 있습니다.

```bash
cd backend
cp .env.example .env
```

**필수 수정 항목 (`.env`):**
아래 URL들은 프로젝트의 핵심 데이터 소스입니다. 실행을 위해 반드시 설정해야 합니다.

```ini
# ============================================
# 구글 시트 (FC 입고 데이터)
# ============================================
# Google Sheets API Key (선택사항, API 사용 시 필요)
GOOGLE_SHEETS_API_KEY=your_api_key_here

# FC 입고 데이터 CSV URL
FC_GOOGLE_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=810884704&single=true&output=csv

# ============================================
# 마스터 데이터 (카테고리 정보)
# ============================================
MASTER_DATA_CSV_URL=https://docs.google.com/spreadsheets/d/e/2PACX-1vRPjO9qxLlACh8vfMLlrSoRZlVMtkuuKLxd7HH-XAZFW-f9QGrSsdckK5p_pmHDss4CVgLbZDqQjgFh/pub?gid=1777152272&single=true&output=csv

# ============================================
# 출고 데이터 (Outbound Data)
# ============================================
OUTBOUND_GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=810884704&single=true&output=csv

# ============================================
# AI 설정 (Ollama 권장)
# ============================================
AI_BACKEND=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=lfm2.5-thinking:latest
```

> **참고**: 위 URL들은 이 프로젝트에서 사용하는 기본 데이터 소스입니다. 만약 본인의 데이터를 사용하려면 구글 시트에서 `파일 > 공유 > 웹에 게시 > CSV`를 선택하여 링크를 생성하고 교체하세요.

### 3-2. 프론트엔드 설정 (`frontend/.env`)

`frontend` 폴더로 이동하여 `.env` 파일을 생성합니다.

```bash
cd ../frontend  # backend 폴더에서 상위로 이동 후 frontend로
# .env 파일 생성
```

**`frontend/.env` 내용:**

```ini
# Vite 개발 서버 포트
PORT=5174

# API 프록시 대상 (백엔드 서버 주소)
# 로컬 개발 시 백엔드가 5176 포트에서 실행된다면:
DJANGO_BASE_URL=http://localhost:5176
```

## 4. 실행 (Running)

터미널을 2개 열어서 백엔드와 프론트엔드를 각각 실행합니다.

### 터미널 1: 백엔드 (Django)

```bash
cd backend

# 가상환경 생성 (최초 1회)
python -m venv venv
source venv/bin/activate
97: # Windows (Command Prompt/PowerShell):
98: # venv\Scripts\activate

# 패키지 설치
pip install -r requirements.txt

# 마이그레이션 (DB 초기화)
python manage.py migrate

# 서버 실행 (5176 포트 사용)
python manage.py runserver 0.0.0.0:5176
```

### 터미널 2: 프론트엔드 (Vite)

```bash
cd frontend

# 패키지 설치
npm install

# 개발 서버 실행
npm run dev
```

## 5. 문제 해결 (Troubleshooting)

**Q: 데이터가 보이지 않아요.**
A: 구글 시트 CSV URL이 `.env` 파일에 정확히 입력되었는지 확인하세요. URL이 변경되었거나 만료되었을 수 있습니다. 브라우저에서 해당 URL을 열었을 때 CSV 파일이 다운로드되는지 확인해 보세요.

**Q: AI 챗봇이 "연결 실패"라고 떠요.**
A:
1. `backend/config/settings.py`에서 `AI_BACKEND` 환경변수가 허용되어 있는지 확인하세요 (최신 코드에서는 수정됨).
2. 로컬에서 Ollama가 실행 중인지 확인하세요 (`ollama serve`).
3. 백엔드 서버 로그에 에러 메시지가 있는지 확인하세요.

**Q: 윈도우에서 CSV 데이터가 보이지 않아요 (인코딩 문제).**
133: A: 최신 버전(2026-02-13 업데이트)에서 윈도우 엑셀 저장 시 발생하는 BOM(`\ufeff`) 및 인코딩 문제를 수정했습니다.
134: `git pull origin main`으로 최신 코드를 내려받은 후 서버를 재시작해 보세요.
135:
136: **Q: 포트가 이미 사용 중이에요.**
A: 기존에 실행 중인 노드나 파이썬 프로세스를 종료하거나, `.env` 및 실행 명령어에서 포트 번호를 변경하세요.
