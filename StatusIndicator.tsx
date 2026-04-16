import React from 'react';

type StatusType = 'in-progress' | 'delayed' | 'completed' | 'problem';

interface StatusIndicatorProps {
  status: StatusType;
  showText?: boolean;
}

const statusConfig = {
  'in-progress': {
    color: '#10B981', // 초록
    label: '진행중'
  },
  'delayed': {
    color: '#F59E0B', // 주황
    label: '지연'
  },
  'completed': {
    color: '#6B7280', // 회색
    label: '완료'
  },
  'problem': {
    color: '#EF4444', // 빨강
    label: '문제'
  }
};

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, showText = false }) => {
  const config = statusConfig[status];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: config.color,
        }}
      />
      {showText && (
        <span style={{
          fontSize: '14px',
          color: '#374151',
          fontWeight: 500
        }}>
          {config.label}
        </span>
      )}
    </div>
  );
};

export default StatusIndicator;
