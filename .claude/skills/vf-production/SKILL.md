---
name: vf-production
description: 보노하우스 VF 프로젝트 생산 계획 관리
trigger: "생산", "기계", "계획", "보노하우스", "토이", "로코스", "해피", "어반", "슬림", "와이드", "에센셜", "에센셜 프레임", "북트롤리", "탑백", "초대형", "맥스", "바퀴", "데크타일", "핸들러"
---

# vf-production Skill (Hermes Version)

## 설명
보노하우스 VF 프로젝트 생산 계획 관리 스킬.
Hermes Agent에서 VF 생산 계획 조회, 추가, 수정, 삭제, 복사 작업을 수행.

## 프로젝트 경로
- **VF 백엔드**: `/home/comage/coding/VF/backend/`
- **VF 프론트엔드**: `/home/comage/coding/VF/frontend/`
- **제품 DB**: `/home/comage/gbrain-docker/cleaned_data/vf_products_final.csv`
- **API 서버**: `http://bonohouse.p-e.kr:5174/api`
- **백엔드 포트**: `5176` (Django, 8000 아님!)
- **프론트엔드 포트**: `5174` (Vite)

## 제품 마스터 DB
제품 번호/이름/분류 조회용 SQLite DB.

| DB 파일 | 경로 | 출처 |
|---------|------|------|
| product_master.db | `/home/comage/gbrain-docker/brain/01-VF-프로젝트/product_master.db` | 구글시트 CSV (920행) |
| vf_products_final.csv | `/home/comage/gbrain-docker/cleaned_data/vf_products_final.csv` | 기존 정리 데이터 |

**product_master.db 스키마:**
```sql
-- 테이블: product_master (22컬럼)
-- 주요: 제품번호, 제품명, 대분류, 중분류, 색상, 단수, 생산단위, SKU ID, 바코드, 로케이션
-- 주의: 원본 CSV 중복 컬럼 → 대분류_1, 중분류_1 suffix 처리됨
```

**CSV → SQLite 변환:**
```bash
curl -sL "구글시트URL&output=csv" -o /tmp/product_master.csv
# Python에서 실행 (중복 컬럼 자동 처리)
```

## 주요 기능
| 기능 | 명령어 예시 |
|------|------------|
| 생산 계획 조회 | "오늘 생산 계획 보여줘" |
| 특정 날짜 조회 | "2026-04-27 생산 계획" |
| 기계별 조회 | "기계 3번 오늘 뭐해?" |
| 요약 | "생산 요약해줘" |
| 날짜 복사 | "4/25 생산 계획을 4/28에 복사" |
| 작업 추가 | "에센셜 상판 화이트 30박스 추가" |

## API 엔드포인트 (실제 서버: http://bonohouse.p-e.kr:5174)
| 操作 | 엔드포인트 | 비고 |
|------|-----------|------|
| 조회 | `GET /api/production` | 전체 조회, 응답은 `results.latestData`에 오늘 데이터 |
| 추가 | `POST /api/production-log` | 핵심 - 레코드 1개 추가 |
| 수정 | `PUT /api/production-log/{id}` | 기존 레코드 수정 |
| 삭제 | `DELETE /api/production/{id}` | 레코드 삭제 (production 경로) |
| 날짜복사 | `POST /api/production/copy-day` | 특정 날짜 데이터 복사 |

**API 응답 구조 (GET /api/production):**
```python
{
  "count": 44,
  "results": {
    "success": true,
    "latestDate": "2026-04-29",
    "data": [],        # ← 항상 비어있음 (날짜 필터 없이 조회 시)
    "latestData": [...],  # ← 오늘 데이터가 여기 들어있음
    "allDates": [...],
    "totalRecords": 346
  }
}
```

