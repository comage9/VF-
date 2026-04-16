/**
 * VF 생산 계획 페이지 - 수량 계산 유틸리티
 * 낱개(pcs) → 박스 → 팔레트 변환 계산
 */

export interface QuantityResult {
  /** 원본 낱개 수량 */
  pieces: number;
  /** 계산된 박스 수 */
  boxes: number;
  /** 계산된 팔레트 수 */
  pallets: number;
  /** 박스당 수량 */
  piecesPerBox: number;
  /** 팔레트당 박스 수 */
  boxesPerPallet: number;
  /** 남은 낱개 수 (박스로 안 묶인) */
  remainingPieces: number;
  /** 남은 박스 수 (팔레트로 안 묶인) */
  remainingBoxes: number;
  /** 진행률 (0-100) */
  progressPercent: number;
  /** 표시용 포맷 문자열 */
  displayText: string;
}

export interface ProductionItem {
  /** 제품 ID */
  id: number;
  /** 제품명 */
  productName: string;
  /** 색상 */
  color: string;
  /** 목표 수량 (낱개) */
  targetQuantity: number;
  /** 현재 완료 수량 (낱개) */
  currentQuantity: number;
  /** 박스당 수량 */
  piecesPerBox?: number;
  /** 팔레트당 박스 수 */
  boxesPerPallet?: number;
}

/**
 * 기본 박스/팔레트 설정
 */
export const DEFAULT_SETTINGS = {
  /** 기본 박스당 수량 (제품별로 다를 수 있음) */
  DEFAULT_PIECES_PER_BOX: 30,
  /** 기본 팔레트당 박스 수 */
  DEFAULT_BOXES_PER_PALLET: 20,
} as const;

/**
 * 제품별 박스당 수량 설정
 */
export const PRODUCT_PIECES_PER_BOX: Record<string, number> = {
  // 실제 데이터 기반 설정
  "어반 옷걸이 신규 금형": 30,
  "로코스 L": 4,
  "데크타일": 9,
  "와이드 앞판": 70,
  "와이드 서랍": 180,
  "로코스 M": 8,
  "와이드 프레임": 19,
  "초대형 바디": 270,
  "모던플러스 서랍": 125,
  "슬림 서랍장 서랍 신규": 76,
  "맥스 서랍장 서랍": 9,
  "슬림 서랍장 프레임 신규": 1,
  "모던플러스 앞판": 125,
  "에센셜 앞판": 66,
  "초대형 캡": 66,
  "모던플러스 프레임": 1,
  "오픈 바스켓": 135,
  "슬림형 앞판": 75,
  "바퀴": 200,
  "핸들러 바스켓 와이드(L)": 4,
  "로코스 S": 30,
  "탑백 72L": 25,
  "레브 스토리지 M": 30,
  "해피 바디": 270,
  "핸들러 바스켓 베이직(M)": 4,
  "어반 와이드 옷걸이": 50,
  "목 늘림 방지 옷걸이": 50,
  "해피 캡": 66,
  "북트롤리 하판": 20,
  "맥스 서랍장 프레임": 90,
  "슬림형 프레임": 22,
  "에센셜 서랍": 330,
  "슬림형 서랍": 480,
  "옷정리 트레이": 50,
  "북트롤리 중간판": 20,
  "에센셜 프레임": 38,
  "토이 바디": 125,
  "와이드 상판": 30,
  "탑백 72L,52L 캡": 40,
  "핸들러 바스켓 슬림(S)": 4,
  "탑백 52L": 30,
  "슬라이딩 스텝 L": 10,
  "탑백 24L": 30,
  "신규 모던플러스 프레임": 125,
  "에센셜 상판": 11,
  "레브 스토리지 L": 30,
  "에센셜 기둥": 1,
  "라탄 기본형 앞판": 140,
  "이유": 6,
} as const;

/**
 * 수량 계산 함수
 * @param pieces 낱개 수량
 * @param piecesPerBox 박스당 수량 (기본값: 30)
 * @param boxesPerPallet 팔레트당 박스 수 (기본값: 20)
 * @returns QuantityResult 객체
 */
export function calculateQuantity(
  pieces: number,
  piecesPerBox: number = DEFAULT_SETTINGS.DEFAULT_PIECES_PER_BOX,
  boxesPerPallet: number = DEFAULT_SETTINGS.DEFAULT_BOXES_PER_PALLET
): QuantityResult {
  // 유효성 검사
  if (pieces < 0) pieces = 0;
  if (piecesPerBox <= 0) piecesPerBox = DEFAULT_SETTINGS.DEFAULT_PIECES_PER_BOX;
  if (boxesPerPallet <= 0) boxesPerPallet = DEFAULT_SETTINGS.DEFAULT_BOXES_PER_PALLET;

  // 박스 계산
  const boxes = Math.floor(pieces / piecesPerBox);
  const remainingPieces = pieces % piecesPerBox;

  // 팔레트 계산
  const pallets = Math.floor(boxes / boxesPerPallet);
  const remainingBoxes = boxes % boxesPerPallet;

  // 표시용 텍스트 생성
  const displayText = formatQuantityDisplay(pieces, boxes, pallets, remainingPieces, remainingBoxes);

  return {
    pieces,
    boxes,
    pallets,
    piecesPerBox,
    boxesPerPallet,
    remainingPieces,
    remainingBoxes,
    progressPercent: 0, // 추후 진행률 계산 시 사용
    displayText,
  };
}

/**
 * 생산 항목에 대한 수량 계산
 */
