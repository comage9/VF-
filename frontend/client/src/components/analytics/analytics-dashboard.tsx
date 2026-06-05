import React, { useState, useEffect } from 'react';
import { Card, Spin, message } from 'antd';
import './analytics-dashboard.css';

interface AnalysisData {
  id: number;
  date: string;
  period: 'daily' | 'weekly' | 'monthly';
  summary: {
    total_outbound?: number;
    trend?: string;
    prev_period_change?: number;
  };
  chart_data?: {
    daily?: { date: string; quantity: number }[];
    categories?: { name: string; value: number }[];
  };
  table_data?: {
    headers?: string[];
    rows?: (string | number)[][];
  };
  insights: string[];
  recommendations: string[];
  created_at: string;
}

interface Props {
  period?: 'daily' | 'weekly' | 'monthly';
}

const AnalyticsDashboard: React.FC<Props> = ({ period = 'daily' }) => {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(period);

  useEffect(() => {
    fetchData();
  }, [selectedPeriod]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics/list?period=${selectedPeriod}`);
      const result = await response.json();
      
      if (result.success && result.data.length > 0) {
        setData(result.data[0]); // 가장 최근 데이터
      } else {
        setData(null);
      }
    } catch (error) {
      console.error('Analytics data fetch error:', error);
      message.error('분석 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="analytics-loading">
        <Spin size="large" />
        <p>분석 데이터를 불러오는 중...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="analytics-empty">
        <p>📊 분석 데이터가 없습니다.</p>
        <p>NotebookLM에서 분석完成后 자동으로 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      {/* 헤더 */}
      <div className="analytics-header">
        <h2>📊 VF 출고 분석</h2>
        <select 
          value={selectedPeriod} 
          onChange={(e) => setSelectedPeriod(e.target.value as any)}
          className="period-selector"
        >
          <option value="daily">일별</option>
          <option value="weekly">주간</option>
          <option value="monthly">월간</option>
        </select>
      </div>

      {/* 요약 카드 */}
      <div className="analytics-cards">
        <Card className="summary-card">
          <div className="card-title">총 출고량</div>
          <div className="card-value">
            {data.summary?.total_outbound?.toLocaleString() ?? '-'}개
          </div>
        </Card>
        
        <Card className="summary-card">
          <div className="card-title">전기간 대비</div>
          <div className={`card-value ${data.summary?.trend === 'up' ? 'trend-up' : 'trend-down'}`}>
            {data.summary?.trend === 'up' ? '▲' : '▼'}{' '}
            {Math.abs(data.summary?.prev_period_change ?? 0).toFixed(1)}%
          </div>
        </Card>
        
        <Card className="summary-card">
          <div className="card-title">인사이트</div>
          <div className="card-value">{data.insights.length}개</div>
        </Card>
      </div>

      {/* 인사이트 */}
      <Card className="insights-card" title="💡 주요 인사이트">
        <ul className="insights-list">
          {data.insights.map((insight, index) => (
            <li key={index}>{insight}</li>
          ))}
        </ul>
      </Card>

      {/* 권장 액션 */}
      <Card className="recommendations-card" title="🚀 권장 액션">
        <ul className="recommendations-list">
          {data.recommendations.map((rec, index) => (
            <li key={index}>{rec}</li>
          ))}
        </ul>
      </Card>

      {/* 데이터 테이블 */}
      {data.table_data?.rows && data.table_data.rows.length > 0 && (
        <Card className="table-card" title="📋 상세 데이터">
          <table className="data-table">
            <thead>
              <tr>
                {data.table_data.headers?.map((header, index) => (
                  <th key={index}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.table_data.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