## POST /api/production-log payload (실제 검증된 구조)
```json
{
  "date": "2026-04-29",
  "machineNumber": "3",
  "productName": "토이 바디",
  "color1": "NAVY1",
  "quantity": 125,
  "unitQuantity": 125,
  "moldNumber": "17",
  "productNameEng": "Toy Body",
  "color2": "GRAY 9091",
  "unit": "125",
  "status": "pending"
}
```

**주의:**
- machineNumber는 문자열 (숫자 아님)
- quantity = 팔레트수 x unitQuantity
- 기존 데이터 수정 시 id 필수

## 색상 코드 매핑 (중요: 네이비 규칙)
| 자연어 | 코드 | 비고 |
|--------|------|------|
| 투명 | O | |
| 화이트, 흰색 | WHITE1, WHITE 180 | |
| 아이보리 | Ivory, IVORY 1060 | |
| 버터 | Butter, YELLO - 3093 | |
| 레드 | RED 2259 | |
| 네이비 (네이비 1번) | NAVY1, GRAY 9091 | 기본값. "네이비"라고만 하면 1번 |
| 네이비 2번 | Navy2, BLUE 20311 | 반드시 "2번" 명시 |
| 민트 | Mint2, GREEN 30072 | |
| 오렌지 | Orange, ORANGE 6565 | |
| 그레이 | Gray2, GRAY 11215-1 | |
| 블루, 파랑 | Modern Blue(B3), BLUE 2083 | |
| 바이올렛 | Violet, VIOLET 8176 | |

## 색상 확인 규칙 (매 요청마다 적용)
1. 사용자가 "색이 ○○야" 또는 "○○색" 이라고 하면 → color-mapping.md에서 정확한 코드 확인
2. "네이비"라고만 하면 → **네이비 1번 (NAVY1)**으로 해석
3. "네이비 2번"이라고 명시하면 → Navy2 (BLUE 20311)
4. 모호한 색상명 → 사용자에게 확인 요청
5. 색상 코드는 **한국어 색상명 + 실제 코드** 둘 다 기록

## 단위 확인 규칙 (매 요청마다 적용)
- 단위는 제품마다 고유함 (금형 데이터의 중량과 다름)
- 사용자가 "1p", "한 팔레트"라고 하면 → 수량: 125, 단위: 125
- 사용자가 "세 줄"이라고 하면 → 수량: 75 (25×3), 단위: 25
- 단위가 불명확하면 → 반드시 사용자에게 확인 요청
- 기존 데이터의 수량으로 단위 추정 금지 (통계 분석으로 단위 판단하지 말 것)

## 작업 추가 요청 처리 흐름
1. **파싱**: 제품명, 색상, 수량, 기계 번호 추출
2. **색상 검증**: color-mapping.md에서 정확한 색상 코드 확인
3. **단위 확인**: 사용자에게 단위 확인 (불명확할 때만)
4. **데이터 확인**: 등록 예정 내용을 표로 요약해서 사용자에게 보여주기
5. **확인 요청**: "이 내용으로 등록할게요. 맞나요?" → 사용자 응답 후 등록
6. **등록 완료**: production-data.md 업데이트

## 응답 규칙
- 한자 사용 금지 (한국어만)
- 색상명: "네이비 1번", "네이비 2번"처럼 구체적으로 표기
- 수량 표기: "125" (단위 없이 숫자만)

