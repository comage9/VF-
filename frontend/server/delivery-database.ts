import fs from 'fs';
import path from 'path';
import { normalizeDate, parseNumber, parseCsvLine, createEmptyDayData, getKoreanDayOfWeek } from './utils/data-normalizer';

interface DeliveryData {
    date: string;
    dayOfWeek: string;
    total: number;
    [key: string]: any; // For hour_XX fields
}

interface DatabaseSchema {
    delivery_data: DeliveryData[];
    metadata: {
        created_at?: string;
        updated_at?: string;
        version?: string;
    };
}

// 간단한 JSON 기반 출고 현황 DB
export class DeliveryDatabase {
    private dbPath: string;

    constructor() {
        const envPath = process.env.DELIVERY_DB_PATH && String(process.env.DELIVERY_DB_PATH).trim();
        if (envPath) {
            this.dbPath = path.resolve(envPath);
            try { fs.mkdirSync(path.dirname(this.dbPath), { recursive: true }); } catch { }
        } else {
            // In the renewal project, we'll store it in the 'data' directory relative to CWD
            this.dbPath = path.join(process.cwd(), 'data', 'delivery-data.json');
            try { fs.mkdirSync(path.dirname(this.dbPath), { recursive: true }); } catch { }
        }

        this._init();
    }

    private _init() {
        if (!fs.existsSync(this.dbPath)) {
            const initial: DatabaseSchema = { delivery_data: [], metadata: { created_at: new Date().toISOString(), version: '1.0.0' } };
            fs.writeFileSync(this.dbPath, JSON.stringify(initial, null, 2));
        }
    }

    public _read(): DatabaseSchema {
        try {
            return JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
        } catch (e) {
            return { delivery_data: [], metadata: {} };
        }
    }

    public _write(data: DatabaseSchema) {
        data.metadata = data.metadata || {};
        data.metadata.updated_at = new Date().toISOString();
        const tmp = this.dbPath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        try {
            const bak = this.dbPath + '.bak';
            if (fs.existsSync(this.dbPath)) {
                try { fs.copyFileSync(this.dbPath, bak); } catch { }
            }
        } catch { }
        try {
            fs.renameSync(tmp, this.dbPath);
        } catch (e) {
            // Handle rename failure (e.g. across devices), try copy and unlink
            fs.copyFileSync(tmp, this.dbPath);
            fs.unlinkSync(tmp);
        }
    }

