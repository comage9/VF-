# VF 출차 관리 대시보드 🚛

LS(쿠팡 Linehaul) 배차 정보와 KPP(로지스올 WPPS) 팔레트 관리를 통합하는 웹 기반 출차 관리 시스템.

## 주요 기능

| 기능 | 설명 |
|:----|:------|
| **차량 정보 표시** | LS에서 수신한 배차 차량 3대 기본 표시 + 추가 배차 |
| **PLT(팔레트) 수량 입력** | 각 호차별 수기 입력, 서버 저장 (새로고침 유지) |
| **톤수 선택** | 5T / 11T / 14T 드롭다운, 변경 시 서버 저장 |
| **자동 톤수 업그레이드** | PLT가 톤수 한도 초과 시 드롭다운 자동 변경 (5T→11T→14T) |
| **🖨️ 통합 출력** | KPP PLT 반영 + LS PDF 출력 + KPP EDI 전표 출력 |
| **🔥 LS 톤수 자동 변경** | PLT 초과 시 LS API로 차량 톤수 변경 |
| **VF67 출차 카드** | 호차별 상세 카드 + 권역별 수량 + 복사 |
| **배차 요청** | VF67 포맷 메시지 생성 |
| **날짜별 조회** | 어제/오늘/내일 + 날짜 선택 |

## 시스템 구성

```
┌─────────────┐     POST /api/ls-data     ┌──────────────────┐
│  LS System  │ ──────────────────────────→│  VF Dashboard   │
│  (쿠팡)     │                            │  Flask :5177     │
└─────────────┘                            │  app.py          │
                                           └────────┬─────────┘
                                                    │
                          ┌─────────────────────────┤
                          │                         │
                          ▼                         ▼
              ┌────────────────────┐     ┌──────────────────┐
              │  KPP PBM140MW     │     │  LS PDF 출력     │
              │  (CDP 자동화)      │     │  os.startfile    │
              │  - PLT 수정        │     └──────────────────┘
              │  - EDI 출력        │
              └────────────────────┘
```

## 설치 및 실행

### 요구사항
- Python 3.11+
- Chrome 브라우저 (CDP 포트 9222)
- KPP PBM140MW 페이지 열려 있어야 함
- LS PDF 파일: `ls_pdfs/{호차}_slip.pdf`

### 패키지 설치
```bash
pip install flask websocket-client
```

### 실행
```bash
cd E:\coding\VF-dashboard-v2
python3 app.py
```
→ `http://localhost:5177` 또는 `http://bonohouse.p-e.kr:5177`

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|:-----|:-----|:------|
| GET | `/` | 대시보드 페이지 |
| GET | `/api/ls-data` | 차량 데이터 조회 |
| POST | `/api/ls-data` | 차량 데이터 저장 |
| POST | `/api/kpp-data` | KPP 데이터 저장 |
| POST | `/api/deleted-placeholders` | 삭제 상태 저장 |
| GET | `/api/vehicles?q=` | 차량 DB 검색 |
| GET | `/api/vehicle/<plate>` | 차량 상세 |
| POST | `/api/dispatch-request` | 배차 요청 전송 |
| **GET** | **`/api/print/<hoche>?plt=N`** | **🖨️ 통합 출력** |
| GET | `/api/ls-pdf-status` | PDF 존재 여부 |
| GET | `/debug` | 디버그 정보 |

## 🖨️ 통합 출력 파이프라인

```
🖨️ 클릭 → confirm("파렛트 N개, 톤수 변경 확인")
  ↓ 확인
─── 서버 (/api/print/N?plt=N) ───
1️⃣ KPP PBM140MW 조회
   ├─ 현재 PLT 읽기
   └─ 차량번호 읽기
2️⃣ 비교/판단
   ├─ PLT 일치? → 수정 없이 출력
   ├─ PLT 불일치? → KPP PLT 수정
   └─ PLT 초과? → LS 톤수 변경 + KPP PLT 수정
3️⃣ LS PDF 출력 (os.startfile)
4️⃣ KPP EDI 전표 출력 (CDP + curl)
─── 응답 (alert 결과) ───
```

## 프로젝트 구조

```
E:\coding\VF-dashboard-v2\
├── app.py                 # Flask 서버
├── config.json            # ⚙️ Telegram 등 API 설정 파일 (신규)
├── print_helper.py        # (레거시) 
├── ls_data.json           # 차량 데이터
├── deleted_placeholders.json
├── .reasonix_task.md      # Reasonix 수정 지시서
├── README.md
├── ls_pdfs/               # LS PDF 파일
└── templates/
    └── dashboard.html     # 웹 UI
```

## ⚙️ 설정 및 외부 토큰 관리

보안을 위해 Telegram API 정보 등은 외부 설정 파일인 `config.json`을 통해 관리됩니다.
```json
{
  "telegram": {
    "bot_token": "YOUR_TELEGRAM_BOT_TOKEN",
    "chat_id": "YOUR_CHAT_ID"
  }
}
```

## 🚨 주의사항 및 동작 세부 사양

1. **Chrome 필수**: KPP 페이지(PBM140MW)가 Chrome에 열려 있어야 CDP 자동화가 동작합니다.
2. **LS 로그인**: LS 톤수 변경 시 `ls.coupang.com` 로그인 세션이 Chrome에 활성화되어 있어야 합니다.
3. **PLT 한도**: 5T 최대 12개, 11T 최대 16개, 14T 최대 18개. 초과 시 자동으로 톤수가 한 단계 상향 조정됩니다.
4. **KPP 팝업 제어**: 저장 시 출력되는 "저장되었습니다." 브라우저 경고창(Alert)은 CDP 진입 시 자동으로 비활성화(Overriding) 처리되므로, 사용자가 별도로 클릭할 필요가 없으며 백엔드 멈춤 현상(타임아웃)이 원천 방지됩니다.
5. **PDF 및 전표 인쇄**:
   * 기본적으로 Windows의 **기본 프린터(Default Printer)**로 무음 출력이 나갑니다.
   * 개발/운영 기본 설정 상 `Canon G2010` 프린터 명칭을 UI 및 가이드에 예시하고 있으나, 실제 인쇄는 운영 체제(Windows)의 '기본 프린터 설정'에 연결된 어떠한 프린터 디바이스로도 정상 작동합니다.
6. **PLT 및 톤수 정보 저장**: 입력 필드 변경 시 즉시 서버의 `ls_data.json`에 저장되어 새로고침 후에도 상태가 유지됩니다.

## 참고 자료

- KPP MCP 서버: `E:\coding\skill\KPP\kpp-mcp-server\server.py`
- 설계 문서: `.reasonix_task.md`
