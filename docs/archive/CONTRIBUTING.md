# 기본 사항 (Guidelines)

이 프로젝트에 기여하실 때 참고하시기 바랍니다.

## 목차

1. [환경 설정](#환경-설정)
2. [개발 실행](#개발-실행)
3. [코드 스타일](#코드-스타일)
4. [깃 커밋 규칙](#깃-커밋-규칙)

---

## 환경 설정

### 필수 도구

- Python 3.10+
- Node.js 18+
- Git

### 로컬 환경 설정

```bash
# 1. 가상환경 활성화
cd backend
python -m venv .venv
source .venv/bin/activate

# 2. 의존성 설치
pip install -r requirements.txt
```

```bash
# 3. 프론트엔드 의존성 설치
cd frontend
npm install
```

---

## 개발 실행

### 서버 시작

**백엔드 (포트 5176):**
```bash
cd backend
python manage.py runserver 0.0.0.0:5176
```

**프론트엔드 (포트 5174):**
```bash
cd frontend
npm run dev
```

### 외부 접속 허용

```bash
SERVER_HOST=0.0.0.0 PORT=5174 npm run dev
```

---

## 코드 스타일

### Python (Django)

- 타입 힌트 사용
- Docstring 포함
- 함수명은 snake_case

### TypeScript/React

- 함수형 컴포넌트는 PascalCase
- 변수명은 camelCase
- JSX는 최소화

---

## 깃 커밋 규칙

### 커밋 메시지 형식

```
<type>: <subject>

<body>
여기에 상세 내용
</body>

<footer>
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
</footer>
```

### Type 종류

| Type | 설명 | 예시 |
|------|------|------|
| `feat` | 새로운 기능 | `feat: FC 입고 페이지 추가` |
| `fix` | 버그 수정 | `fix: 날짜 파싱 오류 수정` |
| `docs` | 문서 수정 | `docs: README 업데이트` |
| `refactor` | 리팩토링 | `refactor: API 계층 분리` |
| `style` | 코드 스타일 (기능 변경 없음) | `style: 들여쓰기 정리` |
| `test` | 테스트 관련 | `test: 통합 테스트 추가` |
| `chore` | 빌드/설정 등 | `chore: 의존성 업데이트` |

### 한글 커밋 메시지

```
feat: FC 입고 데이터 동기화 기능 추가

- 구글 시트에서 CSV 가져오기
- DB에 저장/업데이트
- 카테고리 매핑

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## 구글 시트 정보

### VF 출고 데이터

| 항목 | 값 |
|------|------|
| 시트 ID | `2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6` |
| 데이터 GID | `1152588885` |
| CSV URL | `https://docs.google.com/spreadsheets/d/e/[시트ID]/pub?gid=1152588885&single=true&output=csv` |

### FC 입고 데이터

| 항목 | 값 |
|------|------|
| 시트 ID | `2PACX-1vQwqI0BG-d2aMrql7DK4fQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6` |
| 데이터 GID | `810884704` |
| 마스터 GID | `1777152272` |
| CSV URL | `https://docs.google.com/spreadsheets/d/e/[시트ID]/pub?gid=810884704&single=true&output=csv` |

---

## 프로젝트 구조

```
VF 출고 대시보드/
├── backend/
│   ├── sales_api/          # Django 앱
│   ├── config/            # Django 설정
│   ├── manage.py           # Django 관리
│   ├── .venv/              # Python 가상환경
│   └── .env.local         # 백엔드 환경변수 (수정)
├── frontend/
│   ├── client/             # React 앱
│   ├── server/             # Node.js 프록시
│   ├── .env.local          # 프론트엔드 환경변수 (수정)
│   └── package.json        # NPM 의존성
├── .gitignore             # 깃 제외 파일
├── README.md              # 프로젝트 설명
└── CONTRIBUTING.md         # 이 파일
```
