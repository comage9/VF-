# VF 색상 컬러 매핑 제안안

## 개요
VF 생산 계획 페이지 모바일 UI에서 색상 명칭을 실제 컬러로 표시하기 위한 HEX 코드 배정 제안입니다.

## 컬러 매핑 테이블 (제안)

| 색상 명칭 (한글) | 영문명 | HEX 코드 | 비고 |
|-----------------|--------|----------|------|
| 블랙 | Black | #000000 | 순수 검정 |
| 브라운 | Brown | #8B4513 | 어두운 갈색 |
| 다크 브라운 | Dark Brown | #5D4037 | 더 어두운 갈색 |
| 그레이1 | Gray1 | #808080 | 중간 회색 |
| 그레이2 | Gray2 | #A9A9A9 | 연한 회색 |
| 그레이3 | Gray3 | #696969 | 어두운 회색 |
| 그레이4 | Gray4 | #D3D3D3 | 아주 연한 회색 |
| 그린 | Green | #228B22 | 숲 녹색 |
| 다크 그린 | Dark Green | #006400 | 어두운 녹색 |
| 네이비1 | NAVY1 | #000080 | 짙은 남색 |
| 네이비2 | Navy2 | #191970 | 미드나이트 블루 |
| 모던 블루(B3) | Modern Blue(B3) | #1E90FF | 도저 블루 |
| 블루(B2) | BLUE(B2) | #4169E1 | 로열 블루 |
| EU 블루 | EU BLUE | #4682B4 | 스틸 블루 |
| 다크 O | Dark O | #2F4F4F | 다크 슬레이트 그레이 |
| 민트1 | Mint1 | #98FB98 | 연한 민트 |
| 민트2 | Mint2 | #3CB371 | 미디엄 시그린 |
| 바이올렛 | Violet | #8A2BE2 | 블루 바이올렛 |
| 베이지 | Baige | #F5F5DC | 베이지 |
| 오렌지 | Orange | #FFA500 | 오렌지 |
| EU 옐로 | EU YELLO | #FFD700 | 골드 |
| 옐로 | Yello | #FFFF00 | 순수 노랑 |
| 버터 | Butter | #FFFACD | 레몬 쉬폰 |
| 핑크(P2) | Pink(P2) | #FFC0CB | 핑크 |
| 핑크(P3) | Pink(P3) | #DB7093 | 페일 바이올렛 레드 |
| 카키(BRIDA) | Kaki(BRIDA) | #C3B091 | 카키 |
| 오렌지(BRIDA) | Orange(BRIDA) | #FF8C00 | 다크 오렌지 |
| 옐로(BRIDA) | Yello(BRIDA) | #FFD700 | 골드 |
| O | O | #708090 | 슬레이트 그레이 |
| 라탄 딥 그린 | Ratan Deep Green | #2E8B57 | 씨 그린 |
| 네이비(BRIDA) | Navy(BRIDA) | #000080 | 짙은 남색 |

## 화이트/아이보리 계열 (식별 문제 해결 방안)

### 문제점
- WHITE1 (WHITE 180)과 IVORY (IVORY 1060)이 흰색 배경에서 구분 어려움
- WHITE2 (IVORY 1154)는 실제로 아이보리 색상

### 제안 방안 A: 텍스트 컬러 + 배경 색상
| 색상 | 텍스트 HEX | 배경 HEX | 설명 |
|------|-----------|----------|------|
| WHITE1 | #000000 | #F5F5F5 | 검정 텍스트 + 연한 회색 배경 |
| WHITE2 | #8B7355 | #FFF8DC | 아이보리 브라운 텍스트 + 아이보리 배경 |
| IVORY | #8B7355 | #FFF8DC | 아이보리 브라운 텍스트 + 아이보리 배경 |
| IVORY2 | #A0522D | #FAF0E6 | 더 진한 아이보리 브라운 + 린넨 배경 |

