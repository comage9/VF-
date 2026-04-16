import React from 'react';
import ProgressBar, { getProgressColor } from './ProgressBar';
import StatusIndicator from './StatusIndicator';
import { getColorStyle } from './color-mapping-utility';
import { calculateProgress } from './quantity-calculator';
import { ProductionItem } from './quantity-calculator';

/**
 * ProgressCard 컴포넌트 Props
 */
export interface ProgressCardProps {
  /** 생산 항목 데이터 */
  item: ProductionItem;
  /** 카드 너비 (기본값: 100%) */
  width?: string | number;
  /** 사용자 정의 클래스 이름 */
  className?: string;
  /** 상세 정보 표시 여부 (기본값: true) */
  showDetails?: boolean;
  /** 진행 바 높이 (기본값: 8px) */
  progressBarHeight?: string | number;
  /** 둥근 모서리 (기본값: true) */
  rounded?: boolean;
}

/**
 * 진행률에 따른 상태 타입 결정
 */
export function getProgressStatusType(progressPercent: number): 'in-progress' | 'delayed' | 'completed' | 'problem' {
  if (progressPercent >= 100) return 'completed';
  if (progressPercent > 70) return 'in-progress';
  if (progressPercent > 30) return 'in-progress';
  return 'delayed';
}

/**
 * ProgressCard 컴포넌트
 * 생산 항목의 진행 상황을 카드 형태로 표시
 */
const ProgressCard: React.FC<ProgressCardProps> = ({
  item,
  width = '100%',
  className = '',
  showDetails = true,
  progressBarHeight = '8px',
  rounded = true,
}) => {
  // 수량 및 진행률 계산
  const progressResult = calculateProgress(item);

  // 색상 스타일 가져오기
  const colorStyle = getColorStyle(item.color);
  const textColor = colorStyle?.textColor || '#374151';

  // 진행 상태 결정
  const statusType = getProgressStatusType(progressResult.progressPercent);

  // 카드 스타일
  const cardStyle: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    backgroundColor: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: rounded ? '12px' : '0',
    padding: '16px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    transition: 'box-shadow 0.2s ease',
  };

  // 헤더 스타일 (제품명 + 색상)
  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  };

  const productNameStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: '600',
    color: '#111827',
    marginRight: '8px',
  };

  const colorNameStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: '500',
    color: textColor,
  };

  // 상태 표시기 스타일
  const statusContainerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  };

  const statusLabelStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#6B7280',
  };

  // 진행 바 스타일
  const progressBarContainerStyle: React.CSSProperties = {
    marginBottom: '12px',
  };

  // 수량 정보 스타일
  const quantityInfoStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    fontSize: '13px',
  };

  const quantityItemStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  };

  const quantityLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#9CA3AF',
    marginBottom: '2px',
  };

  const quantityValueStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  };

  // 수량 표시용 텍스트 생성
  const formatQuantityText = (boxes: number, pieces: number): string => {
    if (boxes > 0) {
      return `${boxes}박스 ${pieces}개`;
    }
    return `${pieces}개`;
  };

  return (
    <div className={`progress-card ${className}`} style={cardStyle}>
      {/* 헤더: 제품명 + 색상 */}
      <div className="progress-card-header" style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <h3 className="progress-card-product-name" style={productNameStyle}>
            {item.productName}
          </h3>
          <span className="progress-card-color-name" style={colorNameStyle}>
            ({item.color})
          </span>
        </div>
        <StatusIndicator status={statusType} showText={false} />
      </div>

      {/* 상태 표시 */}
      <div className="progress-card-status" style={statusContainerStyle}>
        <span className="progress-card-status-label" style={statusLabelStyle}>
          진행 상태
        </span>
        <StatusIndicator status={statusType} showText={true} />
      </div>

      {/* 진행 바 */}
      <div className="progress-card-progress-bar" style={progressBarContainerStyle}>
        <ProgressBar
          progress={progressResult.progressPercent}
          height={progressBarHeight}
          showTooltip={false}
          showLabel={true}
          animated={true}
          rounded={rounded}
        />
      </div>

      {/* 수량 정보 */}
      {showDetails && (
        <div className="progress-card-quantity-info" style={quantityInfoStyle}>
          {/* 목표 수량 */}
          <div className="progress-card-quantity-item" style={quantityItemStyle}>
            <span className="progress-card-quantity-label" style={quantityLabelStyle}>
              목표
            </span>
            <span className="progress-card-quantity-value" style={quantityValueStyle}>
              {formatQuantityText(progressResult.boxes, progressResult.remainingPieces + progressResult.boxes * progressResult.piecesPerBox)}
            </span>
          </div>

          {/* 실적 수량 */}
          <div className="progress-card-quantity-item" style={quantityItemStyle}>
            <span className="progress-card-quantity-label" style={quantityLabelStyle}>
              실적
            </span>
            <span className="progress-card-quantity-value" style={{ ...quantityValueStyle, color: getProgressColor(progressResult.progressPercent) }}>
              {formatQuantityText(progressResult.completedBoxes, progressResult.currentQuantity - progressResult.completedBoxes * progressResult.piecesPerBox)}
            </span>
          </div>

          {/* 잔량 */}
          <div className="progress-card-quantity-item" style={quantityItemStyle}>
            <span className="progress-card-quantity-label" style={quantityLabelStyle}>
              잔량
            </span>
            <span className="progress-card-quantity-value" style={{ ...quantityValueStyle, color: '#EF4444' }}>
              {formatQuantityText(Math.floor(progressResult.remainingTarget / progressResult.piecesPerBox), progressResult.remainingTarget % progressResult.piecesPerBox)}
            </span>
          </div>
        </div>
      )}

      {/* 진행률 텍스트 */}
      <div style={{
        marginTop: '8px',
        fontSize: '12px',
        color: '#6B7280',
        textAlign: 'right',
      }}>
        {progressResult.progressPercent.toFixed(1)}%
      </div>
    </div>
  );
};

export default ProgressCard;
