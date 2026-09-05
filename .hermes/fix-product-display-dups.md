① 역할: VF-new 프론트엔드 전문가로서.
② 상황:
- 프로젝트: E:/coding/VF-new/frontend/client (React + TypeScript, Vite)
- 파일: `src/pages/product-display.tsx` (5,769줄)
- 현상: 제품배치도 페이지에서 B동·C동에 같은 제품 중복 배치(37건 cross-zone dup, 12건 intra-zone dup)
- 원인: (1) 정적 기본 데이터 `C_RANK_PLACEMENT`에 C-R23-* 슬롯 중복 15건, (2) executePlacement B/C/D동 루프 인덱스 버그, (3) 로드/파싱/서버복원 경로에 전역 중복제거 헬퍼 부재

③ 문제: 중복 배치 방지 로직 추가 및 기존 오염 데이터 정리
④ 결과물:
1. `src/pages/product-display-c-data.ts` — C_RANK_PLACEMENT 중복 제거 (C-R23-* 슬롯 비우기)
2. `src/pages/product-display.tsx` —
   a. `sanitizePlacementMap(map)` 헬퍼 함수 추가 (loadPlacement 위)
   b. `loadPlacement()` 반환 전 sanitize 호출
   c. `parsePdPayload()` 파싱 후 data sanitize 후 반환
   d. `applyServerPayload()` 세트 직전 sanitize
   e. `pdSaveToServer()` 직전 snapshot.data sanitize
   f. `executePlacement()` B/C/D동 루프 버그 수정 (itemIdx → shift/pop 큐)
3. 검증: `npx tsc --noEmit -p tsconfig.json` 0 에러, `npm run build` 성공, 런타임 중복 0

⑤ 기준:
- ⛠ 이 2개 파일만 수정 (다른 파일 금지)
- 기존 동작 유지(중복만 제거), 시프트/당김 로직 변경 금지
- 함수명/변수명 기존 패턴 준수 (camelCase, 한국어 주석 유지)
- 변경 후 `npx tsc --noEmit -p tsconfig.json | grep -E "product-display|error TS"` 출력만 보고
- 빌드 성공 후 보고