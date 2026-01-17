# VF Analytics Dashboard - 리뉴얼 버전

이 프로젝트는 VF의 판매 및 재고 데이터를 시각화하고 분석하기 위한 대시보드 애플리케이션의 리뉴얼 버전입니다. 기존 시스템의 성능 문제와 오류를 개선하고, 안정적이며 확장 가능한 구조로 재구축되었습니다.

## 아키텍처

*   **프론트엔드:** React (Vite)
*   **백엔드:** Django 6.0, Django REST Framework (SQLite)
*   **서버:** Node.js (정적 파일 서빙 및 Django API 프록시)

## 주요 개선 사항

*   **성능:** 대용량 데이터 처리를 위한 Django 백엔드 도입 및 서버사이드 데이터 집계.
*   **안정성:** 프론트엔드 `RangeError: Invalid time value` 오류 해결 및 데이터 유효성 검사 강화.
*   **최적화:** 프론트엔드 차트 렌더링 최적화 (다운샘플링, 불필요한 요소 제거).

## 실행 방법

### 백엔드 (Django)

1.  `backend` 디렉토리에서 가상환경을 준비/사용합니다.
    - 이미 생성된 가상환경이 있으면 `backend/.venv/bin/python` 을 사용하세요.
2.  (최초 1회) 의존성 설치
    - `backend/.venv/bin/pip install -r requirements.txt`
3.  (최초 1회) DB 마이그레이션
    - `backend/.venv/bin/python manage.py migrate`
4.  Django 서버 실행 (포트: 5176)
    - `backend/.venv/bin/python manage.py runserver 0.0.0.0:5176`

### 프론트엔드 (React)

1.  `frontend` 디렉토리로 이동.
2.  (최초 1회) `npm install`
3.  개발 서버 실행 (포트: 5174)
    - 로컬에서만 접속(기본값)
      - `npm run dev`
    - 외부 접속 허용(권장: 같은 네트워크/다른 PC/모바일에서 접속)
      - `SERVER_HOST=0.0.0.0 PORT=5174 npm run dev`
    - Node(5174)가 프론트 화면을 서빙하고, `/api/*` 요청을 Django(5176)로 프록시합니다.
    - 기본 프록시 대상은 `DJANGO_BASE_URL` 환경변수(기본값 `http://localhost:5176`)입니다.

### 접속 URL

- `http://localhost:5174/sales/outbound`

#### 외부 접속(다른 PC/모바일)

1.  위 실행 방법대로 백엔드(5176) + 프론트(5174)를 실행합니다.
2.  외부(같은 네트워크)에서 아래 URL로 접속합니다.
    - `http://<서버IP>:5174`
    - 예: `http://192.168.0.10:5174/sales/outbound`
3.  방화벽/공유기 설정에서 `5174/tcp` 포트가 외부에서 접근 가능해야 합니다.
    - API는 프론트(5174)가 Django(5176)로 프록시하므로, 보통 외부에서는 `5176`을 직접 열 필요가 없습니다.

### Node.js 프록시 서버

1.  프로젝트 루트 디렉토리로 이동.
2.  `node server.js` 명령으로 Node.js 서버 실행. (프론트엔드 정적 파일 서빙 및 Django API 프록시 역할)

## 환경변수 (선택)

- `DJANGO_BASE_URL`
  - 프론트/프록시(5174)가 API를 프록시할 Django 주소
  - 기본값: `http://localhost:5176`
- `OUTBOUND_GOOGLE_SHEET_URL`
  - `/api/outbound/sync` 가 CSV를 읽어 DB에 동기화할 때 사용할 Google Sheets CSV export URL
  - 설정하지 않으면, UI의 데이터 소스 연결(`/api/google-sheets/connect`)을 통해 연결해야 합니다.
- `GOOGLE_SHEETS_API_KEY` (또는 `GOOGLE_API_KEY`)
  - `/api/google-sheets/connect`, `/api/google-sheets/refresh/<id>` 사용 시 필요

## GitHub 업로드/수정 반영 방법 (HTTPS 권장)

이 프로젝트는 GitHub 저장소(`https://github.com/comage9/VF-.git`)에 HTTPS로 업로드합니다.

### 보안 원칙

- `env`, `.env` 등 토큰/키가 들어갈 수 있는 파일은 GitHub에 올리지 않습니다. (`.gitignore`로 제외)
- 샘플 데이터(`sample/`) 및 레거시 자료(`legacy/`)는 기본 업로드 대상에서 제외합니다.
  - 필요 시에만 별도 브랜치/별도 저장소로 관리하거나, 민감정보 제거 후 포함을 검토합니다.

### 최초 업로드(초기 1회)

1.  원격 저장소 설정
    - `git remote add origin https://github.com/comage9/VF-.git`
2.  커밋 생성
    - `git add .`
    - `git commit -m "Initial commit"`
3.  푸시
    - `git push -u origin main`

### 이후 코드 수정 후 업로드(반복)

1.  변경사항 확인
    - `git status`
2.  커밋
    - `git add .`
    - `git commit -m "<변경 내용>"`
3.  푸시
    - `git push`

### HTTPS 인증(PAT) 권장 설정

- GitHub Personal Access Token(PAT)을 사용합니다.
- 매번 입력이 번거로우면 credential helper를 설정합니다.
  - 예: `git config --global credential.helper 'cache --timeout=36000'`
  - push 시 Username은 GitHub 아이디, Password는 PAT를 입력합니다.
---

자세한 내용은 `PROJECT_DESCRIPTION.md` 파일을 참조하십시오.