### 제안 방안 B: 테두리 추가
| 색상 | 텍스트 HEX | 테두리 스타일 | 설명 |
|------|-----------|---------------|------|
| WHITE1 | #000000 | 1px solid #D3D3D3 | 검정 텍스트 + 연한 회색 테두리 |
| WHITE2 | #696969 | 1px solid #D3D3D3 | 어두운 회색 텍스트 |
| IVORY | #8B7355 | 1px solid #D3D3D3 | 아이보리 브라운 텍스트 |
| IVORY2 | #A0522D | 1px dashed #D3D3D3 | 점선 테두리로 강조 |

### 제안 방안 C: 아이콘 추가
| 색상 | 텍스트 HEX | 아이콘 | 설명 |
|------|-----------|--------|------|
| WHITE1 | #000000 | ⚪ | 검정 텍스트 + 흰색 원 |
| WHITE2 | #696969 | 🟡 | 회색 텍스트 + 노란 원 |
| IVORY | #8B7355 | 🟠 | 아이보리 브라운 텍스트 + 주황 원 |
| IVORY2 | #A0522D | 🔸 | 진한 브라운 텍스트 + 작은 주황 마름모 |

## 특수 계열 색상

### Simple 계열
- Simple Gray1: #808080 (Gray1과 동일)
- Simple Gray2: #A9A9A9 (Gray2과 동일)
- Simple White: #000000 on #F5F5F5 (WHITE1과 동일)
- Simple Ivory: #8B7355 on #FFF8DC (IVORY과 동일)
- Simple Butter: #FFFACD (Butter과 동일)
- Simple Navy1: #000080 (NAVY1과 동일)
- Simple Pink3: #DB7093 (Pink(P3)과 동일)
- Simple Blue3: #1E90FF (Modern Blue(B3)과 동일)
- Simple Mint1: #98FB98 (Mint1과 동일)

### Ratan 계열
- Ratan White: #000000 on #F5F5F5 (WHITE1과 동일)
- Ratan Ivory: #8B7355 on #FFF8DC (IVORY과 동일)
- Ratan Brown: #8B4513 (Brown과 동일)
- Ratan Butter: #FFFACD (Butter과 동일)

### Decos 계열
- Decos Butter: #FFFACD (Butter과 동일)
- Decos WHITE: #000000 on #F5F5F5 (WHITE1과 동일)
- Decos NAVY2: #191970 (Navy2과 동일)
- Decos Gray2: #A9A9A9 (Gray2과 동일)
- Decos Pink3: #DB7093 (Pink(P3)과 동일)
- Decos NAVY1: #000080 (NAVY1과 동일)
- Decos Gray1: #808080 (Gray1과 동일)

### Happy 계열
- Happy (B3): #1E90FF (Modern Blue(B3)과 동일)
- Happy (Butter): #FFFACD (Butter과 동일)
- Happy (Gray2): #A9A9A9 (Gray2과 동일)
- Happy (PINK3): #DB7093 (Pink(P3)과 동일)

### Extra Large Body 계열
- Extra Large Body (Blue3): #1E90FF
- Extra Large Body (Butter): #FFFACD
- Extra Large Body (Gray2): #A9A9A9
- Extra Large Body (PINK3): #DB7093

### EU 계열
- EU RED: #DC1434 | 크림슨 레드
- EU BLUE: #4682B4 | 스틸 블루
- EU YELLO: #FFD700 | 골드

## 검토 요청 사항
1. **기본 색상 코드** 적절한지 확인
2. **화이트/아이보리 계열** 어떤 방안(A, B, C)으로 진행할지 선택
3. **특수 계열** 동일 색상 매핑 적절한지 확인
4. **누락된 색상** 있는지 확인

## 다음 단계
1. 검토 완료 후 최종 컬러 매핑 테이블 확정
2. 옵시디언 문서 업데이트
3. 코드 구현 시작