① 역할: Django 백엔드 전문가로서.

② 상황: E:/coding/VF-new/backend (Django + DRF, DB=backend/db.sqlite3, 운영 포트 5176). 제품배치도 페이지(프론트)가 현재 브라우저 localStorage에만 저장 중이라 서버 영속화가 필요. 관련 앱: sales_api (모델은 sales_api/models.py, 뷰는 sales_api/views.py, urls는 sales_api/urls.py). 계획 문서: E:/coding/VF-new/docs/의사결정/제품배치도-서버영속화-계획-20260823.md (먼저 읽을 것).

③ 문제: 제품배치도 스냅샷 저장/조회/복원 백엔드 엔드포인트가 없음. 아래를 구현하라.

구현 내용 (전부 신규 추가, 기존 코드 수정 최소화):

1. 모델 `ProductDisplaySnapshot` (sales_api/models.py 맨 뒤에 추가):
   - version: IntegerField (auto — 저장 시 max(version)+1 계산)
   - payload: TextField (JSON 문자열: {"data","layout","lineConfig","staging","savedAt"})
   - payload_hash: CharField(40) (sha1 hex — 중복 스킵용)
   - saved_by: CharField(64) default "browser"
   - created_at: DateTimeField auto_now_add

2. 뷰 (sales_api/views.py 맨 뒤에, 기존 컨벤션 준수 = @csrf_exempt + JsonResponse):
   - GET /api/product-display/latest → {found:true, version, payload, saved_by, created_at} 또는 {found:false}
   - POST /api/product-display → body {payload(JSON 문자열), saved_by?, base_version?}
     * payload_hash가 최신과 동일하면 저장 스킵 → {success:true, version:현재버전, skipped:true}
     * base_version이 주어졌고 서버 최신 != base_version → 409 + {conflict:true, latest:{...}} (낙관적 락)
     * 저장 후 20개 초과 시 오래된 것부터 삭제
   - GET /api/product-display/history → 최근 20개 [{version, saved_by, created_at, size}]
   - POST /api/product-display/restore → {version} → 해당 스냅샷 payload를 복사해 새 버전 생성. 존재하지 않으면 404 {error:"삭제된 버전입니다"}
   - GET /api/product-display/config → {writeTokenRequired: bool} (VF_WRITE_TOKEN 설정 여부만 노출, 값 아님)

3. 쓰기 토큰: 환경변수/설정값 `VF_WRITE_TOKEN` (settings.py의 env 로더 패턴 사용). 설정 시 POST/restore에 X-VF-Token 헤더 검증 → 불일치 403. 미설정 시 무검증(사내망 기본).

4. urls: sales_api/urls.py에 5개 경로 추가 (product-display/... — 기존과 구별되는 새 접두사).

5. 마이그레이션: `python manage.py makemigrations sales_api` + `migrate` 실행.

④ 결과물: 수정 파일 = sales_api/models.py, sales_api/views.py, sales_api/urls.py, config/settings.py(토큰 env만), 새 migrations 파일 1개. 완료 조건: (a) `python manage.py check` 0 에러 (b) 아래 검증 통과:
   - curl -s localhost:5176/api/product-display/latest → {"found": false}
   - curl -s -X POST localhost:5176/api/product-display -d '{"payload":"{\"test\":1}","saved_by":"test"}' -H 'Content-Type: application/json' → success:true version:1
   - curl -s localhost:5176/api/product-display/latest → found:true version:1
   - curl -s localhost:5176/api/product-display/history → 1건
   - 중복 재저장 → skipped:true
   - restore version:1 → 새 버전 2 생성
   ※ 서버 재시작 금지 — 5176은 운영 중. 실행 중인 서버가 새 코드 반영 못 해도 됨, 검증은 `python manage.py test` 또는 별도 셸 스크립트(TestClient)로 할 것.

⑤ 기준:
   - ⛔ models.py/views.py/urls.py/settings.py/migrations 외 어떤 파일도 수정·생성 금지 (특히 departure/, 스크립트류).
   - ⛔ 기존 csrf_exempt 뷰·인쇄 API·기존 모델 절대 수정 금지.
   - 기존 뷰 스타일(JsonResponse, @csrf_exempt) 그대로 따를 것.
   - payload 검증: JSON 파싱 실패 시 400. 크기 2MB 초과 시 413.

수정 후 변경된 코드/요약만 출력.
