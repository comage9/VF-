# 모바일 카드 컴포넌트 상세 명세서 (Claude Code 작업용)

## 컴포넌트 개요
VF 생산 계획 페이지의 모바일 뷰에서 사용할 생산 항목 카드 컴포넌트입니다.

## 핵심 기능 요구사항

### 1. 색상 컬러링 통합
- **색상명 표시**: 실제 컬러로 텍스트 표시 (color-mapping-utility.ts 활용)
- **화이트/아이보리 구분**: 방안 A 적용 (텍스트+배경)
- **동적 스타일 적용**: `getColorStyle()` 함수로 스타일 동적 적용

### 2. 수량 정보 표시
- **다중 단위 표시**: "30개 56박스 1p" 형식
- **수량 계산**: `calculateQuantity()` 함수 활용
- **박스/팔레트 변환**: 제품별 박스당 수량 적용

### 3. 진행률 통합
- **ProgressBarComponent 통합**: 진행률 바 표시
- **실적/잔량**: "실적: 32박스 | 잔량: 24박스"
- **상태 표시**: StatusIndicatorComponent 통합

### 4. 모바일 최적화
- **터치 인터페이스**: 탭/스와이프 가능
- **반응형 레이아웃**: 모바일 화면에 최적화
- **성능 최적화**: 이미지/데이터 지연 로딩

## 컴포넌트 구조

### MobileProductionCard (메인 카드 컴포넌트)
```typescript
interface MobileProductionCardProps {
  item: ProductionItem;
  onTap?: () => void;
  onStatusChange?: (newStatus: string) => void;
  showDetails?: boolean;
}

// 포함된 하위 컴포넌트:
// 1. ColorHeader: 색상명 컬러링 헤더
// 2. QuantityDisplay: 수량 정보 표시
// 3. ProgressSection: 진행률 바 및 상태
// 4. ActionButtons: 작업 버튼 (수량 입력, 완료 등)
```

### ColorHeader 컴포넌트
- 색상명 텍스트 (컬러 적용)
- 제품명 표시
- 배치번호 표시 (color2)

### QuantityDisplay 컴포넌트
- 낱개/박스/팔레트 수량 표시
- 계산식: `낱개 → 박스 → 팔레트`
- 남은 수량 강조 표시

### ProgressSection 컴포넌트  
- ProgressBarComponent 통합
- StatusIndicatorComponent 통합
- 실적/잔량 텍스트 표시

### ActionButtons 컴포넌트
- 수량 입력 버튼
- 작업 완료 버튼
- 상세 보기 버튼

## 데이터 인터페이스

```typescript
interface ProductionItem {
  id: number;
  date: string;
  machine_number: string;
  product_name: string;
  color1: string;
  color2: string;
  unit: string;
  quantity: number;
  unit_quantity: number;
  total: number;
  status: 'started' | 'completed' | 'delayed';
  start_time: string;
  end_time: string | null;
}

// 예시 데이터 (vf_production_data.json 참조)
```

## 스타일 요구사항

### 모바일 카드 디자인
- **카드 크기**: 모바일 화면 너비 기준
- **여백**: 16px 패딩
- **그림자**: subtle shadow (elevation)
- **테두리**: 1px solid #E0E0E0
- **호버 효과**: 터치 피드백

### 색상 팔레트
- **배경**: #FFFFFF
- **텍스트**: #333333
- **보조 텍스트**: #666666
- **강조 색상**: #2196F3 (파란색)
- **경고 색상**: #FF9800 (주황색)
- **에러 색상**: #F44336 (빨간색)

### 반응형 브레이크포인트
- **모바일**: < 768px (100% width)
- **태블릿**: 768px - 1024px (50% width)
- **데스크톱**: > 1024px (33.33% width)

## 구현 우선순위

### P0 (필수)
1. 기본 카드 레이아웃
2. 색상 컬러링 적용
3. 수량 정보 표시
4. 진행률 바 통합

### P1 (중요)
1. 상태 표시기 통합
2. 반응형 디자인
3. 터치 인터페이스
4. 성능 최적화

### P2 (선택)
1. 애니메이션 효과
2. 오프라인 지원
3. 캐싱 기능
4. 접근성 지원

## 테스트 요구사항

### 단위 테스트
- 색상 매핑 테스트
- 수량 계산 테스트
- 컴포넌트 렌더링 테스트

### 통합 테스트
- 실제 데이터 연동 테스트
- 모바일 뷰 테스트
- 터치 인터페이스 테스트

### 성능 테스트
- 렌더링 성능
- 메모리 사용량
- 네트워크 요청 최적화

## Claude Code 작업 지시 시 참고사항
- 기존 구현된 유틸리티 활용
- 실제 VF 프로젝트 데이터 구조 고려
- 모바일 사용자 경험 우선
- 확장 가능한 컴포넌트 설계