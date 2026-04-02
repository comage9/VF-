import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Download, FileText, Calendar, Package } from 'lucide-react';

interface CsvExportProps {
  data: any[];
  filename: string;
  headers?: Record<string, string>;
  className?: string;
  disabled?: boolean;
}

export function CsvExportButton({ data, filename, headers, className, disabled }: CsvExportProps) {
  const [isExporting, setIsExporting] = useState(false);

  const exportToCsv = () => {
    setIsExporting(true);
    
    try {
      if (!data || data.length === 0) {
        alert('내보낼 데이터가 없습니다.');
        return;
      }

      // CSV 헤더 생성
      const keys = Object.keys(data[0]);
      const csvHeaders = keys.map(key => headers?.[key] || key);
      
      // CSV 데이터 변환
      const csvContent = [
        csvHeaders.join(','), // 헤더 행
        ...data.map(row => 
          keys.map(key => {
            const value = row[key];
            // 쉼표나 줄바꿈이 포함된 경우 따옴표로 감싸기
            if (typeof value === 'string' && (value.includes(',') || value.includes('\n'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value || '';
          }).join(',')
        )
      ].join('\n');

      // BOM 추가 (한글 인코딩 문제 해결)
      const bom = '\uFEFF';
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
      
      // 파일 다운로드
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('CSV 내보내기 오류:', error);
      alert('CSV 내보내기 중 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      onClick={exportToCsv}
      disabled={disabled || isExporting || !data || data.length === 0}
      className={className}
      variant="outline"
    >
      <Download className="w-4 h-4 mr-2" />
      {isExporting ? '내보내는 중...' : 'CSV 내보내기'}
    </Button>
  );
}

interface CsvImportProps {
  onImport: (data: any[]) => void;
  expectedHeaders?: string[];
  className?: string;
}

export function CsvImportButton({ onImport, expectedHeaders, className }: CsvImportProps) {
  const [isImporting, setIsImporting] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        alert('유효한 CSV 파일이 아닙니다.');
        return;
      }

      // 헤더와 데이터 분리
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const dataRows = lines.slice(1);

      // 예상 헤더 검증
      if (expectedHeaders && expectedHeaders.length > 0) {
        const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) {
          alert(`필수 헤더가 누락되었습니다: ${missingHeaders.join(', ')}`);
          return;
        }
      }

      // 데이터 파싱
      const parsedData = dataRows.map((row, index) => {
        const values = row.split(',').map(v => v.trim().replace(/"/g, ''));
        const rowData: any = {};
        
        headers.forEach((header, i) => {
          rowData[header] = values[i] || '';
        });
        
        return rowData;
      });

      onImport(parsedData);
      
    } catch (error) {
      console.error('CSV 가져오기 오류:', error);
      alert('CSV 파일 처리 중 오류가 발생했습니다.');
    } finally {
      setIsImporting(false);
      // 파일 입력 초기화
      event.target.value = '';
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        disabled={isImporting}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <Button variant="outline" disabled={isImporting}>
        <FileText className="w-4 h-4 mr-2" />
        {isImporting ? '가져오는 중...' : 'CSV 가져오기'}
      </Button>
    </div>
  );
}

// 사전 정의된 내보내기 템플릿
export const csvTemplates = {
  production: {
    headers: {
      date: '일자',
      machineNumber: '기계번호',
      moldNumber: '금형 번호',
      productName: '제품명',
      productNameEng: '제품명(영문)',
      color1: '색상1',
      color2: '색상2',
      unit: '단위',
      quantity: '수량',
      unitQuantity: '단위수량',
      total: '총계'
    },
    filename: '생산계획'
  },
  inventory: {
    headers: {
      itemCode: '품목코드',
      itemName: '품목명',
      category: '카테고리',
      quantity: '수량',
      unit: '단위',
      lastUpdated: '최종수정일'
    },
    filename: '재고현황'
  },
  outbound: {
    headers: {
      date: '일자',
      itemCode: '품목코드',
      itemName: '품목명',
      quantity: '출고수량',
      destination: '출고처',
      reference: '참조번호'
    },
    filename: '출고내역'
  }
};