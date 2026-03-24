export interface CsvParseResult {
  headers: string[];
  rows: string[][];
  errors: string[];
}

export function parseCsvFile(file: File): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const csvText = event.target?.result as string;
        const result = parseCsvText(csvText);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
    };
    
    reader.readAsText(file, 'utf-8');
  });
}

export function parseCsvText(csvText: string): CsvParseResult {
  const errors: string[] = [];
  const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
  
  if (lines.length === 0) {
    return { headers: [], rows: [], errors: ['빈 CSV 파일입니다.'] };
  }
  
  // Parse headers
  const headers = parseCsvLine(lines[0]);
  
  if (headers.length === 0) {
    errors.push('헤더가 비어있습니다.');
  }
  
  // Parse data rows
  const rows: string[][] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    try {
      const row = parseCsvLine(line);
      
      // Validate row length
      if (row.length !== headers.length) {
        errors.push(`행 ${i + 1}: 컬럼 수가 헤더와 일치하지 않습니다. (기대: ${headers.length}, 실제: ${row.length})`);
      }
      
      rows.push(row);
    } catch (error) {
      errors.push(`행 ${i + 1}: 파싱 오류 - ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  return { headers, rows, errors };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        currentField += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(currentField.trim());
      currentField = '';
      i++;
    } else {
      currentField += char;
      i++;
    }
  }
  
  // Add the last field
  result.push(currentField.trim());
  
  // Remove surrounding quotes if present
  return result.map(field => {
    if (field.startsWith('"') && field.endsWith('"')) {
      return field.slice(1, -1);
    }
    return field;
  });
}

export function validateInventoryCsv(headers: string[]): string[] {
  const errors: string[] = [];
  const requiredFields = ['name', 'category', 'currentStock'];
  const optionalFields = ['minimumStock', 'status', 'lastRestock'];
  const allValidFields = [...requiredFields, ...optionalFields];
  
  // Check for required fields
  for (const field of requiredFields) {
    if (!headers.includes(field)) {
      errors.push(`필수 필드가 누락되었습니다: ${field}`);
    }
  }
  
  // Check for unknown fields
  for (const header of headers) {
    if (!allValidFields.includes(header)) {
      errors.push(`알 수 없는 필드입니다: ${header}`);
    }
  }
  
  return errors;
}

export function validateOutboundCsv(headers: string[]): string[] {
  const errors: string[] = [];
  const requiredFields = ['productName', 'category', 'quantity', 'outboundDate'];
  const optionalFields = ['status'];
  const allValidFields = [...requiredFields, ...optionalFields];
  
  // Check for required fields
  for (const field of requiredFields) {
    if (!headers.includes(field)) {
      errors.push(`필수 필드가 누락되었습니다: ${field}`);
    }
  }
  
  // Check for unknown fields
  for (const header of headers) {
    if (!allValidFields.includes(header)) {
      errors.push(`알 수 없는 필드입니다: ${header}`);
    }
  }
  
  return errors;
}
