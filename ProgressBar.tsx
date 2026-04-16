import React from 'react';

/**
 * 진행 바 컴포넌트
 * 진행률에 따른 색상 변화와 툴팁 지원
 */

export interface ProgressBarProps {
  /** 진행률 (0-100) */
  progress: number;
  /** 진행 바 너비 (기본값: 100%) */
  width?: string | number;
  /** 진행 바 높이 (기본값: 8px) */
  height?: string | number;
  /** 툴팁 표시 여부 (기본값: true) */
  showTooltip?: boolean;
  /** 라벨 표시 여부 (기본값: false) */
  showLabel?: boolean;
  /** 사용자 정의 클래스 이름 */
  className?: string;
  /** 애니메이션 효과 사용 여부 (기본값: true) */
  animated?: boolean;
  /** rounded corners (기본값: true) */
  rounded?: boolean;
}

/**
 * 진행률에 따른 색상 반환
 * - 0-30%: 빨간색 (#FF6B6B)
 * - 31-70%: 노란색 (#FFD93D)
 * - 71-99%: 초록색 (#6BCF7F)
 * - 100%: 파란색 (#4D96FF)
 */
export function getProgressColor(progress: number): string {
  if (progress >= 100) return '#4D96FF';
  if (progress > 70) return '#6BCF7F';
  if (progress > 30) return '#FFD93D';
  return '#FF6B6B';
}

/**
 * 진행률 상태 텍스트 반환
 */
export function getProgressStatus(progress: number): string {
  if (progress >= 100) return '완료';
  if (progress > 70) return '양호';
  if (progress > 30) return '진행중';
  return '지연';
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  width = '100%',
  height = '8px',
  showTooltip = true,
  showLabel = false,
  className = '',
  animated = true,
  rounded = true,
}) => {
  // 진행률 유효성 검사
  const safeProgress = Math.min(100, Math.max(0, progress));
  const progressColor = getProgressColor(safeProgress);
  const progressStatus = getProgressStatus(safeProgress);

  // 스타일 객체 생성
  const containerStyle: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    backgroundColor: '#E5E7EB',
    borderRadius: rounded ? `${height}px` : '0',
    overflow: 'hidden',
    position: 'relative',
  };

  const barStyle: React.CSSProperties = {
    width: `${safeProgress}%`,
    height: '100%',
    backgroundColor: progressColor,
    transition: animated ? 'width 0.5s ease-out, background-color 0.3s ease' : 'none',
    borderRadius: rounded ? `${height}px` : '0',
    position: 'relative',
  };

  // 툴팁 스타일
  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    top: '-40px',
    left: `${safeProgress}%`,
    transform: 'translateX(-50%)',
    backgroundColor: '#1F2937',
    color: '#FFFFFF',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    zIndex: 10,
    pointerEvents: 'none',
    opacity: showTooltip ? 1 : 0,
    transition: 'opacity 0.2s ease',
  };

  const tooltipArrowStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '-4px',
    left: '50%',
    transform: 'translateX(-50%)',
    borderLeft: '4px solid transparent',
    borderRight: '4px solid transparent',
    borderTop: '4px solid #1F2937',
  };

  return (
    <div className={`progress-bar-container ${className}`} style={containerStyle}>
      {/* 툴팁 */}
      {showTooltip && (
        <div className="progress-tooltip" style={tooltipStyle}>
          <div className="tooltip-text">
            {safeProgress.toFixed(1)}% - {progressStatus}
          </div>
          <div className="tooltip-arrow" style={tooltipArrowStyle} />
        </div>
      )}

      {/* 진행 바 */}
      <div className="progress-bar-fill" style={barStyle} />

      {/* 라벨 */}
      {showLabel && (
        <div
          className="progress-label"
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '11px',
            color: '#6B7280',
            fontWeight: '500',
          }}
        >
          {safeProgress.toFixed(1)}%
        </div>
      )}
    </div>
  );
};

export default ProgressBar;