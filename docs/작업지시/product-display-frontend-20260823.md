① 역할: React + TypeScript 프론트엔드 전문가로서.

② 상황: E:/coding/VF-new/frontend/client (Vite + React + TS). 대상 파일은 `src/pages/product-display.tsx` 1개뿐. 제품배치도 페이지는 현재 4개 localStorage 키(vf_product_display_v1=배치 데이터, vf_product_display_layout_v1=칸 좌표, vf_pd_line_config_v1=라인 오버라이드, 스테이징 키=임시보관함)에만 저장 중. 백엔드는 이미 완성·라이브(운영 5176):
- GET  /api/product-display/latest → {found, version, payload, saved_by, created_at}
- POST /api/product-display → body {payload(JSON문자열), saved_by?, base_version?} → {success, version, skipped?} | 409 {conflict:true, latest}
- GET  /api/product-display/history → {history:[{version,saved_by,created_at,size}]}
- POST /api/product-display/restore → {version} → 새 버전 생성 | 404
- GET  /api/product-display/config → {writeTokenRequired}
- 토큰 미설정이므로 헤더 불필요.
계획 문서: E:/coding/VF-new/docs/의사결정/제품배치도-서버영속화-계획-20260823.md (먼저 읽을 것). 기존 코드 구조: 저장 관련 useEffect 4개(약 1051~1075행), addLine(약 1927행), handleCellClick 인라인 편집, LAYOUT_KEY/STORAGE_KEY 상단 상수.

③ 문제: 아래 7가지를 `product-display.tsx` 하나에 구현하라.

1. **서버 동기 저장**: 기존 4개 localStorage 자동 저장은 유지. 추가: 4개 상태를 통합한 서버용 스냅샷을 2초 디바운스로 POST. 직전 저장 성공 시 받은 version을 state로 기억하고 다음 저장에 `base_version`으로 전달. 실패(네트워크) 시 3회 재시도 후 헤더 우측에 "⚠ 서버 미동기(로컬 전용)" 경고 + 재시도 버튼.
2. **초기 로드·시드**: 마운트 시 GET latest. found=true면 서버 created_at과 로컬 저장의 savedAt 비교 → 서버가 더 새로우면 서버판으로 4개 상태 복원. found=false면 현재 로컬 상태를 즉시 최초 업로드(시드) — 시드 실패도 위 재시도/경고 로직 재사용.
3. **충돌 처리(낙관적 락)**: 409 응답 시 알림 배너 → 사용자 선택: [서버판 적용] 또는 [내 것으로 덮어쓰기](덮어쓰기 시 base_version 생략 강제 저장).
4. **복원 패널**: 우측 패널 탭 목록에 "서버 버전" 추가 → GET history 목록(버전·저장자·시각) 표시, 항목 클릭 시 현재 편집 상태에 적용(적용 전 현재 상태를 즉시 서버 저장해 되돌리기 가능). 404 → "삭제된 버전입니다" 토스트.
5. **라인 삭제·재배열**: 수정 모드에서 라인 라벨 우측에 ✕(삭제, 해당 라인 제품 전부 임시보관함 이관, 삭제 전 confirm)와 ◀▶(좌우 순서 교환, 라인 내 칸 좌표 재계산) 버튼.
6. **LineOverride 편집 UI**: 수정 모드 우측 패널에 "라인 설정" 접힘 패널 — 동·라인별 칸 수(count) 숫자 입력, 숨김 슬롯(hiddenSlots) 체크박스, 배지 텍스트 입력. 적용 시 기존 lineConfig 상태 경유로 반영(기존 applyLineOverrides 재사용) + 서버 스냅샷에 포함.
7. **헤더 표시**: 헤더에 "마지막 서버 저장: HH:MM (저장자)" 표시 — 서버 저장 성공 시 갱신.

④ 결과물: 수정 파일 = `src/pages/product-display.tsx` 1개만. 완료 조건:
- `cd frontend/client && npx tsc --noEmit` → product-display.tsx 관련 에러 0 (기존 타 파일 에러는 무시)
- `npm run build` 성공
수정 후 요약(구현 위치·상태/함수 추가 목록)만 출력.

⑤ 기준:
- ⛔ `product-display.tsx` 외 파일 수정·생성 금지.
- ⛔ 기존 기능 파괴 금지: 인라인 편집(콤마 다품목), 시프트 규칙, 임시보관함 자동 이관, 뱀 모양 로케이션 번호, 엑셀 업/다운로드, localStorage 자동 저장은 전부 그대로 유지.
- 기존 스타일(한국어 라벨, setSaveMsg 토스트 패턴, fetch) 준수. fetch는 상대경로("/api/...").
- 저장 디바운스는 useRef+setTimeout으로 구현(외부 라이브러리 추가 금지).
- 서버 스냅샷 payload 구조는 고정: {"data":…, "layout":…, "lineConfig":…, "staging":…, "savedAt":ISO문자열} — 파싱 실패 시 서버판 무시하고 로컬 유지(경고만).
