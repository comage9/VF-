/**
 * 공통 데이터 정규화 유틸리티
 * CSV 파싱, 날짜/숫자 정규화를 담당
 */

/**
 * 다양한 날짜 형식을 YYYY-MM-DD로 정규화
 * 지원 형식:
 * - YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD
 * - MM/DD/YY, MM/DD/YYYY (M/D/YY도 지원)
 * - YY/MM/DD (25/07/31 형식, 첫 번째 숫자가 12보다 큰 경우)
 * - YYYY. M. D 형식 (한국 스타일)
 */
export function normalizeDate(dateStr: string | any): string | null {
    if (!dateStr) return null;

    const trimmed = String(dateStr).trim().replace(/\s+/g, '');

    // 이미 YYYY-MM-DD 형식인 경우
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
    }

    // 1) YYYY[./-]M[./-]D[.]? 형식
    let match = trimmed.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})\.?$/);
    if (match) {
        const [_, year, month, day] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // 2) M[./-]D[./-]YY 또는 M[./-]D[./-]YYYY 형식
    match = trimmed.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
    if (match) {
        const [_, first, second, yearPart] = match;
        const firstNum = parseInt(first);
        const secondNum = parseInt(second);

        // YY/MM/DD 형식 판별 (첫 번째 숫자가 12보다 큰 경우 또는 두 번째 숫자가 12보다 큰 경우)
        if (firstNum > 12 && secondNum <= 12) {
            // YY/MM/DD 형식 (예: 25/07/31)
            const fullYear = firstNum + 2000;
            const month = second;
            const day = yearPart;
            return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } else {
            // MM/DD/YY 또는 MM/DD/YYYY 형식
            const month = first;
            const day = second;
            let year = yearPart;
            if (year.length === 2) {
                year = '20' + year; // 20xx로 보정
            }
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
    }

    // 알 수 없는 형식
    console.warn(`[DATA-NORMALIZER] Unknown date format: ${dateStr}`);
    return null;
}

/**
 * 숫자 문자열을 정수로 파싱 (콤마, 공백 등 제거)
 */
export function parseNumber(value: string | number | any): number {
    if (typeof value === 'number') return isNaN(value) ? 0 : Math.floor(value);

    const cleaned = String(value).replace(/[^\d-]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
}

/**
 * CSV 라인을 파싱하여 값 배열 반환
 */
export function parseCsvLine(line: string, separator = ','): string[] {
    if (!line) return [];

    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === separator && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current.trim());
    return values;
}

/**
 * 날짜 문자열에서 한국어 요일 반환
 */
export function getKoreanDayOfWeek(date: string | Date): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[dateObj.getDay()];
}

/**
 * 시간별 데이터가 포함된 빈 날짜 객체 생성
 */
export function createEmptyDayData(date: string, dayOfWeek?: string): any {
    const dow = dayOfWeek || getKoreanDayOfWeek(new Date(date));
    const base: any = {
        date,
        dayOfWeek: dow,
        total: 0
    };

    // 24시간 데이터 초기화
    for (let h = 0; h < 24; h++) {
        base[`hour_${String(h).padStart(2, '0')}`] = 0;
    }

    return base;
}
