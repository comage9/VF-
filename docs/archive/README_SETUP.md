# VF 출고 대시보드 설정 가이드 (Google Sheets 연동)

이 프로젝트는 구글 시트와 연동하여 출고, 입고, 마스터 데이터를 관리합니다.
정상적인 작동을 위해 `.env` 파일에 구글 시트 URL과 API 키를 설정해야 합니다.

## 1. 환경 변수 설정

`backend/.env.example` 파일을 복사하여 `backend/.env` 파일을 생성하고 아래 내용을 채워주세요.

```bash
cd backend
cp .env.example .env
```

### 필수 변수

| 변수명 | 설명 | 비고 |
|---|---|---|
| `GOOGLE_SHEETS_API_KEY` | Google Cloud Console에서 발급받은 API Key | 시트 데이터 새로고침(Refresh) 기능 사용 시 필수 |
| `FC_GOOGLE_SHEET_CSV_URL` | FC 입고 데이터 시트의 CSV 배포 URL | `파일 > 공유 > 웹에 게시 > CSV` 선택 |
| `MASTER_DATA_CSV_URL` | 마스터 데이터(카테고리) 시트의 CSV 배포 URL | `파일 > 공유 > 웹에 게시 > CSV` 선택 |
| `OUTBOUND_GOOGLE_SHEET_URL` | 출고 데이터 시트의 CSV 배포 URL | `파일 > 공유 > 웹에 게시 > CSV` 선택 |

## 2. 구글 시트 '웹에 게시' 방법

1.  연동할 구글 스프레드시트를 엽니다.
2.  상단 메뉴에서 **파일(File) > 공유(Share) > 웹에 게시(Publish to web)**를 클릭합니다.
3.  '링크(Link)' 탭에서 **전체 문서(Entire Document)** 또는 특정 **시트(Sheet)**를 선택합니다.
4.  형식을 **쉼표로 구분된 값(.csv)**으로 선택합니다.
5.  **게시(Publish)** 버튼을 클릭합니다.
6.  생성된 링크를 복사하여 `.env` 파일의 해당 변수에 붙여넣습니다.

## 주의사항

-   `.env` 파일은 보안상 Git에 업로드되지 않으므로, 새 환경에서 프로젝트를 실행할 때마다 위 설정을 반복해야 합니다.
-   API Key가 없으면 일부 자동 동기화 기능이 제한될 수 있습니다.
