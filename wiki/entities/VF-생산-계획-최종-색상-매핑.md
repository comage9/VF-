# VF 생산 계획 - 최종 색상 컬러 매핑 (방안 A)

## 적용 원칙
1. **일반 색상**: 텍스트 컬러만 적용 (배경: 흰색 #FFFFFF)
2. **화이트/아이보리 계열**: 텍스트 + 배경 모두 적용하여 명확히 구분
3. **일관성**: 모든 색상 동일한 원칙 적용

## 최종 컬러 매핑 테이블

| 색상 ID | 색상 명칭 (한글) | 영문명 | 텍스트 HEX | 배경 HEX | 적용 방식 | 비고 |
|---------|-----------------|--------|------------|----------|-----------|------|
| COLOR_01 | 블랙 | Black | #000000 | #FFFFFF | 텍스트만 | 순수 검정 |
| COLOR_02 | 브라운 | Brown | #8B4513 | #FFFFFF | 텍스트만 | 어두운 갈색 |
| COLOR_03 | 다크 브라운 | Dark Brown | #5D4037 | #FFFFFF | 텍스트만 | 더 어두운 갈색 |
| COLOR_04 | 그레이1 | Gray1 | #808080 | #FFFFFF | 텍스트만 | 중간 회색 |
| COLOR_05 | 그레이2 | Gray2 | #A9A9A9 | #FFFFFF | 텍스트만 | 연한 회색 |
| COLOR_06 | 그레이3 | Gray3 | #696969 | #FFFFFF | 텍스트만 | 어두운 회색 |
| COLOR_07 | 그레이4 | Gray4 | #D3D3D3 | #FFFFFF | 텍스트만 | 아주 연한 회색 |
| COLOR_08 | 그린 | Green | #228B22 | #FFFFFF | 텍스트만 | 숲 녹색 |
| COLOR_09 | 다크 그린 | Dark Green | #006400 | #FFFFFF | 텍스트만 | 어두운 녹색 |
| COLOR_10 | 네이비1 | NAVY1 | #000080 | #FFFFFF | 텍스트만 | 짙은 남색 |
| COLOR_11 | 네이비2 | Navy2 | #191970 | #FFFFFF | 텍스트만 | 미드나이트 블루 |
| COLOR_12 | 모던 블루(B3) | Modern Blue(B3) | #1E90FF | #FFFFFF | 텍스트만 | 도저 블루 |
| COLOR_13 | 블루(B2) | BLUE(B2) | #4169E1 | #FFFFFF | 텍스트만 | 로열 블루 |
| COLOR_14 | EU 블루 | EU BLUE | #4682B4 | #FFFFFF | 텍스트만 | 스틸 블루 |
| COLOR_15 | 다크 O | Dark O | #2F4F4F | #FFFFFF | 텍스트만 | 다크 슬레이트 그레이 |
| COLOR_16 | 민트1 | Mint1 | #98FB98 | #FFFFFF | 텍스트만 | 연한 민트 |
| COLOR_17 | 민트2 | Mint2 | #3CB371 | #FFFFFF | 텍스트만 | 미디엄 시그린 |
| COLOR_18 | 바이올렛 | Violet | #8A2BE2 | #FFFFFF | 텍스트만 | 블루 바이올렛 |
| COLOR_19 | 베이지 | Baige | #F5F5DC | #FFFFFF | 텍스트만 | 베이지 |
| COLOR_20 | 오렌지 | Orange | #FFA500 | #FFFFFF | 텍스트만 | 오렌지 |
| COLOR_21 | EU 옐로 | EU YELLO | #FFD700 | #FFFFFF | 텍스트만 | 골드 |
| COLOR_22 | 옐로 | Yello | #FFFF00 | #FFFFFF | 텍스트만 | 순수 노랑 |
| COLOR_23 | 버터 | Butter | #FFFACD | #FFFFFF | 텍스트만 | 레몬 쉬폰 |
| COLOR_24 | 핑크(P2) | Pink(P2) | #FFC0CB | #FFFFFF | 텍스트만 | 핑크 |
| COLOR_25 | 핑크(P3) | Pink(P3) | #DB7093 | #FFFFFF | 텍스트만 | 페일 바이올렛 레드 |
| COLOR_26 | 카키(BRIDA) | Kaki(BRIDA) | #C3B091 | #FFFFFF | 텍스트만 | 카키 |
| COLOR_27 | 오렌지(BRIDA) | Orange(BRIDA) | #FF8C00 | #FFFFFF | 텍스트만 | 다크 오렌지 |
| COLOR_28 | 옐로(BRIDA) | Yello(BRIDA) | #FFD700 | #FFFFFF | 텍스트만 | 골드 |
| COLOR_29 | O | O | #708090 | #FFFFFF | 텍스트만 | 슬레이트 그레이 |
| COLOR_30 | 라탄 딥 그린 | Ratan Deep Green | #2E8B57 | #FFFFFF | 텍스트만 | 씨 그린 |
| COLOR_31 | 네이비(BRIDA) | Navy(BRIDA) | #000080 | #FFFFFF | 텍스트만 | 짙은 남색 |
| COLOR_32 | EU 레드 | EU RED | #DC1434 | #FFFFFF | 텍스트만 | 크림슨 레드 |

## 화이트/아이보리 계열 (특별 처리)

| 색상 ID | 색상 명칭 (한글) | 영문명 | 텍스트 HEX | 배경 HEX | 적용 방식 | 비고 |
|---------|-----------------|--------|------------|----------|-----------|------|
| **COLOR_W1** | **화이트1** | **WHITE1** | **#000000** | **#F5F5F5** | 텍스트+배경 | 검정 텍스트 + 연한 회색 배경 |
| COLOR_W1_SIMPLE | 심플 화이트 | Simple White | #000000 | #F5F5F5 | 텍스트+배경 | WHITE1과 동일 |
| COLOR_W1_RATAN | 라탄 화이트 | Ratan White | #000000 | #F5F5F5 | 텍스트+배경 | WHITE1과 동일 |
| COLOR_W1_DECOS | 데코스 화이트 | Decos WHITE | #000000 | #F5F5F5 | 텍스트+배경 | WHITE1과 동일 |
| COLOR_W1_LOTTE | 롯데 화이트1 | LOTTE WHITE1 | #000000 | #F5F5F5 | 텍스트+배경 | WHITE1과 동일 |
| COLOR_W1_BRIDA | 화이트(BRIDA) | WHITE(BRIDA) | #000000 | #F5F5F5 | 텍스트+배경 | WHITE1과 동일 |
| **COLOR_W2** | **화이트2** | **WHITE2** | **#696969** | **#FFF8DC** | 텍스트+배경 | 어두운 회색 텍스트 + 아이보리 배경 |
| **COLOR_I1** | **아이보리** | **IVORY** | **#8B7355** | **#FFF8DC** | 텍스트+배경 | 아이보리 브라운 텍스트 + 아이보리 배경 |
| COLOR_I1_SIMPLE | 심플 아이보리 | Simple Ivory | #8B7355 | #FFF8DC | 텍스트+배경 | IVORY과 동일 |
| COLOR_I1_RATAN | 라탄 아이보리 | Ratan Ivory | #8B7355 | #FFF8DC | 텍스트+배경 | IVORY과 동일 |
| **COLOR_I2** | **아이보리2** | **IVORY2** | **#A0522D** | **#FAF0E6** | 텍스트+배경 | 더 진한 브라운 + 린넨 배경 |

## 특수 계열 매핑 (동일 색상 적용)

### Simple 계열
- Simple Gray1 → COLOR_04 (Gray1)
- Simple Gray2 → COLOR_05 (Gray2)
- Simple Butter → COLOR_23 (Butter)
- Simple Navy1 → COLOR_10 (NAVY1)
- Simple Pink3 → COLOR_25 (Pink(P3))
- Simple Blue3 → COLOR_12 (Modern Blue(B3))
- Simple Mint1 → COLOR_16 (Mint1)

### Ratan 계열
- Ratan Brown → COLOR_02 (Brown)
- Ratan Butter → COLOR_23 (Butter)

### Decos 계열
- Decos Butter → COLOR_23 (Butter)
- Decos NAVY2 → COLOR_11 (Navy2)
- Decos Gray2 → COLOR_05 (Gray2)
- Decos Pink3 → COLOR_25 (Pink(P3))
- Decos NAVY1 → COLOR_10 (NAVY1)
- Decos Gray1 → COLOR_04 (Gray1)

### Happy 계열
- Happy (B3) → COLOR_12 (Modern Blue(B3))
- Happy (Butter) → COLOR_23 (Butter)
- Happy (Gray2) → COLOR_05 (Gray2)
- Happy (PINK3) → COLOR_25 (Pink(P3))

### Extra Large Body 계열
- Extra Large Body (Blue3) → COLOR_12 (Modern Blue(B3))
- Extra Large Body (Butter) → COLOR_23 (Butter)
- Extra Large Body (Gray2) → COLOR_05 (Gray2)
- Extra Large Body (PINK3) → COLOR_25 (Pink(P3))

## 코드 구현용 색상 맵 객체 구조

```javascript
const COLOR_MAP = {
  // 일반 색상 (텍스트만)
  "Black": { text: "#000000", bg: "#FFFFFF" },
  "Brown": { text: "#8B4513", bg: "#FFFFFF" },
  "Dark Brown": { text: "#5D4037", bg: "#FFFFFF" },
  "Gray1": { text: "#808080", bg: "#FFFFFF" },
  "Gray2": { text: "#A9A9A9", bg: "#FFFFFF" },
  "Gray3": { text: "#696969", bg: "#FFFFFF" },
  // ... (나머지 일반 색상)
  
  // 화이트/아이보리 계열 (텍스트+배경)
  "WHITE1": { text: "#000000", bg: "#F5F5F5" },
  "Simple White": { text: "#000000", bg: "#F5F5F5" },
  "WHITE2": { text: "#696969", bg: "#FFF8DC" },
  "IVORY": { text: "#8B7355", bg: "#FFF8DC" },
  "Simple Ivory": { text: "#8B7355", bg: "#FFF8DC" },
  "IVORY2": { text: "#A0522D", bg: "#FAF0E6" },
};
```

## 검토 요청 사항
1. 모든 HEX 코드가 실제 색상과 일치하는지 확인
2. 화이트/아이보리 구분 방식 적절한지 확인
3. 누락된 색상 있는지 확인
4. 특수 계열 매핑 적절한지 확인

## 생성 정보
- 생성일: 2026-04-16
- 적용 원칙: 방안 A (텍스트+배경 단일 적용)
- 상태: 최종 검토 대기
- 다음 단계: 검토 완료 후 Claude Code로 코드 구현 시작