## 제품 별명 매핑
| 별명 | 정식 명칭 | 금형 | 기계 | 색상 |
|------|----------|------|------|------|
| 토이 | 토이 바디 | 17 | 3 | NAVY1 (네이비 1번), Navy2 (네이비 2번), Red |
| 로코스 L | 로코스 L | 40 | 14 | WHITE1, Ivory, Butter |
| 로코스 M | 로코스 M | 41,56 | 1,14 | -, Black, Ivory |
| 로코스 S | 로코스 S | 42 | 12 | WHITE1, Ivory, Butter |
| 로코스 XS | 로코스 XS | 107 | 2 | Ivory, WHITE1, Butter |
| 해피 | 해피 바디 | 14 | 13 | Ivory, Modern Blue(B3), Violet |
| 어반 | 어반 옷걸이 신규 금형 | 111 | 10 | Butter, WHITE1, Black |
| 슬림 | 슬림 서랍장 프레임 신규 | 901 | 7 | WHITE1 |
| 와이드 | 와이드 앞판 | 30 | 생산대기 | Ratan Brown, Simple Ivory, Simple Gray2, Simple White |
| 북트롤리 | 북트롤리 | 127,128,129 | 9 | - |
| 탑백 | 탑백 72L,52L 캡 | 124 | 9 | WHITE1, Ivory, Gray2 |
| 초대형 | 초대형 바디 | 12 | 13 | - |
| 맥스 | 맥스 서랍장 | 118 | 13 | - |
| 바퀴 | 바퀴 | 56 | 1 | Black |
| 에센셜 | 에센셜 상판 | 22 | 9 | Ivory |
| 에센셜 프레임 | 에센셜 프레임 | 25 | - | WHITE1 |
| 모던블랑 | 모던플러스 블랑 | 3 | 3 | WHITE1, O |
| 모던서랍 | 모던플러스 서랍 | 2 | 4 | WHITE1 |
| 모던앞판 | 모던플러스 앞판 | 5 | 6 | WHITE1 |
| 이유 | 이유 | 135 | 11 | WHITE1, Yello, EU RED |
| 오픈바스켓 | 오픈 바스켓 | 20 | 13 | Yello, Orange, Mint2, Navy2 |

## 작업 흐름
1. **파싱**: 제품명, 색상, 수량, 기계 번호를 자연어에서 추출
2. **매칭**: 기존 데이터와 비교하여 금형/기계 자동 매칭
3. **확인**: 사용자에게 확인 요청 (추가할 내용 요약)
4. **실행**: API 호출로 생산 계획 추가

## 응답 형식
```json
{
  "success": true,
  "message": "5건 조회됨",
  "data": [...]
}
```

## Dual-Server 아키텍처 (중요 — 항상 확인!)
VF는 로컬(테스트)과 윈도우(실서버)가 독립 운영됩니다.

**서버 구조:**
| 구분 | 로컬 | 윈도우 실서버 |
|------|------|------------|
| 프론트 | Vite Dev Server → :5174 | IIS → :5174 |
| 백엔드 | Django → :5176 | Django → :5176 |
| DB | 로컬 SQLite | 윈도우 DB |
| 도메인 | `localhost:5174` (내 Linux) | `bonohouse.p-e.kr:5174` (59.9.19.188, 윈도우) |

**데이터가 안 보일 때 확인 순서:**
```bash
# 1. 어느 서버에서 오는지 확인 (curl -v의 "Connected to" 확인)
curl -v "http://bonohouse.p-e.kr:5174/api/production" 2>&1 | grep "Connected to"

# 2. 로컬 DB 확인
curl "http://localhost:5176/api/production" | python3 -c "import sys,json; ..."

# 3. 실서버 DB 확인
curl "http://bonohouse.p-e.kr:5176/api/production" | python3 -c "import sys,json; ..."
```

**⚠️ POST /api/production-log 주의사항:**
- **필드명은 반드시 CamelCase**: `machineNumber`, `moldNumber`, `productName`, `color1`, `color2`, `unitQuantity`, `productNameEng`
- snake_case로 보내면 필드가 무시되고 빈 레코드가 생성됨 (junk record)
- id 필드를 보내도 **id로 생성되지 않음** — 복합고유키(date, machine_number, mold_number, product_name, color1, color2)로 get_or_create 동작
- id는 Django auto-increment로 자동 할당 (보내는 id는 무시됨)
- 잘못된 payload로 POST하면 **product_name 등이 빈 junk record가 생성됨**
- 따라서 **레코드 생성은 반드시 Django shell로 직접 할 것**