export function calculateProductionQuantity(item: ProductionItem): QuantityResult {
  const piecesPerBox = item.piecesPerBox || 
    PRODUCT_PIECES_PER_BOX[item.productName] || 
    DEFAULT_SETTINGS.DEFAULT_PIECES_PER_BOX;
  
  const boxesPerPallet = item.boxesPerPallet || DEFAULT_SETTINGS.DEFAULT_BOXES_PER_PALLET;
  
  return calculateQuantity(item.targetQuantity, piecesPerBox, boxesPerPallet);
}

/**
 * 현재 진행 상황 계산
 */
export function calculateProgress(currentItem: ProductionItem): QuantityResult & {
  /** 남은 목표 수량 */
  remainingTarget: number;
  /** 완료된 박스 수 */
  completedBoxes: number;
  /** 완료된 팔레트 수 */
  completedPallets: number;
} {
  const targetResult = calculateProductionQuantity(currentItem);
  
  // 현재 완료 수량 계산
  const currentPieces = currentItem.currentQuantity || 0;
  const piecesPerBox = currentItem.piecesPerBox || 
    PRODUCT_PIECES_PER_BOX[currentItem.productName] || 
    DEFAULT_SETTINGS.DEFAULT_PIECES_PER_BOX;
  
  const boxesPerPallet = currentItem.boxesPerPallet || DEFAULT_SETTINGS.DEFAULT_BOXES_PER_PALLET;
  
  const currentResult = calculateQuantity(currentPieces, piecesPerBox, boxesPerPallet);
  
  // 남은 수량 계산
  const remainingTarget = Math.max(0, currentItem.targetQuantity - currentPieces);
  const remainingResult = calculateQuantity(remainingTarget, piecesPerBox, boxesPerPallet);
  
  // 진행률 계산
  const progressPercent = currentItem.targetQuantity > 0 
    ? Math.min(100, (currentPieces / currentItem.targetQuantity) * 100)
    : 0;

  return {
    ...targetResult,
    remainingTarget,
    completedBoxes: currentResult.boxes,
    completedPallets: currentResult.pallets,
    progressPercent,
    displayText: formatProgressDisplay(targetResult, currentResult, remainingResult, progressPercent),
  };
}

/**
 * 수량 표시 포맷팅
 */
function formatQuantityDisplay(
  pieces: number,
  boxes: number,
  pallets: number,
  remainingPieces: number,
  remainingBoxes: number
): string {
  const parts: string[] = [];
  
  // 팔레트 표시
  if (pallets > 0) {
    parts.push(`${pallets}p`);
  }
  
  // 박스 표시
  if (boxes > 0 || remainingBoxes > 0) {
    const totalBoxes = boxes + (remainingBoxes > 0 ? 1 : 0);
    parts.push(`${totalBoxes}박스`);
  }
  
  // 낱개 표시
  if (pieces > 0 || remainingPieces > 0) {
    parts.push(`${pieces}개`);
  }
  
  // 남은 수량 상세 표시 (디버그용)
  const remainingDetails: string[] = [];
  if (remainingBoxes > 0) {
    remainingDetails.push(`${remainingBoxes}박스`);
  }
  if (remainingPieces > 0) {
    remainingDetails.push(`${remainingPieces}개`);
  }
  
  if (remainingDetails.length > 0) {
    return `${parts.join(' ')} (${remainingDetails.join(', ')} 남음)`;
  }
  
  return parts.join(' ');
}

/**
 * 진행 상황 표시 포맷팅
 */
function formatProgressDisplay(
  target: QuantityResult,
  current: QuantityResult,
  remaining: QuantityResult,
  progressPercent: number
): string {
  const targetText = `${target.boxes}박스`;
  const currentText = `${current.boxes}박스`;
  const remainingText = remaining.boxes > 0 ? `${remaining.boxes}박스` : `${remaining.pieces}개`;
  
  return `목표: ${targetText} | 실적: ${currentText} | 잔량: ${remainingText} (${progressPercent.toFixed(1)}%)`;
}

/**
 * 박스/팔레트 설정 가져오기
 */
export function getProductSettings(productName: string): {
  piecesPerBox: number;
  boxesPerPallet: number;
} {
  return {
    piecesPerBox: PRODUCT_PIECES_PER_BOX[productName] || DEFAULT_SETTINGS.DEFAULT_PIECES_PER_BOX,
    boxesPerPallet: DEFAULT_SETTINGS.DEFAULT_BOXES_PER_PALLET,
  };
}

/**
 * 테스트 함수
 */
export function testQuantityCalculator(): void {
  console.log('=== 수량 계산 유틸리티 테스트 ===');
  
  // 테스트 케이스
  const testCases = [
    { pieces: 1000, piecesPerBox: 30, boxesPerPallet: 20 },
    { pieces: 500, piecesPerBox: 30, boxesPerPallet: 20 },
    { pieces: 100, piecesPerBox: 30, boxesPerPallet: 20 },
    { pieces: 50, piecesPerBox: 30, boxesPerPallet: 20 },
    { pieces: 10, piecesPerBox: 30, boxesPerPallet: 20 },
  ];
  
  testCases.forEach((test, index) => {
    const result = calculateQuantity(test.pieces, test.piecesPerBox, test.boxesPerPallet);
    console.log(`테스트 ${index + 1}: ${test.pieces}개 → ${result.displayText}`);
  });
  
  // 생산 항목 테스트
  const productionItem: ProductionItem = {
    id: 1,
    productName: "어반 옷걸이 신규 금형",
    color: "WHITE1",
    targetQuantity: 1124,
    currentQuantity: 500,
  };
  
  const progress = calculateProgress(productionItem);
  console.log(`\\n생산 항목 진행률: ${progress.displayText}`);
}

// 자동 테스트 실행 (브라우저/Node.js 환경)
if (typeof window !== 'undefined' || typeof process !== 'undefined') {
  testQuantityCalculator();
}