    // YYYY-MM-DD 문자열 반환
    static toIsoDate(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    static getKoreanDayOfWeek(d: Date): string {
        return getKoreanDayOfWeek(d);
    }

    // 최근 N일 조회 (오래된 순 → 최신 순)
    getRecentDays(days = 14): DeliveryData[] {
        const data = this._read().delivery_data;
        const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
        const slice = sorted.slice(-days);
        return slice;
    }

    // 전체 데이터 조회 (날짜 오름차순)
    getAll(): DeliveryData[] {
        const data = this._read().delivery_data;
        return [...data].sort((a, b) => a.date.localeCompare(b.date));
    }

    // 특정 날짜(YYYY-MM-DD) 레코드 조회 (없으면 null)
    getByDate(date: string): DeliveryData | null {
        const data = this._read().delivery_data;
        return data.find(r => r.date === date) || null;
    }

    // 특정 날짜(YYYY-MM-DD) 레코드 upsert
    upsert(date: string, updates: Partial<DeliveryData>): DeliveryData {
        const db = this._read();
        let row = db.delivery_data.find(r => r.date === date);
        if (!row) {
            row = this._createEmptyDay(date);
            db.delivery_data.push(row);
        }
        Object.assign(row, updates);
        // 총계를 최신 시간 실데이터/예측 포함 마지막 값으로 보정
        const hours = Array.from({ length: 24 }, (_, i) => `hour_${String(i).padStart(2, '0')}`);
        for (let i = 23; i >= 0; i--) {
            const v = parseInt(row[hours[i]]) || 0;
            if (v > 0) { row.total = v; break; }
        }
        this._write(db);
        return row;
    }

    // 시간별 누적 입력 반영: entries = [{hour, quantity}]
    upsertHourlyCumulative(date: string, entries: { hour: string | number, quantity: string | number }[]): DeliveryData {
        const updates: any = {};
        for (const { hour, quantity } of entries) {
            const h = Number(hour);
            if (Number.isInteger(h) && h >= 0 && h <= 23) {
                updates[`hour_${String(h).padStart(2, '0')}`] = parseInt(String(quantity)) || 0;
            }
        }
        return this.upsert(date, updates);
    }

    // CSV 파일에서 초기 데이터 로드 (구글 시트 중단 대비)
    importFromCsvFile(csvPath: string): { imported: number } {
        if (!csvPath || !fs.existsSync(csvPath)) return { imported: 0 };
        const text = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) return { imported: 0 };

        // 구분자 추정
        const sep = (h: string) => {
            const cnt: any = { ',': (h.match(/,/g) || []).length, ';': (h.match(/;/g) || []).length, '\t': (h.match(/\t/g) || []).length };
            const best = Object.entries(cnt).sort((a: any, b: any) => b[1] - a[1])[0];
            return best && (best[1] as number) > 0 ? (best[0] === '\\t' ? '\t' : best[0]) : ',';
        };
        const separator = sep(lines[0]);

        const headers = parseCsvLine(lines[0], separator);
        let imported = 0;
        const db = this._read();

        // Detect format: Matrix (Date, Day, Total, 00, 01...) vs List (Date, Time, Qty)
        const isMatrix = headers.some(h => h.includes('00') || h === '0') && headers.some(h => h.includes('23') || h === '23');

        if (isMatrix) {
            // Existing Matrix Logic with MERGE
            for (let i = 1; i < lines.length; i++) {
                const vals = parseCsvLine(lines[i], separator);
                if (vals.length < 3) continue;
                const dateStr = normalizeDate(vals[0]);
                if (!dateStr) continue;

                let row = db.delivery_data.find(r => r.date === dateStr);
                if (!row) {
                    row = this._createEmptyDay(dateStr, vals[1] || '');
                    db.delivery_data.push(row);
                }

                // Merge logic: Only update if value is present and valid
                const total = parseNumber(vals[2]);
                if (total !== undefined && total !== 0) row.total = total;

                for (let h = 0; h < 24; h++) {
                    const idx = 3 + h;
                    if (idx < vals.length) {
                        const val = parseNumber(vals[idx]);
                        if (val !== undefined) {
                            row[`hour_${String(h).padStart(2, '0')}`] = val;
                        }
                    }
                }
                imported++;
            }
        } else {
            // List Format Logic (Date, Time, Qty)
            const dateIdx = 0;
            const timeIdx = 1;
            const qtyIdx = 2;

            for (let i = 1; i < lines.length; i++) {
                const vals = parseCsvLine(lines[i], separator);
                if (vals.length < 3) continue;
                const dateStr = normalizeDate(vals[dateIdx]);
                if (!dateStr) continue;

                let row = db.delivery_data.find(r => r.date === dateStr);
                if (!row) {
                    row = this._createEmptyDay(dateStr, '');
                    db.delivery_data.push(row);
                }

                const hourVal = parseNumber(vals[timeIdx]);
                const qty = parseNumber(vals[qtyIdx]);

                if (hourVal !== undefined && qty !== undefined && hourVal >= 0 && hourVal <= 23) {
                    row[`hour_${String(hourVal).padStart(2, '0')}`] = qty;
                    imported++;
                }
            }

            // Recalculate totals for affected rows
            db.delivery_data.forEach(row => {
                let sum = 0;
                for (let h = 0; h < 24; h++) sum += (row[`hour_${String(h).padStart(2, '0')}`] || 0);
                if (sum > 0) row.total = sum;
            });
        }

        db.delivery_data.sort((a, b) => a.date.localeCompare(b.date));
        this._write(db);
        return { imported };
    }

    // JSON 배열로 전체 교체
    replaceAll(array: any[]): { count: number } {
        if (!Array.isArray(array)) throw new Error('array required');
        const db = this._read();
        db.delivery_data = array.map(row => {
            const o = this._createEmptyDay(row.date, row.dayOfWeek);
            o.total = parseNumber(row.total);
            for (let h = 0; h < 24; h++) {
                const key = `hour_${String(h).padStart(2, '0')}`;
                o[key] = parseNumber(row[key]);
            }
            return o;
        }).sort((a, b) => a.date.localeCompare(b.date));
        this._write(db);
        return { count: db.delivery_data.length };
    }

    public _createEmptyDay(date: string, dayOfWeek?: string): DeliveryData {
        return createEmptyDayData(date, dayOfWeek);
    }
}