**junk record 정리 (product_name이 빈 레코드):**
```bash
cd /home/comage/coding/VF/backend && source .venv/bin/activate && python3 -c "
import django; django.setup()
from sales_api.models import ProductionLog
# 확인
print('빈 product_name 레코드:')
for r in ProductionLog.objects.filter(product_name=''):
    print(f'  id={r.id} date={r.date}')
# 삭제
ProductionLog.objects.filter(product_name='').delete()
"
```

## 제품 명명 패턴 (약칭 → 정식 제품명)

### 맥스系列产品 패턴 3종류
| 종류 | 약칭 예시 | 정식 명칭 패턴 | 예시 |
|------|----------|--------------|------|
| 맥스 (단독) | 맥스 5단 투명 | `보노하우스 맥스 서랍장 [색상] [단수] 1개` | 보노하우스 맥스 서랍장 투명 5단 1개 |
| 맥스 이동식/바퀴 | 맥스 3단 투명 바퀴 | `보노하우스 국내제조 맥스 이동식 서랍장 [색상] 1개 [단수]단(규격)` | 보노하우스 국내제조 맥스 이동식 서랍장 투명 1개 3단(360x430x705mm) |
| 어반 오크 상판 | 맥스 5단 투명 오크 | `보노하우스 어반 우드상판 베이직 서랍장 [단수]단 [색상] 1개` | 보노하우스 어반 우드상판 베이직 서랍장 5단 투명 1개 |

### 맥스 색상 코드
| 약칭 | 색상 코드 | 비고 |
|------|---------|------|
| 투명 | O | 맥스 단독, 어반 오크 상판 |
| 다크투명 | DO | 맥스 단독 |
| 화이트 | WHITE | 맥스 단독 |
| 투명 오크 | OAK | 어반 오크 상판 (어반 브랜드) |

### 색상 코드 통일 (Gray2 규칙)
| 코드 | 색상명 | 비고 |
|------|-------|------|
| Gray | 그레이 | Gray1 (현재 미사용) |
| Gray2 | 라이트그레이, 그레이2 | 동일 색상 |

### 라탄 플러스 약칭 규칙
- 라탄 플러스 시리즈는 모두 사각 오크 상판 사용
- **"오크"를 붙이지 않고简称** → "모던 플러스 라탄 6단 그레이"
- 정식: "보노하우스 라탄플러스 우드상판 서랍장 그레이 6단 1개 562mm"

### 모던系列产品 명명 패턴

**기본형 (내추럴오크 상판)**
| 약칭 | 정식 명칭 | 제품번호 |
|------|----------|---------|
| 모던 4단 화이트 오크 | 보노하우스 모던플러스 내츄럴오크 우드상판형 4단 서랍장 | 7 |
| 모던 5단 화이트 오크 | 모던플러스 내츄럴오크 우드상판형 5단 | 1 |

**앞판+상판 조합형 (국내제조)**
| 약칭 | 정식 명칭 | 비고 |
|------|----------|------|
| 모던 5단 화이트 오크 | 보노하우스 국내제조 모던플러스 우드상판 서랍장 화이트+내추럴 오크 1개 5단 | 앞판화이트 + 상판내추럴오크 |
| 모던 6단 화이트 오크 | 보노하우스 국내제조 모던플러스 우드상판 서랍장 화이트+내추럴 오크 1개 6단 | 앞판화이트 + 상판내추럴오크 |

**설명**:
- 앞판색상: 서랍 앞판 색상 (화이트, 네이비, 그레이 등)
- 상판종류: 오크 (MDF 오크 색상), 내추럴 오크

## GitHub 푸시 실패 시 (Secret 감지)

GitHub Secret Scanning이 API 키 등을 감지해서 푸시를 차단할 수 있어요:
```
remote: - Push cannot contain secrets
```

