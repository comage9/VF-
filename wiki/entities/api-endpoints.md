# API 엔드포인트

## 핵심 API (trailing slash 없음!)
```
GET  /api/production           → 생산 계획
GET  /api/production-log       → 생산 로그
GET  /api/machine/plans        → 기계별 계획
POST /api/machine/login        → PIN 인증
POST /api/production/move-incomplete → 미완료 자동 이동
POST /api/production-log/bulk-reorder → 순서 변경
```

## AI 예측/분석
```
GET  /api/ai/production-recommend → AI 생산 추천
GET  /api/ai/predict-hourly       → 시간별 예측
POST /api/ai/analyze              → AI 분석
```

## 재고/출고
```
GET  /api/inventory/              → 재고 unified
PATCH /api/inventory/{id}         → 재고 수정
GET  /api/outbound/stats          → 출고 통계
GET  /api/outbound/top-products   → 제품별 출고
```

## 주의사항
- Django URL: trailing slash 없음 (`/api/production` 정상, `/api/production/`은 404)
- GET /api/production-log는 메서드 제한 있을 수 있음

---
*Source: MEMORY.md → wiki/entities/ 분리 (2026-04-13)*
