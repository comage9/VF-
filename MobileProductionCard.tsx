/**
 * VF 프로젝트 - 모바일 생산 카드 컴포넌트
 * 모바일 화면에 최적화된 생산 항목 카드
 */

import React, { useState } from 'react';
import { getColorStyle, createReactStyle } from './color-mapping-utility';
import { calculateProgress, ProductionItem, QuantityResult } from './quantity-calculator';
import ProgressBar from './ProgressBar';
import StatusIndicator from './StatusIndicator';

export interface MobileProductionCardProps {
  /** 생산 항목 데이터 */
  item: ProductionItem;
  /** 카드 클릭 핸들러 */
  onCardPress?: () => void;
  /** 수량 입력 핸들러 */
  onQuantityInput?: (quantity: number) => void;
  /** 작업 완료 핸들러 */
  onComplete?: () => void;
  /** 확장/축소 상태 */
  expanded?: boolean;
  /** 사용자 정의 클래스 */
  className?: string;
}

/**
 * 모바일 생산 카드 컴포넌트
 */
const MobileProductionCard: React.FC<MobileProductionCardProps> = ({
  item,
  onCardPress,
  onQuantityInput,
  onComplete,
  expanded = false,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [inputQuantity, setInputQuantity] = useState<string>('');

  // 수량 계산
  const progressData = calculateProgress(item);
  const colorStyle = getColorStyle(item.color);
  const reactStyle = colorStyle ? createReactStyle(item.color) : {};

  // 진행률에 따른 상태 결정
  const getStatus = (): 'in-progress' | 'delayed' | 'completed' | 'problem' => {
    if (progressData.progressPercent >= 100) return 'completed';
    if (progressData.progressPercent > 70) return 'in-progress';
    if (progressData.progressPercent > 30) return 'in-progress';
    if (progressData.progressPercent === 0) return 'problem';
    return 'delayed';
  };

  // 카드 탭 핸들러
  const handleCardPress = () => {
    if (onCardPress) {
      onCardPress();
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  // 수량 입력 핸들러
  const handleQuantityInput = () => {
    if (inputQuantity && onQuantityInput) {
      const quantity = parseInt(inputQuantity, 10);
      if (!isNaN(quantity) && quantity > 0) {
        onQuantityInput(quantity);
        setInputQuantity('');
      }
    }
  };

  // 작업 완료 핸들러
  const handleComplete = () => {
    if (onComplete) {
      onComplete();
    }
  };

  // 수량 표시 텍스트 생성
  const getQuantityText = (data: QuantityResult): string => {
    const parts: string[] = [];
    
    if (data.pallets > 0) {
      parts.push(`${data.pallets}p`);
    }
    
    if (data.boxes > 0) {
      parts.push(`${data.boxes}박스`);
    }
    
    if (data.pieces > 0) {
      parts.push(`${data.pieces}개`);
    }
    
    return parts.join(' ');
  };

  return (
    <div 
      className={`mobile-production-card ${className}`}
      onClick={handleCardPress}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleCardPress();
        }
      }}
    >
      {/* 카드 헤더 - 제품명 및 색상 */}
      <div className="card-header">
        <div className="product-info">
          <h3 className="product-name">{item.productName}</h3>
          <div 
            className="color-chip"
            style={reactStyle}
          >
            <span className="color-text">{item.color}</span>
            {item.color2 && (
              <span className="color-batch">({item.color2})</span>
            )}
          </div>
        </div>
        
        <div className="status-indicator">
          <StatusIndicator status={getStatus()} showText={true} />
        </div>
      </div>

      {/* 수량 정보 */}
      <div className="quantity-section">
        <div className="quantity-display">
          <div className="target-quantity">
            <span className="label">목표:</span>
            <span className="value">{getQuantityText(progressData)}</span>
          </div>
          
          <div className="current-quantity">
            <span className="label">실적:</span>
            <span className="value">{progressData.completedBoxes}박스</span>
            <span className="sub-value">({progressData.currentQuantity}개)</span>
          </div>
          
          <div className="remaining-quantity">
            <span className="label">잔량:</span>
            <span className="value highlight">{progressData.remainingTarget}개</span>
            <span className="sub-value">({progressData.remainingBoxes}박스)</span>
          </div>
        </div>
      </div>

      {/* 진행률 바 */}
      <div className="progress-section">
        <ProgressBar 
          progress={progressData.progressPercent}
          height="12px"
          showLabel={true}
          animated={true}
        />
        <div className="progress-text">
          {progressData.progressPercent.toFixed(1)}% 완료
        </div>
      </div>

      {/* 확장 영역 (수량 입력 등) */}
      {isExpanded && (
        <div className="expanded-section">
          <div className="input-section">
            <div className="input-group">
              <label htmlFor="quantity-input">수량 입력 (개):</label>
              <div className="input-with-button">
                <input
                  id="quantity-input"
                  type="number"
                  value={inputQuantity}
                  onChange={(e) => setInputQuantity(e.target.value)}
                  placeholder="완료 수량"
                  min="1"
                />
                <button
                  type="button"
                  onClick={handleQuantityInput}
                  disabled={!inputQuantity}
                  className="input-button"
                >
                  추가
                </button>
              </div>
            </div>
            
            <div className="action-buttons">
              <button
                type="button"
                onClick={handleComplete}
                className="complete-button"
                disabled={progressData.progressPercent < 100}
              >
                작업 완료
              </button>
              
              <button
                type="button"
                className="details-button"
              >
                상세 보기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 터치 힌트 */}
      <div className="touch-hint">
        <span className="hint-text">터치하여 {isExpanded ? '접기' : '펼치기'}</span>
      </div>

      <style jsx>{`
        .mobile-production-card {
          background-color: #FFFFFF;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          margin: 12px 0;
          padding: 16px;
          transition: all 0.3s ease;
          border: 1px solid #E0E0E0;
          cursor: pointer;
          user-select: none;
        }

        .mobile-production-card:active {
          transform: scale(0.98);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .product-info {
          flex: 1;
        }

        .product-name {
          font-size: 16px;
          font-weight: 600;
          color: #333333;
          margin: 0 0 8px 0;
          line-height: 1.3;
        }

        .color-chip {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
        }

        .color-text {
          margin-right: 4px;
        }

        .color-batch {
          font-size: 12px;
          opacity: 0.8;
        }

        .status-indicator {
          margin-left: 8px;
        }

        .quantity-section {
          margin: 16px 0;
          padding: 12px;
          background-color: #F8F9FA;
          border-radius: 8px;
        }

        .quantity-display {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
        }

        .target-quantity,
        .current-quantity,
        .remaining-quantity {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .label {
          font-size: 12px;
          color: #666666;
          margin-bottom: 4px;
        }

        .value {
          font-size: 14px;
          font-weight: 600;
          color: #333333;
        }

        .value.highlight {
          color: #FF6B6B;
          font-weight: 700;
        }

        .sub-value {
          font-size: 11px;
          color: #888888;
          margin-top: 2px;
        }

        .progress-section {
          margin: 16px 0;
        }

        .progress-text {
          text-align: center;
          font-size: 12px;
          color: #666666;
          margin-top: 4px;
        }

        .expanded-section {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #E0E0E0;
          animation: slideDown 0.3s ease;
        }

        .input-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .input-group label {
          font-size: 14px;
          color: #333333;
          font-weight: 500;
        }

        .input-with-button {
          display: flex;
          gap: 8px;
        }

        .input-with-button input {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }

        .input-with-button input:focus {
          border-color: #4F46E5;
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
        }

        .input-button {
          padding: 10px 16px;
          background-color: #4F46E5;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .input-button:hover:not(:disabled) {
          background-color: #4338CA;
        }

        .input-button:disabled {
          background-color: #9CA3AF;
          cursor: not-allowed;
        }

        .action-buttons {
          display: flex;
          gap: 8px;
        }

        .complete-button,
        .details-button {
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .complete-button {
          background-color: #10B981;
          color: white;
        }

        .complete-button:hover:not(:disabled) {
          background-color: #0DA271;
        }

        .complete-button:disabled {
          background-color: #9CA3AF;
          cursor: not-allowed;
        }

        .details-button {
          background-color: #F3F4F6;
          color: #4B5563;
          border: 1px solid #D1D5DB;
        }

        .details-button:hover {
          background-color: #E5E7EB;
        }

        .touch-hint {
          text-align: center;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px dashed #E5E7EB;
        }

        .hint-text {
          font-size: 11px;
          color: #9CA3AF;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* 모바일 반응형 */
        @media (max-width: 480px) {
          .mobile-production-card {
            padding: 12px;
            margin: 8px 0;
          }

          .product-name {
            font-size: 15px;
          }

          .quantity-display {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .target-quantity,
          .current-quantity,
          .remaining-quantity {
            align-items: flex-start;
          }

          .action-buttons {
            flex-direction: column;
          }
        }

        @media (min-width: 481px) and (max-width: 768px) {
          .mobile-production-card {
            margin: 10px 0;
          }
        }
      `}</style>
    </div>
  );
};

export default MobileProductionCard;