**해결:** https://github.com/{owner}/{repo}/security/secret-scanning/unblock-secret/{secret-id} 에서"Unblock" 클릭 후 다시 푸시

---

## 프론트엔드 배포 문제 해결
프론트엔드에서 수정사항이 안 보일 때:

1. **빌드 타임스탬프 확인** (소스코드 vs 빌드 산출물):
   ```bash
   stat /home/comage/coding/VF/frontend/client/dist/assets/index-*.js | grep Modify
   git -C /home/comage/coding/VF/frontend/client log -1 --format="%ci"
   ```
2. **소스코드가 빌드 이후 수정됐으면 재빌드**:
   ```bash
   cd /home/comage/coding/VF/frontend/client && npm run build
   ```
3. **nginx 재시작** (새 빌드가 서빙되도록):
   ```bash
   sudo nginx -s reload
   ```

## Git Pull + 서버 재시작 Workflow

Git에서 새 커밋을 받고 로컬 변경사항을 보존하면서 서버를 재시작하는流程:

```bash
# 1. Git 상태 확인
cd /home/comage/coding/VF && git status && git log --oneline origin/main -3

# 2. 원격 변경사항 확인
git fetch origin && git log --oneline origin/main -3

# 3. 로컬 변경 stash (보존)
git stash

# 4. Git pull (원격 기준)
git pull origin main

# 5. 마이그레이션 확인 및 적용 (새 마이그레이션이 있으면 반드시 실행!)
cd /home/comage/coding/VF/backend && source .venv/bin/activate
python manage.py showmigrations  # 미적용 마이그레이션 확인 ([ ] 표시)
python manage.py migrate          # 미적용 마이그레이션 적용

# 6. 마스터 데이터 시딩 (새 마이그레이션으로 추가된 테이블용)
python manage.py seed_master_data -v 2

# 7. 백엔드 서버 실행 확인
ss -tlnp | grep 5176  # 5176 포트가 비어있으면 서버가 안 뜬 것
# 백엔드 서버가 안 돌아가면:
cd /home/comage/coding/VF/backend && source .venv/bin/activate
python manage.py runserver 0.0.0.0:5176  # background=true 모드로 실행

# 8. 나중에 stash 복원 (필요시)
git stash pop
```

**stash 확인:**
```bash
git stash list
git stash show -p | head -80  # 변경내용 미리보기
```

**⚠️ 중요: Git pull 후 반드시 마이그레이션 + 시딩 확인**
- 마이그레이션이 누락되면 API 호출 시 `OperationalError` 발생
- 새 마이그레이션(`0019_*`)이 있으면 `python manage.py migrate` 필수
- `seed_master_data`는 MasterColor, MasterMold, MasterUnit 등 마스터 테이블 초기화용 — 마이그레이션 후 반드시 실행
- 마스터 데이터가 없으면 `/api/master/molds` 등이 빈 배열 반환
- 프론트엔드는 항상 실행 중 (포트 5174)
- 백엔드 서버가 죽어있으면 백엔드 포트(5176)가 비어있음 → `ss -tlnp | grep 5176`으로 확인

## AI 챗봇 백엔드 디버깅 (ai_chat view)

VF의 AI 챗봇은 `sales_api/views.py`의 `ai_chat` 함수에 구현됨.

### ai_chat 함수 디버깅 체크리스트

| # | 체크항목 | 확인 위치 |
|---|---------|----------|
| 1 | ProductionLog 조회 시 `status` 필터가 `pending`을 포함하는지 | `ai_chat` 내의 `ProductionLog.objects.filter(...)` 쿼리 |
| 2 | 데이터가 없을 때 해당 섹션을 user_prompt에서 제외하는지 | `if top_products:` 등 조건문 |
| 3 | 시스템 프롬프트에 "데이터 없으면 '없다'고 명확히 답하기" 지시가 있는지 | `system_instruction` 변수 |
| 4 | LLM이 허구의 수치를 만들지 않는지 (할루시네이션) | 실제 DB 데이터와 AI 답변 비교 |

### 자주 발생하는 ai_chat 버그 패턴

**1. pending 상태 생산 로그 누락**
```
# 잘못된 코드 예시
status='started' / status='ended'만 카운트 → pending 무시
# 수정: status 필터 제거하거나 pending도 포함
```

**2. 빈 데이터에서 할루시네이션**
```
# 잘못된 코드 예시
"VF 상위 품목:" + 빈 리스트 전달 → AI가 실제 없는 제품 생성
# 수정: 데이터 있을 때만 섹션 포함
if top_products:
    context_info["vf_top_products"] = top_products
```

**3. 날짜 범위 할루시네이션 (매우 흔함)**
```
# 잘못된 코드 예시
AI: "최근 3일 판매량: 686개" → 사용자가 언제부터 언제까지인지 알 수 없음
# 실제: 04-26~04-28 데이터인데 "최근 3일"이라는 상대적 표현만 반환
# 수정: user_prompt 가이드에 반드시 실제 날짜 범위 명시하도록 지시 추가
# "9. **매우 중요: '최근 며칠', '최근 일주일' 등 상대적 표현 대신 실제 날짜 범위를 반드시 명시하세요**"
```

**3-2. 다중 날짜 제공 시 특정 날짜 선택적 무시 (심각)**
```
# 상황: 프롬프트에 04-27 데이터(132건)와 04-29 데이터(45건) 모두 포함
# AI 응답: "04-29 데이터 없음" + 04-27 데이터만 반환
# 원인: 모델이 제공된 데이터를 무시하고 할루시네이션
# 발생 조건: 
#   - 프롬프트에 날짜 A, 날짜 B 데이터 모두 존재
#   - 사용자가 특정 날짜(B)를 요청
#   - 모델이 다른 날짜(A)를 기반으로 잘못된 답변 생성
# 검증: DB에는 04-29 ProductionLog 45건 존재, AI 프롬프트에도 포함됨
# 해결: 시스템 프롬프트에 "제공된 데이터 중에서만 답하라" 명시적 지시 추가
# 예시 시스템 지시:
# "답변은 반드시 [구체적 날짜]의 실제 데이터에만 기반해야 합니다. 
#  다른 날짜의 데이터로 추측하거나 보완하지 마세요. 
#  해당 날짜에 데이터가 없으면 '없다'고 명확히 답하세요."
```

**4. LLM 통합 시 데이터 검증**
- AI 답변의 구체적 수치를 실제 DB와 반드시 비교
- "구체적 수치 제공" 시스템 프롬프트 + 빈 데이터 = 할루시네이션 발생
- 상대적 날짜 표현("최근", "오늘", "어제")을 AI가 특정 시각으로 고정하는 경우 확인 필요

### ai_chat 함수 위치
`/home/comage/coding/VF/backend/sales_api/views.py` — `ai_chat` 함수 (line ~4235~4631)

### 디버깅 명령어
```bash
# ai_chat 관련 로그 확인 (에러 발생 시)
cd /home/comage/coding/VF/backend && source .venv/bin/activate
python -c "
import django; django.setup()
from sales_api.models import ProductionLog
print('pending 로그 수:', ProductionLog.objects.filter(status='pending').count())
print('started 로그 수:', ProductionLog.objects.filter(status='started').count())
print('ended 로그 수:', ProductionLog.objects.filter(status='ended').count())
"
```

## 참고 파일
- `references/production-data.md` - 오늘 생산 계획 (2026-04-29)
- `references/production-summary.md` - 생산 요약 정보
- `references/mold-master.md` - 금형 번호/품목명/중량 매핑 (137개)
- `references/color-mapping.md` - 색상 코드 매핑 (50+ 항목)
- `scripts/production_api.py` - API 헬퍼 스크립트
