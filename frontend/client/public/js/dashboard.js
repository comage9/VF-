// Chart.js 플러그인 전역 등록 (Chart.js v3 방식)
// 플러그인이 로드되었는지 확인 후 등록
function initializeChartPlugins() {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js가 로드되지 않았습니다!');
        return false;
    }

    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
        console.log('ChartDataLabels 플러그인이 전역으로 등록되었습니다.');
        console.log('Chart.js 버전:', Chart.version);
        return true;
    } else {
        console.error('ChartDataLabels 플러그인을 찾을 수 없습니다!');
        return false;
    }
}

// 플러그인 초기화 시도
let pluginsInitialized = false;
if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
    pluginsInitialized = initializeChartPlugins();
} else {
    // DOM 로드 후 다시 시도
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            pluginsInitialized = initializeChartPlugins();
        }, 100);
    });
}

// 올라마 API를 통한 예측 개선 시스템

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
 * 
 * @param {string} dateStr - 정규화할 날짜 문자열
 * @returns {string|null} - YYYY-MM-DD 형식 또는 null
 */
function normalizeDate(dateStr) {
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
 * @param {string|number} value - 파싱할 값
 * @returns {number} - 파싱된 정수 (실패시 0)
 */
function parseNumber(value) {
    if (typeof value === 'number') return isNaN(value) ? 0 : Math.floor(value);

    const cleaned = String(value).replace(/[^\d-]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
}

/**
 * CSV 라인을 파싱하여 값 배열 반환
 * @param {string} line - CSV 라인
 * @param {string} separator - 구분자 (기본값: ',')
 * @returns {string[]} - 파싱된 값 배열
 */
function parseCsvLine(line, separator = ',') {
    if (!line) return [];

    const values = [];
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
 * @param {string|Date} date - 날짜
 * @returns {string} - 한국어 요일
 */
function getKoreanDayOfWeek(date) {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[dateObj.getDay()];
}

/**
 * 시간별 데이터가 포함된 빈 날짜 객체 생성
 * @param {string} date - YYYY-MM-DD 형식 날짜
 * @param {string} dayOfWeek - 요일 (선택사항)
 * @returns {object} - 시간별 데이터 구조
 */
function createEmptyDayData(date, dayOfWeek) {
    const dow = dayOfWeek || getKoreanDayOfWeek(new Date(date));
    const base = {
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

// CommonJS와 ES Module 양쪽 지원
if (typeof module !== 'undefined' && module.exports) {
    // CommonJS (Node.js)
    module.exports = {
        normalizeDate,
        parseNumber,
        parseCsvLine,
        getKoreanDayOfWeek,
        createEmptyDayData
    };
} else {
    // ES Module 또는 브라우저
    window.DataNormalizer = {
        normalizeDate,
        parseNumber,
        parseCsvLine,
        getKoreanDayOfWeek,
        createEmptyDayData
    };
}

// 올라마 API를 통한 예측 개선 시스템
class OllamaPredictionEnhancer {
    constructor() {
        this.apiKey = this.getApiKey();
        this.baseUrl = 'https://api.ollama.ai/v1';
        this.enabled = !!this.apiKey;
    }

    getApiKey() {
        // .env 파일에서 API 키 읽기 (실제 구현 시 서버에서 처리 권장)
        return 'cce8e38d02f34b3080db5ecd48152a95.XrJC84HNrT7Car4M_6RbnVkp';
    }

    async enhancePrediction(currentPrediction, historicalData, context) {
        if (!this.enabled) {
            console.log('올라마 API 비활성화됨');
            return currentPrediction;
        }

        try {
            const prompt = this.generatePrompt(currentPrediction, historicalData, context);
            const enhanced = await this.callOllamaAPI(prompt);

            console.log(`올라마 예측 개선: ${currentPrediction} → ${enhanced}`);
            return enhanced;
        } catch (error) {
            console.error('올라마 API 호출 실패:', error);
            return currentPrediction; // 실패 시 원본 반환
        }
    }

    generatePrompt(currentPrediction, historicalData, context) {
        const recentData = historicalData.slice(-7);
        const trend = this.calculateTrend(recentData);
        const volatility = this.calculateVolatility(recentData);

        return `현재 출고 예측값 개선을 위한 분석

최근 7일 출고 데이터:
${recentData.map((d, i) => `${i + 1}일 전: ${d.quantity}개`).join('\n')}

추가 정보:
- 요일: ${context.dayOfWeek}
- 시간대: ${context.hour}시
- 트렌드: ${trend > 1.1 ? '상승' : trend < 0.9 ? '하락' : '안정'}
- 변동성: ${volatility > 0.3 ? '높음' : volatility > 0.15 ? '중간' : '낮음'}

규칙:
1. 현재 예측값을 50-150% 범위 내에서 조정
2. 급증하는 트렌드는 적극 반영
3. 변동성이 높으면 보수적으로 조정
4. 최소 30개, 최대 500개 범위 유지

개선된 예측값만 숫자로 답변하세요.
`;
    }

    calculateTrend(data) {
        if (data.length < 2) return 1.0;
        const recent = data.slice(-3).reduce((a, b) => a + b.quantity, 0) / 3;
        const older = data.slice(0, 3).reduce((a, b) => a + b.quantity, 0) / 3;
        return recent / older;
    }

    calculateVolatility(data) {
        const quantities = data.map(d => d.quantity);
        const mean = quantities.reduce((a, b) => a + b, 0) / quantities.length;
        const variance = quantities.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / quantities.length;
        return Math.sqrt(variance) / mean;
    }

    async callOllamaAPI(prompt) {
        // 실제 API 호출 (CORS 문제로 서버 구현 권장)
        // 현재는 시뮬레이션
        return new Promise((resolve) => {
            setTimeout(() => {
                const enhancement = 0.7 + Math.random() * 0.6; // 70-130% 범위
                resolve(Math.round(100 * enhancement));
            }, 100);
        });
    }
}

// 대시보드 클래스
class Dashboard {
    constructor(csvUrl, chartId, options = {}) {
        this.csvUrl = csvUrl;
        this.chartId = chartId;
        this.chart = null;
        this.data = [];
        this.refreshInterval = null;
        // API 사용여부와 엔드포인트 설정 (기본값: API 사용)
        this.useApi = options.useApi !== undefined ? options.useApi : true;
        this.apiBase = options.apiBase || '';
        this.apiDays = options.apiDays || 14;
        // 예측값 캐시 추가
        this.predictionCache = new Map();

        // AI 예측 로딩 완료 플래그
        // - false: AI 예측이 아직 확정되지 않음(초기 로드/재로딩 중) => 카드 값은 숫자로 세팅하지 않음
        // - true: 1) AI 예측이 적용되었거나 2) AI 예측을 사용할 수 없는 상태가 확정됨 => 차트 기준으로 카드 값 세팅
        this.aiPredictionsLoaded = false;

        // 🎯 AI 분석 결과 캐시 (localStorage 사용)
        this.aiInsightCache = null;
        this.loadAIInsightFromStorage();

        // 🎯 AI 분석 최적화: 마지막 분석 시간 추적
        this.lastAIAnalysisHour = null;
        this.lastAIAnalysisDate = null;
        this.lastAIAnalysisValue = null;

        this.specialNotesCache = new Map();
        this.specialNotesLoadedDate = null;

        this.maxHourlyDisplayedDate = null;

        // 🎯 예측 곡선 평활화 설정
        this.SMOOTHING_CONFIG = {
            enabled: true,
            historicalWeight: 0.0,
            linearWeight: 1.0,
            movingAverageWindow: 3,
            minIncrementPerHour: 10
        };
    }

    // 🎯 AI 분석 결과 localStorage 저장
    saveAIInsightToStorage(insight) {
        try {
            const data = {
                insight: insight,
                date: this.lastAIAnalysisDate,
                hour: this.lastAIAnalysisHour,
                value: this.lastAIAnalysisValue,
                savedAt: new Date().toISOString()
            };
            localStorage.setItem('ai_insight_cache', JSON.stringify(data));
            console.log('🤖 AI 분석 결과 저장 완료');
        } catch (e) {
            console.warn('🤖 localStorage 저장 실패:', e);
        }
    }

    // 🎯 AI 분석 결과 localStorage 복원
    loadAIInsightFromStorage() {
        try {
            const saved = localStorage.getItem('ai_insight_cache');
            if (saved) {
                const data = JSON.parse(saved);
                // 오늘 데이터이고, 시간과 값이 동일하면 캐시 사용
                const now = new Date();
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                if (data.date === todayStr) {
                    this.lastAIAnalysisDate = data.date;
                    this.lastAIAnalysisHour = data.hour;
                    this.lastAIAnalysisValue = data.value;
                    this.aiInsightCache = data.insight;
                    console.log('🤖 AI 분석 캐시 복원:', data.date, data.hour, '시');
                }
            }
        } catch (e) {
            console.warn('🤖 localStorage 복원 실패:', e);
        }
    }



    async init() {
        console.log('Dashboard initialization started...');

        // 먼저 차트를 초기화
        this.initChart();

        // 이벤트 핸들러 설정
        this.setupEventHandlers();

        // 데이터 로드 및 대시보드 업데이트
        await this.loadData();

        try {
            await this.loadSpecialNotesForCurrentDay();
        } catch (e) {
            console.warn('Failed to load special notes:', e);
        }

        console.log('Dashboard initialization completed');
    }

    async submitData(form) {
        const formData = new FormData(form);
        const entries = [];
        // FormData에서 시간과 수량 쌍을 추출
        for (let i = 0; formData.has(`quantity_${i}`); i++) {
            const hour = formData.get(`hour_${i}`);
            const quantity = formData.get(`quantity_${i}`);
            if (quantity) { // 값이 입력된 항목만 추가
                entries.push({
                    hour: parseInt(hour, 10),
                    quantity: parseInt(quantity, 10)
                });
            }
        }

        if (entries.length === 0) {
            alert('하나 이상의 출고량을 입력해주세요.');
            return;
        }

        try {
            // 구글 시트 사용 중단: 서버 DB API로 저장
            const base = this.apiBase || '';
            const response = await fetch(`${base}/api/delivery/hourly`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(entries) // 배열 형태로 전송
            });

            if (response.ok) {
                alert('데이터가 성공적으로 제출되었습니다.');
                await this.loadData(); // 데이터 다시 로드하여 대시보드 및 폼 업데이트

                // 🔮 데이터 변경에 따른 AI 재예측 및 분석
                console.log('🔄 Triggering AI re-prediction after data update...');
                await this.fetchAIPredictions();
                this.fetchAIAnalysis();

                // 차트 갱신 (AI 예측값 반영)
                this.updateChart();
            } else {
                const errorText = await response.text();
                alert(`데이터 제출 실패: ${errorText}`);
            }
        } catch (error) {
            console.error('Error submitting data:', error);
            alert('데이터 제출 중 오류가 발생했습니다.');
        }
    }

    setupEventHandlers() {
        // 새로고침 버튼
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.refreshData();
        });

        // 🧪 백테스트 버튼 (개발/디버그용)
        const backtestBtn = document.getElementById('run-backtest-btn');
        if (backtestBtn) {
            backtestBtn.addEventListener('click', async () => {
                backtestBtn.disabled = true;
                backtestBtn.textContent = '실행중...';
                try {
                    const result = await this.runAllVariantsBacktest(90);
                    // 결과를 사이드패널에 표시
                    const summaryDiv = document.getElementById('backtest-summary');
                    const summaryContent = document.getElementById('backtest-summary-content');

                    let html = '<div class="font-medium text-foreground mb-2">전체 알고리즘 비교</div>';
                    html += '<div class="space-y-1 text-xs">';

                    // 정렬하여 표시
                    const sorted = Object.entries(result.results).sort((a, b) =>
                        parseFloat(a[1].avgError) - parseFloat(b[1].avgError));

                    for (const [id, data] of sorted) {
                        const isBest = id === result.bestVariant;
                        html += `<div class="flex justify-between ${isBest ? 'text-primary font-bold' : ''}">`;
                        html += `<span>${id}: ${data.name}</span>`;
                        html += `<span>${data.avgError}</span>`;
                        html += '</div>';
                    }
                    html += '</div>';
                    html += `<div class="mt-2 text-xs text-primary font-medium">🏆 최적: ${result.bestVariant}</div>`;

                    summaryContent.innerHTML = html;
                    summaryDiv.classList.remove('hidden');

                    console.log('========== 백테스트 최종 결과 ==========');
                    console.log(JSON.stringify(result.results, null, 2));
                    console.log('=========================================');
                } catch (e) {
                    console.error('백테스트 오류:', e);
                    const summaryContent = document.getElementById('backtest-summary-content');
                    const summaryDiv = document.getElementById('backtest-summary');
                    if (summaryContent && summaryDiv) {
                        summaryContent.innerHTML = '백테스트 실패: ' + e.message;
                        summaryDiv.classList.remove('hidden');
                    }
                } finally {
                    backtestBtn.disabled = false;
                    backtestBtn.textContent = '전체 알고리즘 백테스트';
                }
            });
        }

        // 🧪 백테스트 통계 버튼
        const showStatsBtn = document.getElementById('show-stats-btn');
        if (showStatsBtn) {
            showStatsBtn.addEventListener('click', async () => {
                showStatsBtn.disabled = true;
                showStatsBtn.textContent = '로딩중...';
                try {
                    const response = await fetch(`${this.apiBase}/api/ai/accuracy-stats`);
                    const result = await response.json();

                    const summaryDiv = document.getElementById('backtest-summary');
                    const summaryContent = document.getElementById('backtest-summary-content');

                    if (result.stats) {
                        const { total, day, period } = result.stats;
                        let html = '';

                        // 전체 통계
                        html += '<div class="border-b border-border pb-2 mb-2">';
                        html += '<div class="font-medium text-foreground">전체</div>';
                        html += `<div>오차율: ${total?.avg_error ? (total.avg_error * 100).toFixed(1) + '%' : 'N/A'}</div>`;
                        html += `<div>과대: ${total?.over_rate ? (total.over_rate * 100).toFixed(1) + '%' : 'N/A'}, 과소: ${total?.under_rate ? (total.under_rate * 100).toFixed(1) + '%' : 'N/A'}</div>`;
                        html += `<div class="text-xs">${total?.count || 0}회 테스트</div>`;
                        html += '</div>';

                        // 요일별 통계
                        html += '<div class="border-b border-border pb-2 mb-2">';
                        html += '<div class="font-medium text-foreground">요일별</div>';
                        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
                        const dayKeys = ['일', '월', '화', '수', '목', '금', '토'];
                        for (let i = 0; i < 7; i++) {
                            const d = day?.[dayKeys[i]];
                            if (d && d.count > 0) {
                                html += `<div class="flex justify-between text-xs"><span>${dayNames[i]}</span><span>${(d.avg_error * 100).toFixed(1)}%</span></div>`;
                            }
                        }
                        html += '</div>';

                        // 기간별 통계
                        html += '<div>';
                        html += '<div class="font-medium text-foreground">기간별</div>';
                        if (period?.['월초']?.count > 0) {
                            html += `<div class="flex justify-between text-xs"><span>월초</span><span>${(period['월초'].avg_error * 100).toFixed(1)}%</span></div>`;
                        }
                        if (period?.['월중']?.count > 0) {
                            html += `<div class="flex justify-between text-xs"><span>월중</span><span>${(period['월중'].avg_error * 100).toFixed(1)}%</span></div>`;
                        }
                        if (period?.['월말']?.count > 0) {
                            html += `<div class="flex justify-between text-xs"><span>월말</span><span>${(period['월말'].avg_error * 100).toFixed(1)}%</span></div>`;
                        }
                        html += '</div>';

                        summaryContent.innerHTML = html;
                        summaryDiv.classList.remove('hidden');
                    } else {
                        summaryContent.innerHTML = '백테스트 데이터가 없습니다.';
                        summaryDiv.classList.remove('hidden');
                    }
                } catch (e) {
                    console.error('백테스트 통계 로드 실패:', e);
                    const summaryContent = document.getElementById('backtest-summary-content');
                    const summaryDiv = document.getElementById('backtest-summary');
                    if (summaryContent && summaryDiv) {
                        summaryContent.innerHTML = '로드 실패: ' + e.message;
                        summaryDiv.classList.remove('hidden');
                    }
                } finally {
                    showStatsBtn.disabled = false;
                    showStatsBtn.textContent = '백테스트 통계';
                }
            });
        }

        // 📅 내일 예측 패널 로드
        this.loadDailyPrediction = async () => {
            const contentDiv = document.getElementById('daily-prediction-content');
            if (!contentDiv) return;

            try {
                contentDiv.innerHTML = '<div class="text-center text-muted-foreground py-4">예측 데이터 로딩중...</div>';

                // 3일 예측 (오늘+내일+모레)
                const response = await fetch(`${this.apiBase}/api/delivery/daily-prediction?num_days=3`);
                const result = await response.json();

                if (!result.success) {
                    contentDiv.innerHTML = `<div class="text-error text-sm">${result.message || '예측 실패'}</div>`;
                    return;
                }

                const { predictions, hourly_predictions, meta } = result;

                let html = '';
                // 3일 예측 표시
                for (const pred of predictions) {
                    const dayLabel = pred.date === meta.start_date ? '(오늘)' :
                                     pred.date === this.getTomorrowDate() ? '(내일)' : '';
                    html += '<div class="flex justify-between items-center py-2 border-b border-border last:border-0">';
                    html += `<div class="text-sm">`;
                    html += `<div class="font-medium">${pred.date} (${pred.day_of_week}) ${dayLabel}</div>`;
                    html += `<div class="text-xs text-muted-foreground">${pred.period === 'month_start' ? '월초' : pred.period === 'month_mid' ? '월중' : '월말'}</div>`;
                    html += `</div>`;
                    html += `<div class="text-right">`;
                    html += `<div class="text-lg font-bold ${pred.date === meta.start_date ? 'text-primary' : 'text-foreground'}">${pred.predicted_total.toLocaleString()}</div>`;
                    html += `<div class="badge badge-xs ${pred.confidence === 'medium' ? 'badge-success' : 'badge-warning'}">${pred.confidence}</div>`;
                    html += `</div>`;
                    html += '</div>';
                }

                // 기준선 정보
                html += '<div class="mt-3 pt-2 border-t border-border text-xs text-muted-foreground">';
                html += `<div>최근 4주 평균: ${meta.recent_4week_avg?.toLocaleString() || '-'}</div>`;
                html += `<div>학습데이터: ${meta.training_samples}일</div>`;
                html += '</div>';

                contentDiv.innerHTML = html;

                // 저장
                if (predictions.length > 0) {
                    this.tomorrowPrediction = predictions[0].predicted_total;
                    this.tomorrowHourlyPrediction = hourly_predictions[predictions[0].date];
                }

            } catch (e) {
                console.error('내일 예측 로드 실패:', e);
                contentDiv.innerHTML = `<div class="text-error text-sm">로드 실패: ${e.message}</div>`;
            }
        };

        // 내일 날짜 계산 헬퍼
        this.getTomorrowDate = () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return tomorrow.toISOString().split('T')[0];
        };

        // 초기 로드 및 새로고침 버튼
        if (document.getElementById('daily-prediction-content')) {
            this.loadDailyPrediction();
        }

        const refreshDailyBtn = document.getElementById('refresh-daily-prediction');
        if (refreshDailyBtn) {
            refreshDailyBtn.addEventListener('click', () => {
                this.loadDailyPrediction();
            });
        }

        // 동적 폼 제출을 위한 이벤트 위임 사용
        const container = document.getElementById('dynamic-data-entry-container');
        if (container) {
            container.addEventListener('submit', (e) => {
                e.preventDefault();
                if (e.target && e.target.id === 'dynamic-form') {
                    this.submitData(e.target);
                }
            });
        }

        const noteForm = document.getElementById('special-note-form');
        if (noteForm) {
            noteForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitSpecialNote();
            });
        }

        // 기간 출고 수량 조회 (범위)
        const rangeBtn = document.getElementById('range-search-btn');
        const startDate = document.getElementById('start-date');
        const endDate = document.getElementById('end-date');
        const rangeResult = document.getElementById('range-result');
        if (rangeBtn && startDate && endDate) {
            try {
                const today = new Date();
                const iso = today.toISOString().slice(0, 10);
                startDate.value = iso;
                endDate.value = iso;
            } catch { }
            rangeBtn.addEventListener('click', async () => {
                const s = (startDate.value || '').trim();
                const e = (endDate.value || '').trim();
                if (!s || !e) { alert('시작일과 종료일을 선택해 주세요'); return; }
                // API base 보정: this.apiBase가 비어있으면 동일 오리진 사용(HTTP/S에서만)
                const base = this.apiBase || ''; // base가 없으면 상대경로로 동일 오리진 호출
                rangeBtn.disabled = true;
                rangeResult.textContent = '';
                try {
                    const url = `${base}/api/delivery/range?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}`;
                    console.log('Range fetch:', url);
                    const res = await fetch(url, { cache: 'no-store' });
                    const text = await res.text();
                    let json = null;
                    try { json = JSON.parse(text); } catch { json = null; }
                    if (res.ok && json && json.success && Array.isArray(json.data)) {
                        this.rangeMode = true;
                        this.data = json.data; // 범위 데이터로 교체
                        if (json.count === 0) {
                            rangeResult.textContent = `${json.start} ~ ${json.end}: 데이터 없음`;
                        } else {
                            rangeResult.textContent = `${json.start} ~ ${json.end} (${json.count}일)`;
                        }
                        this.updateDashboard();
                    } else {
                        const msg = (json && (json.message || json.error)) ? (json.message || json.error) : `HTTP ${res.status}`;
                        console.warn('Range fetch failed:', { status: res.status, body: text });
                        rangeResult.textContent = `조회 실패: ${msg}`;
                    }
                } catch (e) {
                    console.error('Range fetch error:', e);
                    rangeResult.textContent = '오류 발생';
                } finally {
                    rangeBtn.disabled = false;
                }
            });
        }


        // 통계 토글
        const toggleAux = document.getElementById('toggle-aux-stats');
        const auxBody = document.getElementById('aux-stats-body');
        if (toggleAux && auxBody) {
            toggleAux.addEventListener('click', () => { auxBody.classList.toggle('hidden'); });
        }

        // 다운로드 버튼들
        const exportExcelBtn = document.getElementById('export-excel-btn');
        if (exportExcelBtn) {
            exportExcelBtn.addEventListener('click', () => {
                const url = `${this.apiBase}/api/delivery/export.xlsx`;
                window.open(url, '_blank');
            });
        }

        // 업로드: 파일 선택 → 업로드
        const uploadBtn = document.getElementById('upload-btn');
        const fileInput = document.getElementById('file-input');
        if (uploadBtn && fileInput) {
            // React handles the upload button click - never add dashboard.js click handler
            // This prevents double file chooser opening
            // Only handle file change events
            fileInput.addEventListener('change', async () => {
                if (!fileInput.files || fileInput.files.length === 0) return;
                const file = fileInput.files[0];
                console.log('File selected:', file);
                const name = (file.name || '').toLowerCase();
                const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
                const endpoint = isExcel ? `${this.apiBase}/api/delivery/import-excel` : `${this.apiBase}/api/delivery/import`;
                console.log('Upload endpoint:', endpoint);

                try {
                    uploadBtn.disabled = true;
                    uploadBtn.classList.add('loading');
                    const fd = new FormData();
                    fd.append('file', file);
                    const res = await fetch(endpoint, { method: 'POST', body: fd });
                    const json = await res.json().catch(() => null);
                    console.log('Upload response:', res.status, json);
                    if (res.ok && json && json.success) {
                        alert('업로드 완료. 대시보드를 새로고칩니다.');
                        await this.refreshData();
                    } else {
                        alert(`업로드 실패: ${json?.message || res.status}`);
                    }
                } catch (e) {
                    console.error('Upload error:', e);
                    alert(`업로드 오류: ${e.message}`);
                } finally {
                    uploadBtn.disabled = false;
                    uploadBtn.classList.remove('loading');
                    fileInput.value = '';
                }
            });
        }
    }

    async loadData() {
        try {
            this.showLoading();

            // 새로 로드 시작 시점에는 AI 예측이 확정되지 않은 상태로 리셋
            this.aiPredictionsLoaded = false;

            let lastApiError = null;

            // 1) 서버 API 우선 사용 (구글 시트 중단)
            if (this.useApi) {
                try {
                    const apiUrl = `${this.apiBase}/api/delivery/hourly?days=365`;
                    console.log('Fetching delivery data from API:', apiUrl);
                    const res = await fetch(apiUrl);
                    if (!res.ok) throw new Error(`API status ${res.status}`);
                    const json = await res.json();
                    if (json && json.success && Array.isArray(json.data)) {
                        this.rangeMode = false; // 기본 로드 시 범위 모드 해제
                        this.data = json.data;
                        // 데이터 정렬: 1. 날짜 내림차순, 2. 기계번호 오름차순 (기계번호가 있는 경우)
                        this.data.sort((a, b) => {
                            const dateA = new Date(a.date);
                            const dateB = new Date(b.date);
                            if (dateA > dateB) return 1;
                            if (dateA < dateB) return -1;

                            // 기계번호 필드가 있다면 오름차순 정렬
                            if (a.machineNumber && b.machineNumber) {
                                return a.machineNumber.localeCompare(b.machineNumber);
                            }
                            return 0;
                        });
                        this.updateDashboard();
                        this.updateStatus('연결됨');
                        setTimeout(async () => {
                            this.performDataAnalysis();
                            // 🔮 AI 예측 실행
                            await this.fetchAIPredictions();
                            // 🤖 AI 분석 실행
                            this.fetchAIAnalysis();
                        }, 1000);
                        return;
                    }
                    console.warn('API returned unexpected format, falling back to CSV flow');
                    lastApiError = new Error('API returned unexpected format');
                } catch (apiErr) {
                    console.warn('API fetch failed, falling back to CSV flow:', apiErr.message);
                    lastApiError = apiErr;
                }
            }

            // /sales/delivery는 csvUrl(null)을 사용하므로 CSV 폴백 자체가 유효하지 않다.
            // API가 실패한 경우에는 폴백을 시도하지 말고 API 실패를 그대로 에러로 노출한다.
            if (!this.csvUrl) {
                const msg = lastApiError && lastApiError.message ? lastApiError.message : 'API unavailable';
                throw new Error(`API data fetch failed: ${msg}`);
            }

            // 2) CSV 경로 (프록시 + 로컬 폴백)
            // csvUrl이 없으면 프록시 시도 자체를 건너뛴다.
            const proxyServices = this.csvUrl ? [
                `/api/proxy?url=${encodeURIComponent(this.csvUrl)}`,
                // 외부 프록시는 백업 용도
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(this.csvUrl)}`,
                `https://thingproxy.freeboard.io/fetch/${this.csvUrl}`,
                `https://cors.isomorphic-git.org/${this.csvUrl}`,
                `https://cors-anywhere.herokuapp.com/${this.csvUrl}`,
                `https://api.allorigins.win/get?url=${encodeURIComponent(this.csvUrl)}`
            ] : [];

            // 네트워크/프록시가 모두 실패할 경우를 대비한 로컬 CSV 백업 경로들
            // 프로젝트에 동봉된 샘플 파일로 차트를 계속 표시할 수 있게 함
            const localFallbacks = [
                '/일별 출고 수량 보고용 - 시트4.csv',
                './일별 출고 수량 보고용 - 시트4.csv'
            ];

            let response = null;
            let csvContent = null;

            // 프록시 서비스들을 순차적으로 시도
            // 간단한 CSV/HTML 판별 함수
            const isHtmlLike = (text) => {
                if (!text) return false;
                const sample = text.slice(0, 300).toLowerCase();
                return sample.includes('<html') || sample.includes('<!doctype html') || sample.includes('<body');
            };

            const isCsvLike = (text) => {
                if (!text) return false;
                // BOM 제거
                const normalized = text.replace(/^\uFEFF/, '');
                const firstLine = normalized.split('\n')[0] || '';
                if (isHtmlLike(normalized)) return false;
                // 구분자 후보들과 셀 개수 검사
                const separators = [',', ';', '\t'];
                return separators.some(sep => (firstLine.split(sep).length >= 2));
            };

            // 0) 직접 요청 시도 (CORS 허용시 바로 사용) - csvUrl 있을 때만
            if (this.csvUrl) {
                try {
                    console.log('Trying direct fetch to CSV URL first:', this.csvUrl);
                    const directRes = await fetch(this.csvUrl);
                    if (directRes.ok) {
                        const contentType = directRes.headers.get('content-type') || '';
                        let directText = await directRes.text();
                        if (!contentType.includes('text/html') && isCsvLike(directText)) {
                            csvContent = directText;
                            console.log('Direct fetch successful with CSV-like content');
                        } else {
                            console.log('Direct fetch returned non-CSV/HTML, will try proxies...');
                        }
                    } else {
                        console.log('Direct fetch failed with status', directRes.status);
                    }
                } catch (e) {
                    console.log('Direct fetch threw, will try proxies:', e.message);
                }
            }

            if (!csvContent && proxyServices.length > 0) {
                for (let i = 0; i < proxyServices.length; i++) {
                    try {
                        console.log(`Trying proxy service ${i + 1}:`, proxyServices[i]);
                        response = await fetch(proxyServices[i]);

                        if (!response.ok) {
                            console.log(`Proxy service ${i + 1} returned status`, response.status);
                            continue;
                        }

                        // 콘텐츠 타입 헤더 확인 (있다면)
                        const contentType = response.headers && response.headers.get
                            ? (response.headers.get('content-type') || '')
                            : '';

                        if (proxyServices[i].includes('allorigins.win')) {
                            // allorigins는 wrapper JSON이므로 안전하게 파싱 시도
                            try {
                                const data = await response.json();
                                csvContent = data && data.contents ? data.contents : null;
                            } catch (je) {
                                console.log('AllOrigins JSON parse failed:', je.message);
                                csvContent = null;
                            }
                        } else {
                            csvContent = await response.text();
                        }

                        // HTML 에러 페이지가 오면 다음 프록시로 넘어감
                        if (contentType.includes('text/html') || isHtmlLike(csvContent)) {
                            console.log(`Proxy service ${i + 1} responded with HTML, trying next...`);
                            csvContent = null;
                            continue;
                        }

                        // CSV 형태가 아닌 경우도 다음 프록시 시도
                        if (!isCsvLike(csvContent)) {
                            console.log(`Proxy service ${i + 1} content not CSV-like, trying next...`);
                            csvContent = null;
                            continue;
                        }

                        console.log(`Proxy service ${i + 1} successful with CSV-like content`);
                        break;
                    } catch (proxyError) {
                        console.log(`Proxy service ${i + 1} failed:`, proxyError.message);
                        // 여기서 즉시 throw하지 않고, 로컬 폴백으로 이어가게 둔다
                    }
                }
            }

            // 모든 프록시 시도가 실패하면 로컬 CSV 파일 시도
            if (!csvContent) {
                console.log('All proxies failed, trying local CSV fallbacks...');
                for (let j = 0; j < localFallbacks.length; j++) {
                    try {
                        const url = localFallbacks[j];
                        console.log(`Trying local fallback ${j + 1}:`, url);
                        const res = await fetch(url);
                        if (!res.ok) {
                            console.log(`Local fallback ${j + 1} returned status`, res.status);
                            continue;
                        }
                        let text = await res.text();
                        if (isCsvLike(text)) {
                            csvContent = text;
                            console.log(`Local fallback ${j + 1} successful`);
                            break;
                        } else {
                            console.log(`Local fallback ${j + 1} not CSV-like`);
                        }
                    } catch (lfErr) {
                        console.log(`Local fallback ${j + 1} failed:`, lfErr.message);
                    }
                }
            }

            if (!csvContent) {
                throw new Error('CSV fetch failed: No valid response from any proxy or local fallback');
            }

            console.log('Raw response:', csvContent.substring(0, 200));

            // base64 데이터인지 확인하고 디코딩
            if (csvContent.startsWith('data:text/csv;base64,')) {
                console.log('Base64 encoded data detected, decoding...');
                const base64Data = csvContent.replace('data:text/csv;base64,', '');
                csvContent = atob(base64Data);
                console.log('Decoded CSV content (first 200 chars):', csvContent.substring(0, 200));
            }

            this.data = this.parseCSV(csvContent);
            this.updateDashboard();
            this.updateStatus('연결됨');

            // 🔍 데이터 분석 및 예측 검증 시스템 실행
            setTimeout(async () => {
                this.performDataAnalysis();
                // 🔮 AI 예측 실행
                await this.fetchAIPredictions();
                // 🤖 AI 분석 실행
                this.fetchAIAnalysis();
            }, 1000);

        } catch (error) {
            console.error('데이터 로드 실패:', error);
            const diag = `useApi=${!!this.useApi}, apiBase=${this.apiBase || '(empty)'}, csvUrl=${this.csvUrl || '(none)'}`;
            this.showError('데이터 로드에 실패했습니다: ' + error.message + `\n(${diag})`);
            this.updateStatus('연결 실패');
        } finally {
            this.hideLoading();
        }
    }

    parseCSV(csvText) {
        console.log('Raw CSV text (first 200 chars):', csvText.substring(0, 200));

        // BOM 제거 및 줄 분리
        const text = csvText.replace(/^\uFEFF/, '');
        const lines = text.trim().split(/\r?\n/);
        console.log('Total lines:', lines.length);
        console.log('First line (headers):', lines[0]);
        console.log('Second line (sample data):', lines[1]);

        // 구분자(auto-detect): 콤마, 세미콜론, 탭 중 최다 출현을 선택
        const detectSep = (s) => {
            if (!s) return ',';
            const counts = {
                ',': (s.match(/,/g) || []).length,
                ';': (s.match(/;/g) || []).length,
                '\t': (s.match(/\t/g) || []).length
            };
            const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            return best && best[1] > 0 ? (best[0] === '\\t' ? '\t' : best[0]) : ',';
        };

        const separator = detectSep(lines[0] || '');
        console.log('Detected separator:', separator === '\\t' ? 'TAB' : separator);

        // 더 강력한 CSV 파싱 (따옴표 처리)
        const headers = this.parseCSVLine(lines[0], separator);
        console.log('Parsed headers:', headers);
        console.log('Headers length:', headers.length);

        // 공통 유틸리티 사용 (data-normalizer.js에서 제공)
        const { normalizeDate, parseNumber } = window.DataNormalizer;

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue; // 빈 줄 건너뛰기

            const values = this.parseCSVLine(lines[i], separator);
            console.log(`Line ${i} values:`, values.slice(0, 5), '...'); // 처음 5개만 출력

            if (values.length >= 3) { // 최소한 날짜, 요일, 첫 번째 데이터가 있어야 함
                const row = {};

                // 첫 번째 컬럼에서 날짜 정규화 시도
                const normalizedDate = normalizeDate(values[0]);
                if (!normalizedDate) continue; // 날짜가 아니면 스킵

                row.date = normalizedDate;
                row.dayOfWeek = values[1] || '';

                // 데이터 구조: 날짜, 요일, 합계, 0시~23시
                row.total = parseNumber(values[2]);

                // 0-23시 데이터 추출 (인덱스 3부터 26까지)
                for (let h = 0; h < 24; h++) {
                    const hourKey = h.toString().padStart(2, '0');
                    const valueIndex = 3 + h; // 합계 다음부터 시간별 데이터
                    if (valueIndex < values.length) {
                        row[`hour_${hourKey}`] = parseNumber(values[valueIndex]);
                    } else {
                        row[`hour_${hourKey}`] = 0;
                    }
                }

                data.push(row);
                console.log(`Parsed row for ${row.date}:`, {
                    date: row.date,
                    dayOfWeek: row.dayOfWeek,
                    total: row.total,
                    firstHours: `${row.hour_00 || 0}, ${row.hour_01 || 0}, ${row.hour_02 || 0}`,
                    lastHours: `${row.hour_21 || 0}, ${row.hour_22 || 0}, ${row.hour_23 || 0}`
                });
            }
        }

        console.log('Parsed data sample:', data.slice(0, 3));
        console.log('Total parsed rows:', data.length);
        if (data.length === 0) {
            console.warn('No rows parsed from CSV. Sample lines:', lines.slice(0, 5));
        }
        return data;
    }

    parseCSVLine(line, sep = ',') {
        const result = [];
        let current = '';
        let inQuotes = false;
        let i = 0;

        // 실제 구분자 문자 (탭 문자열 처리)
        const delim = sep === '\\t' ? '\t' : sep;

        while (i < line.length) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // 두 개의 따옴표는 하나의 따옴표로 처리
                    current += '"';
                    i += 2;
                    continue;
                } else {
                    // 따옴표 토글
                    inQuotes = !inQuotes;
                }
            } else if (!inQuotes) {
                // 구분자 비교
                if (delim === '\t' && char === '\t') {
                    result.push(current.trim());
                    current = '';
                } else if (delim !== '\t' && char === delim) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
                i++;
                continue;
            }

            // 기본 누적
            current += char;
            i++;
        }

        result.push(current.trim());
        return result;
    }

    updateDashboard() {
        this.updateStats();
        this.updateChart();
        this.updateLastUpdate();
        this.renderDataEntryForm();
        this.renderAuxStats();

        try {
            this.loadSpecialNotesForCurrentDay();
        } catch (e) {
            // ignore
        }
    }

    updateStats() {
        console.log('Updating stats with data:', this.data.length, 'rows');

        // 최신 데이터 (오늘)
        const latestRow = this.data[this.data.length - 1];
        console.log('Latest row:', latestRow);

        // 오늘 총 출고량 (현재 시간까지의 실제 누적값)
        let todayTotal = 0;
        if (latestRow) {
            // 현재 시간대까지의 가장 높은 실제값 찾기
            const currentHour = new Date().getHours();
            for (let h = 23; h >= 0; h--) {
                const hourKey = `hour_${h.toString().padStart(2, '0')}`;
                const value = parseInt(latestRow[hourKey]) || 0;
                if (value > 0) {
                    todayTotal = value;
                    break;
                }
            }
            // 실제값이 없으면 합계값 사용
            if (todayTotal === 0) {
                todayTotal = latestRow.total || 0;
            }
        }

        // 어제 마지막 출고량 (실제 데이터 중 마지막 값)
        let yesterdayLast = 0;
        if (this.data.length > 1) {
            const yesterdayRow = this.data[this.data.length - 2];
            if (yesterdayRow) {
                // 23시부터 역순으로 검색해서 실제 데이터가 있는 마지막 시간의 값 찾기
                for (let h = 23; h >= 0; h--) {
                    const hourKey = `hour_${h.toString().padStart(2, '0')}`;
                    const value = parseInt(yesterdayRow[hourKey]) || 0;
                    if (value > 0) {
                        yesterdayLast = value;
                        break;
                    }
                }
                // 실제값이 없으면 합계값 사용
                if (yesterdayLast === 0) {
                    yesterdayLast = yesterdayRow.total || 0;
                }
            }
        }

        // 이전 3일 데이터로 평균 출고량 계산
        const recentDays = this.rangeMode ? this.data : this.data.slice(-4, -1); // 범위 모드면 전체, 아니면 최근 3일
        let dailyTotals = []; // 각 일별 총 출고량
        let hourlyIncrements = []; // 시간당 증가량

        recentDays.forEach(row => {
            // 각 일별 최종 출고량 (실제 데이터 중 최대값)
            let dailyMax = 0;
            for (let h = 23; h >= 0; h--) {
                const hourKey = `hour_${h.toString().padStart(2, '0')}`;
                const value = parseInt(row[hourKey]) || 0;
                if (value > 0) {
                    dailyMax = value;
                    break;
                }
            }
            // 실제값이 없으면 합계값 사용
            if (dailyMax === 0) {
                dailyMax = row.total || 0;
            }
            if (dailyMax > 0) {
                dailyTotals.push(dailyMax);
            }

            // 시간당 증가량 계산
            for (let h = 1; h < 24; h++) {
                const currentHourKey = `hour_${h.toString().padStart(2, '0')}`;
                const prevHourKey = `hour_${(h - 1).toString().padStart(2, '0')}`;
                const currentValue = parseInt(row[currentHourKey]) || 0;
                const prevValue = parseInt(row[prevHourKey]) || 0;

                if (currentValue > 0 && prevValue > 0 && currentValue > prevValue) {
                    hourlyIncrements.push(currentValue - prevValue);
                }
            }
        });

        // 평균 출고수량 (범위 모드: 선택기간 평균, 기본: 최근 3일 평균)
        const avgDaily = dailyTotals.length > 0 ?
            Math.round(dailyTotals.reduce((a, b) => a + b, 0) / dailyTotals.length) : 0;

        // 평균 시간당 출고량 (범위 모드: 선택기간 평균)
        const avgHourly = hourlyIncrements.length > 0 ?
            Math.round(hourlyIncrements.reduce((a, b) => a + b, 0) / hourlyIncrements.length) : 0;

        console.log('Stats calculated:', { todayTotal, yesterdayLast, avgDaily, avgHourly });

        // UI 업데이트
        document.getElementById('today-total').textContent = todayTotal.toLocaleString();
        document.getElementById('yesterday-last').textContent = yesterdayLast.toLocaleString();
        // '오늘 예상 출고'는 차트가 최종 예측 시리즈(= AI 예측 반영 포함)를 확정하는 시점에만 설정한다.
        // 다만 같은 날짜에서 갱신될 때마다 '-'로 리셋하면 사용자가 값이 사라지는 현상을 보게 되므로,
        // 날짜가 바뀌는 경우에만 초기화한다.
        const maxEl = document.getElementById('max-hourly');
        try {
            const curDate = (latestRow && typeof latestRow.date === 'string') ? latestRow.date : null;
            if (maxEl && curDate && this.maxHourlyDisplayedDate !== curDate) {
                maxEl.textContent = '-';
                this.maxHourlyDisplayedDate = curDate;
            }
        } catch (e) {
            // ignore
        }
        document.getElementById('avg-hourly').textContent = avgHourly.toLocaleString();
        const avgDesc = document.getElementById('avg-hourly-desc');
        if (avgDesc) avgDesc.textContent = this.rangeMode ? '선택 기간 평균' : '이전 3일 평균';
    }


    renderDataEntryForm() {
        const container = document.getElementById('dynamic-data-entry-container');
        if (!container) return;

        const latestRow = this.data.length > 0 ? this.data[this.data.length - 1] : null;
        if (!latestRow) {
            container.innerHTML = '<p class="text-center text-sm p-4">데이터가 없습니다.</p>';
            return;
        }

        const currentHour = new Date().getHours();
        let fieldsHtml = '';
        let fieldIndex = 0;

        // 마지막으로 입력된 시간을 찾습니다.
        let lastEnteredHour = -1;
        for (let h = currentHour - 1; h >= 0; h--) {
            const hourKey = `hour_${h.toString().padStart(2, '0')}`;
            if (latestRow[hourKey] && parseInt(latestRow[hourKey], 10) > 0) {
                lastEnteredHour = h;
                break;
            }
        }

        for (let h = lastEnteredHour + 1; h < currentHour; h++) {
            const hourKey = `hour_${h.toString().padStart(2, '0')}`;
            const hasData = latestRow[hourKey] && parseInt(latestRow[hourKey], 10) > 0;

            if (!hasData) {
                fieldsHtml += `
                    <div class="rounded-lg border border-amber-300 bg-amber-50/70 p-2">
                        <div class="flex items-center justify-between gap-2 mb-1">
                            <label class="text-xs font-semibold text-amber-900" for="quantity_${fieldIndex}">${h.toString().padStart(2, '0')}:00</label>
                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-semibold">미입력</span>
                        </div>
                        <div>
                           <input type="hidden" name="hour_${fieldIndex}" value="${h}">
                           <input type="number" id="quantity_${fieldIndex}" name="quantity_${fieldIndex}" placeholder="누적 출고량 입력" class="input input-sm w-full border-2 border-amber-400 bg-white focus:border-amber-600 focus:outline-none" />
                        </div>
                    </div>
                `;
                fieldIndex++;
            }
        }

        if (fieldsHtml) {
            container.innerHTML = `
                <form id="dynamic-form">
                    <div class="space-y-3">${fieldsHtml}</div>
                    <button type="submit" id="submit-all-btn" class="btn btn-primary btn-sm w-full mt-4">일괄 제출</button>
                </form>
            `;
        } else {
            container.innerHTML = '<p class="text-center text-sm p-4">모든 시간의 데이터가 입력되었습니다.</p>';
        }
    }

    // 전일 vs 금일 시간별 증감, 최근 7일 시간별 평균(누적) 렌더링
    renderAuxStats() {
        try {
            const diffEl = document.getElementById('table-diff-day');
            const weekEl = document.getElementById('table-weekly-hourly');
            if (!diffEl && !weekEl) return;
            if (this.rangeMode) {
                if (diffEl) diffEl.innerHTML = '<div class="text-xs opacity-60">기간 조회 중: 통합 표는 기본 모드에서 표시됩니다.</div>';
                if (weekEl) { try { if (weekEl.closest) weekEl.closest('.card').style.display = 'none'; else weekEl.parentElement.parentElement.style.display = 'none'; } catch { } }
                return;
            }
            if (!this.data || this.data.length === 0) {
                if (diffEl) diffEl.innerHTML = '<div class="text-xs opacity-60">데이터 없음</div>';
                if (weekEl) { try { if (weekEl.closest) weekEl.closest('.card').style.display = 'none'; else weekEl.parentElement.parentElement.style.display = 'none'; } catch { } }
                return;
            }
            const hours = Array.from({ length: 24 }, (_, i) => i);
            const key = (x) => 'hour_' + String(x).padStart(2, '0');
            const today = this.data[this.data.length - 1] || null;
            const yesterday = this.data.length > 1 ? this.data[this.data.length - 2] : null;
            const getInc = (row, h) => {
                if (!row || h === 0) return null;
                const a = parseInt(row[key(h)]) || 0;
                const b = parseInt(row[key(h - 1)]) || 0;
                if (a > 0 && b > 0 && a >= b) return a - b;
                if (a === 0 && b === 0) return 0;
                return null;
            };
            // base today increments
            const incT = hours.map(h => getInc(today, h));
            // yesterday increments
            const incY = hours.map(h => getInc(yesterday, h));
            // weekly avg increments (today 제외 최근7일)
            const days = this.data.slice(0, -1).slice(-7);
            const avg = hours.map(h => {
                if (h === 0 || days.length === 0) return 0;
                let sum = 0, cnt = 0; days.forEach(r => { const a = parseInt(r[key(h)]) || 0; const b = parseInt(r[key(h - 1)]) || 0; if (a > 0 && b > 0 && a >= b) { sum += (a - b); cnt++; } });
                return cnt ? Math.round(sum / cnt) : 0;
            });
            // predicted increments for today
            const flags = (this.predictedFlags && Array.isArray(this.predictedFlags)) ? this.predictedFlags : [];
            const series = (this.predictedSeries && Array.isArray(this.predictedSeries)) ? this.predictedSeries : [];
            const incPred = hours.map(h => {
                if (!flags[h] || h === 0) return null;
                const a = parseInt(series[h]) || 0; const b = parseInt(series[h - 1]) || 0; return (a > 0 && b > 0 && a >= b) ? (a - b) : null;
            });
            const incBase = hours.map(h => (incT[h] !== null && incT[h] !== undefined) ? incT[h] : incPred[h]);
            // cells
            const devCell = (base, comp, orange) => {
                if (base == null || comp == null) return '<td class="text-right opacity-60">-</td>';
                const d = comp - base;
                let cls = 'text-gray-500'; let sym = '•'; let txt = String(d);
                if (d > 0) { cls = 'text-red-600'; sym = '▲'; txt = '+' + d; }
                else if (d < 0) { cls = 'text-green-600'; sym = '▼'; }
                if (orange) cls = 'text-orange-500';
                return `<td class="text-right ${cls}">${sym} ${txt}</td>`;
            };
            const numCell = (n, orange) => {
                if (n == null) return '<td class="text-right opacity-60">-</td>';
                const cls = orange ? 'text-orange-500' : '';
                return `<td class="text-right ${cls}">${n}</td>`;
            };
            // build table: rows -> 금일 증감, 전일 편차(전일-금일), 최근7일 편차(7일-금일), 금일 예측 증감, 예측 편차(예측-7일)
            const head = ['<table class="table table-compact"><thead><tr><th>구분</th>']
                .concat(hours.map(h => `<th class="text-right">${String(h).padStart(2, '0')}</th>`))
                .concat(['</tr></thead><tbody>']).join('');
            const rowT = ['<tr><td>금일 증감</td>']
                .concat(hours.map((h) => numCell(incBase[h], !!(flags[h] && (incT[h] == null || incT[h] === undefined)))))
                .concat(['</tr>']).join('');
            const rowY = ['<tr><td>전일 대비 편차</td>']
                .concat(hours.map((h) => devCell(incBase[h], incY[h], false)))
                .concat(['</tr>']).join('');
            const rowW = ['<tr><td>최근7일 평균 대비 편차</td>']
                .concat(hours.map((h) => devCell(incBase[h], avg[h], false)))
                .concat(['</tr>']).join('');
            const tail = '</tbody></table>';
            if (diffEl) diffEl.innerHTML = head + rowT + rowY + rowW + tail;
            if (weekEl) { try { if (weekEl.closest) weekEl.closest('.card').style.display = 'none'; else weekEl.parentElement.parentElement.style.display = 'none'; } catch { } }
        } catch (e) {
            console.warn('renderAuxStats failed:', e);
        }
    }

    initChart() {
        try {
            console.log('Initializing chart...');
            console.log('Chart.js available:', typeof Chart !== 'undefined');
            console.log('Plugins initialized:', pluginsInitialized);

            const chartElement = document.getElementById(this.chartId);
            console.log('Chart element found:', chartElement !== null);

            if (!chartElement) {
                throw new Error(`Chart element with id '${this.chartId}' not found`);
            }

            if (typeof Chart === 'undefined') {
                throw new Error('Chart.js is not loaded');
            }

            // 플러그인이 초기화되지 않았다면 다시 시도
            if (!pluginsInitialized) {
                console.log('Plugins not initialized, attempting to initialize...');
                pluginsInitialized = initializeChartPlugins();
            }

            const ctx = chartElement.getContext('2d');
            console.log('Canvas context created:', ctx !== null);

            // Chart.js 플러그인 확인
            console.log('ChartDataLabels 플러그인 로드 확인:', typeof ChartDataLabels);
            if (typeof Chart !== 'undefined' && Chart.version) {
                console.log('Chart.js 버전:', Chart.version);
            }

            if (pluginsInitialized) {
                try {
                    if (Chart.registry && Chart.registry.plugins) {
                        if (Array.isArray(Chart.registry.plugins.items)) {
                            console.log('등록된 플러그인 목록:', Chart.registry.plugins.items.map(p => p.id));
                        } else {
                            console.log('등록된 플러그인 목록:', Object.keys(Chart.registry.plugins));
                        }
                    } else {
                        console.log('플러그인 레지스트리 정보 없음');
                    }
                } catch (e) {
                    console.log('플러그인 정보 조회 실패:', e.message);
                }
            } else {
                console.warn('ChartDataLabels 플러그인이 등록되지 않았습니다. 라벨이 표시되지 않을 수 있습니다.');
            }

            // 차트 설정 객체 생성
            const chartConfig = {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: '오늘',
                        data: [],
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderColor: 'rgba(239, 68, 68, 1)',
                        borderWidth: 2.2,
                        fill: false,
                        tension: 0.4,
                        spanGaps: true,
                        pointBackgroundColor: 'rgba(239, 68, 68, 1)',
                        pointBorderColor: 'rgba(239, 68, 68, 1)',
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        datalabels: {
                            display: function (context) {
                                const value = context.dataset.data[context.dataIndex];
                                return value !== null && value !== undefined && !isNaN(value) && Number(value) > 0;
                            },
                            color: '#ef4444',
                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                            borderColor: '#ef4444',
                            borderRadius: 4,
                            borderWidth: 1,
                            font: {
                                weight: 'bold',
                                size: 12.5
                            },
                            // 오늘(가장 최근일) 라벨은 숫자만 표기 (예측 포함)
                            formatter: function (value) {
                                if (value === null || value === undefined || isNaN(value)) return '';
                                const numValue = Number(value);
                                if (isNaN(numValue)) return '';
                                return numValue.toLocaleString();
                            },
                            padding: {
                                top: 2,
                                bottom: 2,
                                left: 4,
                                right: 4
                            },
                            anchor: 'end',
                            align: 'top'
                        },
                        segment: {
                            borderColor: function (ctx) {
                                const dataset = ctx.chart.data.datasets[ctx.datasetIndex];
                                const isPredicted = dataset.isPredicted && dataset.isPredicted[ctx.p1DataIndex];
                                return isPredicted ? 'rgba(249, 115, 22, 1)' : 'rgba(239, 68, 68, 1)';
                            },
                            borderDash: function (ctx) {
                                const dataset = ctx.chart.data.datasets[ctx.datasetIndex];
                                const isPredicted = dataset.isPredicted && dataset.isPredicted[ctx.p1DataIndex];
                                return isPredicted ? [5, 5] : []; // 예측 구간은 점선
                            }
                        }
                    }, {
                        label: '어제',
                        data: [],
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        spanGaps: true,
                        pointBackgroundColor: 'rgba(59, 130, 246, 1)',
                        pointBorderColor: 'rgba(59, 130, 246, 1)',
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        datalabels: {
                            display: function (context) {
                                const value = context.dataset.data[context.dataIndex];
                                const dataset = context.dataset.data;
                                let lastValidIndex = -1;
                                for (let i = dataset.length - 1; i >= 0; i--) {
                                    if (dataset[i] !== null && dataset[i] !== undefined && dataset[i] > 0) {
                                        lastValidIndex = i;
                                        break;
                                    }
                                }
                                return context.dataIndex === lastValidIndex && value > 0;
                            },
                            color: '#3b82f6',
                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                            borderColor: '#3b82f6',
                            borderRadius: 4,
                            borderWidth: 1,
                            font: {
                                weight: 'bold',
                                size: 12.5
                            },
                            formatter: function (value, context) {
                                if (value === null || value === undefined || isNaN(value)) return '';
                                const numValue = Number(value);
                                if (isNaN(numValue)) return '';
                                return numValue.toLocaleString() + ' BOX';
                            },
                            padding: {
                                top: 2,
                                bottom: 2,
                                left: 4,
                                right: 4
                            },
                            anchor: 'end',
                            align: 'top'
                        }
                    }, {
                        label: '그저께',
                        data: [],
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        borderColor: 'rgba(34, 197, 94, 1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        spanGaps: true,
                        pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                        pointBorderColor: 'rgba(34, 197, 94, 1)',
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        datalabels: {
                            display: function (context) {
                                const value = context.dataset.data[context.dataIndex];
                                const dataset = context.dataset.data;
                                let lastValidIndex = -1;
                                for (let i = dataset.length - 1; i >= 0; i--) {
                                    if (dataset[i] !== null && dataset[i] !== undefined && dataset[i] > 0) {
                                        lastValidIndex = i;
                                        break;
                                    }
                                }
                                return context.dataIndex === lastValidIndex && value > 0;
                            },
                            color: '#22c55e',
                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                            borderColor: '#22c55e',
                            borderRadius: 4,
                            borderWidth: 1,
                            font: {
                                weight: 'bold',
                                size: 12.5
                            },
                            formatter: function (value, context) {
                                if (value === null || value === undefined || isNaN(value)) return '';
                                const numValue = Number(value);
                                if (isNaN(numValue)) return '';
                                return numValue.toLocaleString() + ' BOX';
                            },
                            padding: {
                                top: 2,
                                bottom: 2,
                                left: 4,
                                right: 4
                            },
                            anchor: 'end',
                            align: 'top'
                        }
                    }, {
                        label: '시간별 증감량',
                        type: 'bar',
                        data: [],
                        backgroundColor: function (ctx) {
                            const dataset = ctx.chart.data.datasets[0]; // 오늘 데이터셋 참조
                            const isPredicted = dataset.isPredicted && dataset.isPredicted[ctx.dataIndex];
                            return isPredicted ? 'rgba(249, 115, 22, 0.7)' : 'rgba(59, 130, 246, 0.7)';
                        },
                        borderColor: function (ctx) {
                            const dataset = ctx.chart.data.datasets[0]; // 오늘 데이터셋 참조
                            const isPredicted = dataset.isPredicted && dataset.isPredicted[ctx.dataIndex];
                            return isPredicted ? 'rgba(249, 115, 22, 1)' : 'rgba(59, 130, 246, 1)';
                        },
                        borderWidth: 1,
                        yAxisID: 'y', // 왼쪽 Y축(누적 출고량) 사용
                        order: 2, // 선 그래프보다 뒤에 렌더링
                        barThickness: 'flex',
                        maxBarThickness: 20, // 막대 두께 줄임
                        categoryPercentage: 0.6, // 카테고리 폭 조정
                        barPercentage: 0.8, // 막대 폭 조정
                        datalabels: {
                            display: function (context) {
                                const value = context.dataset.data[context.dataIndex];
                                return value !== null && value !== undefined && !isNaN(value) && value !== 0;
                            },
                            color: '#3b82f6',
                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                            borderColor: '#3b82f6',
                            borderRadius: 4,
                            borderWidth: 1,
                            font: {
                                weight: 'bold',
                                size: 11.25
                            },
                            formatter: function (value, context) {
                                if (value === null || value === undefined || isNaN(value)) return '';
                                const numValue = Number(value);
                                if (isNaN(numValue) || numValue === 0) return '';
                                const sign = numValue > 0 ? '+' : '';
                                return sign + numValue.toLocaleString();
                            },
                            padding: {
                                top: 2,
                                bottom: 2,
                                left: 4,
                                right: 4
                            },
                            anchor: 'end',
                            align: 'top'
                        }
                    }, {
                        // 🆕 주간 평균 증감량 라인 그래프 (막대 그래프 위에 표시)
                        label: '주간 평균 증감',
                        type: 'line',
                        data: [],
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        borderColor: 'rgba(139, 92, 246, 0.8)',
                        borderWidth: 2,
                        borderDash: [5, 5], // 점선
                        fill: false,
                        tension: 0.3,
                        spanGaps: true,
                        pointBackgroundColor: 'rgba(139, 92, 246, 0.8)',
                        pointBorderColor: 'rgba(139, 92, 246, 0.8)',
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        yAxisID: 'y',
                        order: 0, // 막대 그래프보다 앞에 표시
                        datalabels: {
                            display: function (context) {
                                const value = context.dataset.data[context.dataIndex];
                                return value !== null && value !== undefined && !isNaN(value) && Number(value) > 0;
                            },
                            color: '#8b5cf6',
                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                            borderColor: '#8b5cf6',
                            borderRadius: 4,
                            borderWidth: 1,
                            font: {
                                weight: 'bold',
                                size: 11
                            },
                            formatter: function (value) {
                                if (value === null || value === undefined || isNaN(value)) return '';
                                const sign = Number(value) > 0 ? '+' : '';
                                return sign + Number(value).toLocaleString();
                            },
                            padding: {
                                top: 2,
                                bottom: 2,
                                left: 4,
                                right: 4
                            },
                            anchor: 'start',
                            align: 'bottom'
                        }
                    }, {
                        // 🆕 주간 평균 누적 (실선 -datasets[5])
                        label: '주간 평균 누적',
                        type: 'line',
                        data: [],
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        borderColor: 'rgba(139, 92, 246, 0.8)',
                        borderWidth: 2,
                        borderDash: [5, 5], // 점선으로 변경
                        fill: false,
                        tension: 0.3,
                        spanGaps: true,
                        pointBackgroundColor: 'rgba(139, 92, 246, 0.8)',
                        pointBorderColor: 'rgba(139, 92, 246, 0.8)',
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        yAxisID: 'y',
                        order: 0,
                        datalabels: {
                            display: function (context) {
                                const value = context.dataset.data[context.dataIndex];
                                return value !== null && value !== undefined && !isNaN(value) && Number(value) > 0;
                            },
                            color: '#8b5cf6',
                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                            borderColor: '#8b5cf6',
                            borderRadius: 4,
                            borderWidth: 1,
                            font: {
                                weight: 'bold',
                                size: 11
                            },
                            formatter: function (value) {
                                if (value === null || value === undefined || isNaN(value)) return '';
                                return Number(value).toLocaleString();
                            },
                            padding: {
                                top: 2,
                                bottom: 2,
                                left: 4,
                                right: 4
                            },
                            anchor: 'end',
                            align: 'top'
                        }
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top'
                        },
                        tooltip: {
                            titleFont: {
                                size: 15  // 12 * 1.25 = 15
                            },
                            bodyFont: {
                                size: 15  // 12 * 1.25 = 15
                            },
                            callbacks: {
                                label: function (context) {
                                    if (!context.parsed || context.parsed.y === null || context.parsed.y === undefined) {
                                        return '';
                                    }
                                    const value = context.parsed.y;
                                    const isPredicted = context.dataset.isPredicted && context.dataset.isPredicted[context.dataIndex];
                                    const suffix = isPredicted ? '개 (예측)' : '개';
                                    return context.dataset.label + ': ' + value.toLocaleString() + suffix;
                                }
                            }
                        },
                        // datalabels 설정은 각 데이터셋에서 개별적으로 처리됨
                    },
                    scales: {
                        x: {
                            display: true,
                            title: {
                                display: true,
                                text: '시간',
                                font: {
                                    size: 16,
                                    weight: 'bold'
                                }
                            },
                            ticks: {
                                font: {
                                    size: 12
                                },
                                maxRotation: 0,
                                minRotation: 0
                            },
                            grid: {
                                lineWidth: 1,
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        y: {
                            display: true,
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: '누적 출고량',
                                font: {
                                    size: 16,
                                    weight: 'bold'
                                }
                            },
                            ticks: {
                                font: {
                                    size: 14
                                },
                                padding: 10,
                                callback: function (value) {
                                    if (value === null || value === undefined || isNaN(value)) return '';
                                    const numValue = Number(value);
                                    if (isNaN(numValue)) return '';
                                    return numValue.toLocaleString();
                                }
                            },
                            grid: {
                                lineWidth: 1,
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        }
                    }
                }
            };

            // Chart 인스턴스 생성
            this.chart = new Chart(ctx, chartConfig);

            // 전역 변수로 설정하여 브라우저에서 접근 가능하게 함
            window.chart = this.chart;

            console.log('Chart initialized successfully:', this.chart !== null);

            // 차트 생성 후 플러그인 상태 확인
            if (this.chart) {
                console.log('=== 차트 플러그인 상태 확인 ===');
                console.log('차트 인스턴스 플러그인:', this.chart.config.plugins);
                console.log('차트 옵션 플러그인:', this.chart.config.options.plugins);
                console.log('datalabels 설정:', this.chart.config.options.plugins.datalabels);

                // Chart.js 전역 플러그인 확인
                try {
                    if (Chart.registry && Chart.registry.plugins) {
                        if (Array.isArray(Chart.registry.plugins.items)) {
                            console.log('Chart.js 전역 등록된 플러그인:', Chart.registry.plugins.items.map(p => p.id));
                        } else {
                            console.log('Chart.js 전역 등록된 플러그인:', Object.keys(Chart.registry.plugins));
                        }
                    } else {
                        console.log('Chart.js 플러그인 레지스트리 정보 없음');
                    }
                } catch (e) {
                    console.log('Chart.js 플러그인 정보 조회 실패:', e.message);
                }

                // 실제 등록된 플러그인 확인
                const registeredPlugins = this.chart.config.plugins || [];
                console.log('차트에 등록된 플러그인 수:', registeredPlugins.length);
                registeredPlugins.forEach((plugin, index) => {
                    console.log(`플러그인 ${index}:`, plugin.id || plugin.name || 'unknown', plugin);
                });

                // 차트 데이터 확인
                console.log('차트 데이터셋 수:', this.chart.data.datasets.length);
                this.chart.data.datasets.forEach((dataset, index) => {
                    console.log(`데이터셋 ${index}:`, dataset.label, '데이터 길이:', dataset.data.length);
                });

                console.log('=== 차트 플러그인 상태 확인 완료 ===');
            }
            // AI 예측이 없거나 실패해도 "AI 예측 단계가 끝났다"는 점은 확정이므로 카드 업데이트를 허용
            if (!this.aiPredictionsLoaded) this.aiPredictionsLoaded = true;
        } catch (error) {
            console.error('🔮 AI prediction failed:', error);
            // 실패도 확정 상태로 간주(차트/카드는 통계 예측으로 고정)
            this.aiPredictionsLoaded = true;
        }
    }

    updateChart() {
        if (!this.chart) {
            console.error('Chart update failed: Chart not initialized');
            return;
        }

        if (this.data.length === 0) {
            console.log('Chart update skipped - no data available');
            return;
        }

        console.log('Updating chart with data length:', this.data.length);

        const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
        // 범위 모드: 선택 기간에 대한 라인들 + 시간대 평균 라인
        if (this.rangeMode) {
            try {
                const labels = hours.map(h => h + ':00');
                const days = [...this.data].sort((a, b) => a.date.localeCompare(b.date));
                const palette = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#d946ef', '#10b981', '#f43f5e', '#64748b'];
                const datasets = [];
                days.forEach((d, idx) => {
                    const values = hours.map(h => {
                        const v = parseInt(d[`hour_${h}`]);
                        return (v && v > 0) ? v : null;
                    });
                    datasets.push({
                        label: d.date,
                        data: values,
                        borderColor: palette[idx % palette.length],
                        backgroundColor: 'transparent',
                        borderWidth: 1.8,
                        fill: false,
                        tension: 0.35,
                        spanGaps: true,
                        pointRadius: 2,
                        datalabels: { display: false }
                    });
                });

                const avg = hours.map((h) => {
                    let sum = 0, cnt = 0;
                    for (const d of days) {
                        const v = parseInt(d[`hour_${h}`]);
                        if (v && v > 0) { sum += v; cnt++; }
                    }
                    return cnt > 0 ? Math.round(sum / cnt) : null;
                });
                datasets.push({
                    label: '기간 평균',
                    data: avg,
                    borderColor: '#111827',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    borderDash: [6, 4],
                    tension: 0.3,
                    pointRadius: 0,
                    datalabels: { display: false }
                });
                this.chart.data.labels = labels;
                this.chart.data.datasets = datasets;
                this.chart.update();
                console.log('Range-mode chart updated with', datasets.length, 'datasets');
                return; // 범위 모드 처리 종료
            } catch (e) {
                console.error('Range-mode chart update failed:', e);
            }
        }

        // 최근 3일 데이터 가져오기
        const recentData = this.data.slice(-3);
        console.log('Recent data for chart:', recentData.map(d => ({ date: d.date, dayOfWeek: d.dayOfWeek })));

        const todayData = recentData.length > 0 ? recentData[recentData.length - 1] : {};
        const yesterdayData = recentData.length > 1 ? recentData[recentData.length - 2] : {};
        const dayBeforeYesterdayData = recentData.length > 2 ? recentData[recentData.length - 3] : {};

        console.log('Chart data objects:');
        console.log('Today data keys:', Object.keys(todayData).filter(k => k.startsWith('hour_')).slice(0, 5));
        console.log('Yesterday data keys:', Object.keys(yesterdayData).filter(k => k.startsWith('hour_')).slice(0, 5));

        // 시간별 데이터 배열 생성 
        // 사진 패턴 분석: 0시에 높은 값에서 시작, 1시에 낮은 값으로 급락 후 점진적 증가
        // 이는 0시가 전날 종료값, 1-23시가 당일 시간별 누적값을 나타냄
        const todayValues = hours.map(h => {
            const hourKey = `hour_${h}`;
            const value = parseInt(todayData[hourKey]);
            return (value && value > 0) ? value : null;
        });

        // 오늘 데이터의 예측값 계산 (누락된 시간대에 대해)
        const todayPredictionResult = this.addPredictiveValues(todayValues);
        const todayValuesWithPrediction = todayPredictionResult.values;

        const yesterdayValues = hours.map(h => {
            const hourKey = `hour_${h}`;
            const value = parseInt(yesterdayData[hourKey]);
            return (value && value > 0) ? value : null;
        });

        const dayBeforeYesterdayValues = hours.map(h => {
            const hourKey = `hour_${h}`;
            const value = parseInt(dayBeforeYesterdayData[hourKey]);
            return (value && value > 0) ? value : null;
        });

        console.log('Chart data arrays:');
        console.log('Today values:', todayValues.slice(0, 10));
        console.log('Yesterday values:', yesterdayValues.slice(0, 10));
        console.log('Day before yesterday values:', dayBeforeYesterdayValues.slice(0, 10));
        console.log(`📊 Today values 전체 길이: ${todayValues.length}, 마지막 5개:`, todayValues.slice(-5));

        // 🔍 AI Predictions 상태 확인
        console.log('🔍 aiPredictions 존재 여부:', !!this.aiPredictions);
        console.log('🔍 aiPredictions 키 개수:', this.aiPredictions ? Object.keys(this.aiPredictions).length : 0);
        console.log('🔍 aiPredictions 내용:', this.aiPredictions);

        // 🔮 AI 예측값이 있으면 통계 예측값을 덮어씀
        if (this.aiPredictions && Object.keys(this.aiPredictions).length > 0) {
            console.log('🔮 Applying AI predictions to chart (NO safety guard)');

            // 🔥 모든 aiPredictions 키를 순회하여 적용
            Object.keys(this.aiPredictions).forEach(hourKey => {
                const hour = parseInt(hourKey.replace('hour_', ''));
                const aiValue = this.aiPredictions[hourKey];

                if (aiValue !== undefined && aiValue !== null && hour >= 0 && hour <= 23) {
                    todayValuesWithPrediction[hour] = Math.round(aiValue);
                    todayPredictionResult.isPredicted[hour] = true;
                }
            });

            console.log('✅ 예측값 그대로 적용 (검증 없음)');
            console.log(`📊 예측 적용 후 마지막 5개:`, todayValuesWithPrediction.slice(-5));
        }

        // 최소한 하나의 데이터셋에 0이 아닌 값이 있는지 확인
        const totalValues = [...todayValues, ...yesterdayValues, ...dayBeforeYesterdayValues];
        const nonZeroCount = totalValues.filter(v => v > 0).length;
        console.log('Non-zero values count:', nonZeroCount);

        try {
            // 시간별 증감량 계산
            const todayIncrements = this.calculateHourlyIncrements(todayValuesWithPrediction, todayPredictionResult.isPredicted);

            console.log(`막대그래프 데이터:`, todayIncrements.filter(v => v !== null).slice(0, 10));

            // 🆕 현재시간 계산 (마지막 실제값이 있는 시간)
            const currentHour = this.getLastNonZeroHour(todayData);
            const currentHourKey = `hour_${String(currentHour).padStart(2, '0')}`;
            const currentHourValue = parseInt(todayData[currentHourKey]) || 0;

            // 🆕 주간 평균 증감량 계산 (시간별)
            const weeklyAvgIncrements = this.calculateWeeklyAvgIncrements(currentHour);

            // 🆕 datasets[4]는 시간별 증감량 (막대 그래프 위에 선으로 표시)
            this.chart.data.datasets[4].data = weeklyAvgIncrements;

            // 🆕 datasets[5] 주간 평균 누적 (분기: 현재시간까지 실제값, 이후 평균증감누적)
            const weeklyAvgCumulative = this.calculateWeeklyAvgCumulative(todayData, currentHour);
            this.chart.data.datasets[5].data = weeklyAvgCumulative;

            this.chart.data.labels = hours.map(h => h + ':00');
            this.chart.data.datasets[0].data = todayValuesWithPrediction;
            this.predictedFlags = todayPredictionResult.isPredicted;
            this.predictedSeries = todayValuesWithPrediction;

            // 카드(오늘 예상 출고)는 차트의 "최종 예측 시리즈"(AI 예측 반영 포함)와 완전히 동일하게 맞춘다.
            // NOTE: 통계 업데이트(updateStats)보다 차트 업데이트가 늦게 실행될 수 있으므로,
            // 차트 데이터가 확정되는 이 지점에서 카드 값을 다시 덮어쓴다.
            try {
                // IMPORTANT: 새로고침 시 676 -> 604 깜빡임의 원인 = AI 예측 적용 전/후 updateChart가 2번 돌면서
                // 카드가 중간값(통계 예측)으로 잠깐 표시됨.
                // 따라서 AI 예측이 "로딩 완료"로 확정되기 전(aiPredictionsLoaded=false)에는 카드에 숫자를 쓰지 않는다.
                const el = document.getElementById('max-hourly');
                if (el && this.aiPredictionsLoaded) {
                    const v23 = Number(todayValuesWithPrediction?.[23]);
                    if (Number.isFinite(v23) && v23 >= 0) {
                        el.textContent = Math.round(v23).toLocaleString();
                    }
                }
            } catch (e) {
                console.warn('[Dashboard] failed to sync todayEstimated card with chart series', e);
            }
            this.chart.data.datasets[1].data = yesterdayValues;
            this.chart.data.datasets[2].data = dayBeforeYesterdayValues;
            this.chart.data.datasets[3].data = todayIncrements; // 막대그래프 데이터

            // 차트 데이터셋 레이블 업데이트 및 예측값 정보 추가
            if (todayData.date) {
                this.chart.data.datasets[0].label = `오늘 (${todayData.date})`;
                this.chart.data.datasets[0].isPredicted = todayPredictionResult.isPredicted;
            }
            if (yesterdayData.date) {
                this.chart.data.datasets[1].label = `어제 (${yesterdayData.date})`;
            }
            if (dayBeforeYesterdayData.date) {
                this.chart.data.datasets[2].label = `그저께 (${dayBeforeYesterdayData.date})`;
            }

            // Y축 동적 스케일 조정: 표시값의 최대값을 Y축 최고점으로 사용
            const collectValues = (arr, predicate = () => true) =>
                arr.filter((value, idx) => predicate(value, idx) && value !== null && value !== undefined && !isNaN(value) && Number(value) > 0)
                    .map((value) => Number(value));

            const actualTodayValues = collectValues(todayValuesWithPrediction, (_value, idx) => !todayPredictionResult.isPredicted[idx]);
            const predictedTodayValues = collectValues(todayValuesWithPrediction, (_value, idx) => todayPredictionResult.isPredicted[idx]);
            const yesterdayPositive = collectValues(yesterdayValues);
            const dayBeforePositive = collectValues(dayBeforeYesterdayValues);

            const allRelevantValues = [
                ...actualTodayValues,
                ...predictedTodayValues,
                ...yesterdayPositive,
                ...dayBeforePositive,
            ];

            const maxValue = allRelevantValues.length ? Math.max(...allRelevantValues) : 0;
            const finalMax = maxValue > 0 ? maxValue : 100;

            if (this.chart.options && this.chart.options.scales && this.chart.options.scales.y) {
                this.chart.options.scales.y.max = finalMax;
                this.chart.options.scales.y.suggestedMax = finalMax;
                // Chart.js 기본 틱 생성에 맡겨 최댓값을 정확히 상한으로 사용
                if (this.chart.options.scales.y.ticks) {
                    delete this.chart.options.scales.y.ticks.stepSize;
                }
                console.log('[Chart] Y-axis updated', { maxValue, finalMax });
            }

            // 🔮 AI 예측 라인 통합 완료 (기존 라인 대체)

            this.chart.update();
            console.log('Chart updated successfully');

            // 라벨링 상태 확인
            console.log('Chart plugins registered:', this.chart.config.plugins);
            console.log('Datalabels plugin active:', this.chart.config.options.plugins.datalabels !== undefined);

            // 각 데이터셋의 라벨 표시 상태 확인
            this.chart.data.datasets.forEach((dataset, index) => {
                const sampleValue = dataset.data.find(v => v !== null && v > 0);
                if (sampleValue) {
                    console.log(`Dataset ${index} (${dataset.label}): 샘플값 ${sampleValue}, 라벨 표시 설정:`, dataset.datalabels?.display);
                }
            });
        } catch (error) {
            console.error('Chart update failed:', error);
            this.showError('차트 업데이트 실패: ' + error.message);
        }
    }


    updateLastUpdate() {
        document.getElementById('last-update').textContent = new Date().toLocaleString('ko-KR');
    }

    updateStatus(status) {
        const statusBadge = document.getElementById('status-badge');
        statusBadge.textContent = status;
        statusBadge.className = status === '연결됨' ? 'badge badge-success' : 'badge badge-error';
    }

    showLoading() {
        document.getElementById('loading-modal').showModal();
    }

    hideLoading() {
        document.getElementById('loading-modal').close();
    }

    showError(message) {
        document.getElementById('error-message').textContent = message;
        document.getElementById('error-modal').showModal();
    }

    async refreshData() {
        await this.loadData();
    }

    startAutoRefresh(interval = 30000) {
        this.stopAutoRefresh();
        this.refreshInterval = setInterval(() => {
            this.refreshData();
        }, interval);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    addPredictiveValues(values) {
        console.log('🎯 addPredictiveValues 호출됨 (캐시 없음 버전)');
        const result = [...values];
        const isPredicted = new Array(values.length).fill(false);

        // aiPredictions가 있으면 직접 사용
        if (this.aiPredictions && Object.keys(this.aiPredictions).length > 0) {
            console.log('✅ aiPredictions 직접 사용 (실시간)');

            // 🔥 모든 aiPredictions 키를 순회 (currentHour 무시!)
            Object.keys(this.aiPredictions).forEach(hourKey => {
                const hour = parseInt(hourKey.replace('hour_', ''));
                const predictedValue = this.aiPredictions[hourKey];

                if (predictedValue !== undefined && predictedValue !== null && hour >= 0 && hour <= 23) {
                    result[hour] = predictedValue;
                    isPredicted[hour] = true;
                }
            });

            console.log('✅ 예측값 적용 완료:', this.aiPredictions);
            console.log('✅ 적용된 인덱스:', Object.keys(this.aiPredictions).map(k => parseInt(k.replace('hour_', ''))));
        } else {
            for (let i = 1; i < result.length; i++) {
                const current = result[i];
                if (current !== null && current !== undefined && !isNaN(current) && Number(current) > 0) {
                    continue;
                }
                const prev = result[i - 1];
                if (prev === null || prev === undefined || isNaN(prev) || Number(prev) <= 0) {
                    continue;
                }
                try {
                    const predicted = this.calculateRealisticPrediction({
                        targetHour: i,
                        previousPredictedValue: Number(prev)
                    });
                    if (predicted !== undefined && predicted !== null && !isNaN(predicted) && Number(predicted) > 0) {
                        result[i] = Math.round(Number(predicted));
                        isPredicted[i] = true;
                    }
                } catch (e) {
                    result[i] = Number(prev) + 10;
                    isPredicted[i] = true;
                }
            }
        }

        return { values: result, isPredicted };
    }

    // 현실적 예측값 계산 - 각 시간대별 절대값 기준 유사 사례 분석
    calculateRealisticPrediction(params) {
        const { targetHour, previousPredictedValue } = params;

        console.log(`\n=== ${targetHour}시 예측 시작 ===`);

        const refRow = this.getCurrentDayData();
        const refDate = (refRow && refRow.date) ? new Date(refRow.date) : new Date();

        // 1. 해당 시간대의 과거 유사 값들 찾기
        const similarCases = this.findSimilarValueCasesForHour(targetHour, previousPredictedValue);
        console.log(`${targetHour}시 ${previousPredictedValue}와 유사한 과거 사례:`, similarCases.length, '건');

        if (similarCases.length === 0) {
            // 유사 사례가 없으면 최소 증가만 적용
            const minIncrease = previousPredictedValue * 0.005; // 0.5% 증가
            return previousPredictedValue + minIncrease;
        }

        // 2. 유사 사례들의 다음 시간 값들 분석
        const nextHourValues = this.extractNextHourValues(similarCases, targetHour);
        console.log(`${targetHour}시 유사 사례들의 다음 시간 값들:`, nextHourValues);

        // 3. 기본 예측값 계산 (중간값 사용)
        const basePrediction = this.calculateBasePrediction(nextHourValues);
        console.log(`${targetHour}시 기본 예측값:`, basePrediction);

        // 4. 요일별 보정 계수 적용
        const dayOfWeekAdjustment = this.getDayOfWeekAdjustment(targetHour, refDate);
        console.log(`요일별 보정 (${this.getDayName(refDate)}):`, dayOfWeekAdjustment);

        // 5. 월중 시기별 보정 계수 적용
        const monthPeriodAdjustment = this.getMonthPeriodAdjustment(refDate);
        console.log(`월중 시기별 보정:`, monthPeriodAdjustment);

        // 6. 시간대별 증감 추이 보정
        const timeBasedAdjustment = this.getTimeBasedAdjustment(targetHour);
        console.log(`시간대별 증감 추이 보정:`, timeBasedAdjustment);

        // 7. 최근 일주일 출고 추이 보정
        const weeklyTrendAdjustment = this.getWeeklyTrendAdjustment();
        console.log(`최근 일주일 추이 보정:`, weeklyTrendAdjustment);

        // 8. 최종 예측값 계산 (보정 계수들을 현실적 범위로 제한)
        const limitedDayAdj = Math.max(0.95, Math.min(dayOfWeekAdjustment, 1.10)); // ±10% 제한
        const limitedMonthAdj = Math.max(0.98, Math.min(monthPeriodAdjustment, 1.05)); // ±5% 제한
        const limitedTimeAdj = Math.max(0.98, Math.min(timeBasedAdjustment, 1.05)); // ±5% 제한
        const limitedWeeklyAdj = Math.max(0.90, Math.min(weeklyTrendAdjustment, 1.10)); // ±10% 제한

        const combinedAdj = limitedDayAdj * limitedMonthAdj * limitedTimeAdj * limitedWeeklyAdj;
        const cappedAdj = Math.max(0.85, Math.min(combinedAdj, 1.15)); // 최대 1.15배 상한

        let finalPrediction = basePrediction * cappedAdj;

        // 9. 현실적 상한선 적용 (최근 일주일 평균 기준)
        const recentWeeklyAverage = this.getRecentWeeklyAverage();
        const realisticMaxLimit = recentWeeklyAverage * 1.2; // 주간 평균의 1.2배 이하

        console.log(`현실성 검증 - 주간평균: ${Math.round(recentWeeklyAverage)}, 상한선: ${Math.round(realisticMaxLimit)}`);

        if (finalPrediction > realisticMaxLimit) {
            console.log(`예측값 ${Math.round(finalPrediction)}이 상한선 ${Math.round(realisticMaxLimit)}을 초과하여 조정됨`);
            finalPrediction = realisticMaxLimit;
        }

        // 10. 누적 원칙 보장 - 이전값보다 반드시 증가
        const minValue = previousPredictedValue * 1.002; // 최소 0.2% 증가
        finalPrediction = Math.max(finalPrediction, minValue);

        console.log(`최종 예측: ${Math.round(finalPrediction)} (기본: ${basePrediction}, 상한선적용후)`);

        return finalPrediction;
    }

    // 특정 시간대에서 유사한 값을 가진 과거 사례 찾기 (매우 정밀한 범위)
    findSimilarValueCasesForHour(targetHour, referenceValue) {
        const similarCases = [];
        const tolerance = referenceValue * 0.0005; // ±0.05% 범위로 매우 정밀하게

        console.log(`${targetHour}시 ${referenceValue}에서 ±${Math.round(tolerance)} 범위로 검색`);

        this.data.forEach(row => {
            if (!row.date) return;

            const hourKey = `hour_${targetHour.toString().padStart(2, '0')}`;
            const valueAtHour = parseInt(row[hourKey]) || 0;

            // 매우 정밀한 범위 내의 데이터만 선택
            if (valueAtHour > 0 &&
                Math.abs(valueAtHour - referenceValue) <= tolerance) {

                // 해당 날짜의 모든 시간대 데이터 포함
                const caseData = {
                    date: row.date,
                    targetHourValue: valueAtHour,
                    similarity: Math.abs(valueAtHour - referenceValue)
                };

                for (let h = 0; h <= 23; h++) {
                    const hKey = `hour_${h.toString().padStart(2, '0')}`;
                    caseData[`hour_${h}`] = parseInt(row[hKey]) || 0;
                }
                similarCases.push(caseData);
            }
        });

        // 매우 정밀한 검색으로 사례가 없으면 범위를 점진적으로 확대
        if (similarCases.length === 0) {
            const expandedTolerance = referenceValue * 0.005; // ±0.5%로 확대
            console.log(`정밀 검색 실패, ±${Math.round(expandedTolerance)} 범위로 재검색`);

            this.data.forEach(row => {
                if (!row.date) return;

                const hourKey = `hour_${targetHour.toString().padStart(2, '0')}`;
                const valueAtHour = parseInt(row[hourKey]) || 0;

                if (valueAtHour > 0 &&
                    Math.abs(valueAtHour - referenceValue) <= expandedTolerance) {

                    const caseData = {
                        date: row.date,
                        targetHourValue: valueAtHour,
                        similarity: Math.abs(valueAtHour - referenceValue)
                    };

                    for (let h = 0; h <= 23; h++) {
                        const hKey = `hour_${h.toString().padStart(2, '0')}`;
                        caseData[`hour_${h}`] = parseInt(row[hKey]) || 0;
                    }
                    similarCases.push(caseData);
                }
            });
        }

        // 여전히 사례가 없으면 최대 5% 범위까지
        if (similarCases.length === 0) {
            const maxTolerance = referenceValue * 0.05; // ±5%
            console.log(`확대 검색 실패, ±${Math.round(maxTolerance)} 범위로 최종 검색`);

            this.data.forEach(row => {
                if (!row.date) return;

                const hourKey = `hour_${targetHour.toString().padStart(2, '0')}`;
                const valueAtHour = parseInt(row[hourKey]) || 0;

                if (valueAtHour > 0 &&
                    Math.abs(valueAtHour - referenceValue) <= maxTolerance) {

                    const caseData = {
                        date: row.date,
                        targetHourValue: valueAtHour,
                        similarity: Math.abs(valueAtHour - referenceValue)
                    };

                    for (let h = 0; h <= 23; h++) {
                        const hKey = `hour_${h.toString().padStart(2, '0')}`;
                        caseData[`hour_${h}`] = parseInt(row[hKey]) || 0;
                    }
                    similarCases.push(caseData);
                }
            });
        }

        // 유사도 순으로 정렬 (더 비슷한 값 우선)
        similarCases.sort((a, b) => a.similarity - b.similarity);

        console.log(`최종 검색 결과: ${similarCases.length}건 (평균 차이: ${similarCases.length > 0 ? Math.round(similarCases.reduce((sum, c) => sum + c.similarity, 0) / similarCases.length) : 0})`);

        return similarCases;
    }

    // 유사 사례들의 다음 시간 값들 추출
    extractNextHourValues(similarCases, currentHour) {
        const nextHour = currentHour + 1;
        if (nextHour > 23) return [];

        const nextHourValues = [];

        similarCases.forEach(caseData => {
            const nextValue = caseData[`hour_${nextHour}`];
            if (nextValue > 0) {
                nextHourValues.push({
                    value: nextValue,
                    date: caseData.date,
                    similarity: caseData.similarity
                });
            }
        });

        return nextHourValues;
    }

    // 기본 예측값 계산 (보수적 접근 - 25번째 백분위수 사용)
    calculateBasePrediction(nextHourValues) {
        if (nextHourValues.length === 0) return 0;

        // 값들만 추출하여 정렬
        const values = nextHourValues.map(item => item.value).sort((a, b) => a - b);

        // 25번째 백분위수 계산 (더 보수적인 예측)
        const q1Index = Math.floor(values.length * 0.25);
        const q1 = values[q1Index];

        // 중간값도 계산
        const medianIndex = Math.floor(values.length / 2);
        const median = values.length % 2 === 0
            ? (values[medianIndex - 1] + values[medianIndex]) / 2
            : values[medianIndex];

        // 25번째 백분위수와 중간값 중 더 보수적인 값 선택
        const conservativeValue = Math.min(q1, median);

        console.log(`예측값 계산: Q1=${q1}, 중간값=${median}, 선택값=${conservativeValue}`);

        return conservativeValue;
    }

    // 시간대별 증감 추이 보정
    getTimeBasedAdjustment(targetHour) {
        // 과거 데이터에서 해당 시간대의 일반적인 증감 패턴 분석
        const hourlyGrowthRates = [];

        this.data.forEach(row => {
            if (!row.date) return;

            const currentHourKey = `hour_${targetHour.toString().padStart(2, '0')}`;
            const prevHourKey = `hour_${(targetHour - 1).toString().padStart(2, '0')}`;

            const currentValue = parseInt(row[currentHourKey]) || 0;
            const prevValue = parseInt(row[prevHourKey]) || 0;

            if (currentValue > 0 && prevValue > 0) {
                const growthRate = currentValue / prevValue;
                // 극단적인 값들 필터링 (0.5배 ~ 2배 범위만)
                if (growthRate >= 0.5 && growthRate <= 2.0) {
                    hourlyGrowthRates.push(growthRate);
                }
            }
        });

        if (hourlyGrowthRates.length === 0) {
            return 1.0; // 기본값
        }

        // 중간값 사용
        hourlyGrowthRates.sort((a, b) => a - b);
        const medianIndex = Math.floor(hourlyGrowthRates.length / 2);
        const medianGrowthRate = hourlyGrowthRates.length % 2 === 0
            ? (hourlyGrowthRates[medianIndex - 1] + hourlyGrowthRates[medianIndex]) / 2
            : hourlyGrowthRates[medianIndex];

        // 극단적 보정 방지 (0.9 ~ 1.15 범위)
        return Math.max(0.9, Math.min(medianGrowthRate, 1.15));
    }

    // 요일별 보정 계수
    getDayOfWeekAdjustment(targetHour, refDate = new Date()) {
        const dayOfWeek = refDate.getDay(); // 0: 일요일, 1: 월요일, ...

        // 과거 데이터에서 해당 요일의 시간대별 평균 활동 수준 분석
        const sameDayData = this.data.filter(row => {
            if (!row.date) return false;
            const rowDate = new Date(row.date);
            return rowDate.getDay() === dayOfWeek;
        });

        if (sameDayData.length === 0) {
            return 1.0; // 기본값
        }

        // 해당 시간대의 평균 활동도 계산
        const hourlyActivities = [];
        sameDayData.forEach(row => {
            const currentValue = parseInt(row[`hour_${targetHour.toString().padStart(2, '0')}`]) || 0;
            const prevValue = parseInt(row[`hour_${(targetHour - 1).toString().padStart(2, '0')}`]) || 0;

            if (currentValue > 0 && prevValue > 0) {
                hourlyActivities.push(currentValue / prevValue);
            }
        });

        if (hourlyActivities.length === 0) {
            return 1.0;
        }

        const avgActivity = hourlyActivities.reduce((a, b) => a + b, 0) / hourlyActivities.length;

        // 1.0을 기준으로 정규화하되 극단적 값 방지 (보수적으로 제한)
        return Math.max(0.9, Math.min(avgActivity, 1.1));
    }

    // 월중 시기별 보정 계수 (월초/중순/말)
    getMonthPeriodAdjustment(refDate = new Date()) {
        const dayOfMonth = refDate.getDate();

        // 월중 시기 구분
        let period = 'mid';
        if (dayOfMonth <= 10) {
            period = 'early'; // 월초
        } else if (dayOfMonth >= 21) {
            period = 'late';  // 월말
        }

        // 과거 데이터에서 해당 시기의 평균 활동 수준 분석
        const periodData = this.data.filter(row => {
            if (!row.date) return false;
            const rowDate = new Date(row.date);
            const rowDay = rowDate.getDate();

            if (period === 'early') return rowDay <= 10;
            if (period === 'late') return rowDay >= 21;
            return rowDay > 10 && rowDay < 21;
        });

        if (periodData.length === 0) {
            return 1.0;
        }

        // 해당 시기의 평균 성장률 계산
        const growthRates = [];
        periodData.forEach(row => {
            let maxValue = 0;
            for (let h = 0; h <= 23; h++) {
                const value = parseInt(row[`hour_${h.toString().padStart(2, '0')}`]) || 0;
                if (value > maxValue) maxValue = value;
            }
            if (maxValue > 0) {
                growthRates.push(maxValue);
            }
        });

        if (growthRates.length === 0) return 1.0;

        const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
        const overallAvg = this.calculateOverallAverage();

        if (overallAvg === 0) return 1.0;

        const adjustment = avgGrowth / overallAvg;

        // 극단적 값 방지 (보수적으로 제한)
        return Math.max(0.9, Math.min(adjustment, 1.1));
    }

    // 전체 데이터의 평균값 계산
    calculateOverallAverage() {
        const allMaxValues = [];

        this.data.forEach(row => {
            let maxValue = 0;
            for (let h = 0; h <= 23; h++) {
                const value = parseInt(row[`hour_${h.toString().padStart(2, '0')}`]) || 0;
                if (value > maxValue) maxValue = value;
            }
            if (maxValue > 0) {
                allMaxValues.push(maxValue);
            }
        });

        if (allMaxValues.length === 0) return 0;

        return allMaxValues.reduce((a, b) => a + b, 0) / allMaxValues.length;
    }

    // 최근 일주일 평균 출고량 계산
    getRecentWeeklyAverage() {
        if (this.data.length < 7) {
            return 500; // 기본값
        }

        const recentWeekData = this.data.slice(-7);
        const dailyTotals = [];

        recentWeekData.forEach(row => {
            let maxValue = 0;
            for (let h = 0; h <= 23; h++) {
                const value = parseInt(row[`hour_${h.toString().padStart(2, '0')}`]) || 0;
                if (value > maxValue) maxValue = value;
            }
            if (maxValue > 0) {
                dailyTotals.push(maxValue);
            }
        });

        if (dailyTotals.length === 0) return 500;

        return dailyTotals.reduce((a, b) => a + b, 0) / dailyTotals.length;
    }

    // 최근 일주일 출고 추이 보정
    getWeeklyTrendAdjustment() {
        if (this.data.length < 7) {
            return 1.0; // 데이터가 부족하면 보정 없음
        }

        // 최근 7일 데이터 가져오기
        const recentWeekData = this.data.slice(-7);
        const dailyTotals = [];

        recentWeekData.forEach(row => {
            // 각 일의 최종 출고량 계산
            let maxValue = 0;
            for (let h = 0; h <= 23; h++) {
                const value = parseInt(row[`hour_${h.toString().padStart(2, '0')}`]) || 0;
                if (value > maxValue) maxValue = value;
            }
            if (maxValue > 0) {
                dailyTotals.push(maxValue);
            }
        });

        if (dailyTotals.length < 3) {
            return 1.0;
        }

        // 최근 3일과 이전 3일 비교
        const recentHalf = dailyTotals.slice(-3); // 최근 3일
        const previousHalf = dailyTotals.slice(-6, -3); // 이전 3일

        if (previousHalf.length < 3) {
            return 1.0;
        }

        const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
        const previousAvg = previousHalf.reduce((a, b) => a + b, 0) / previousHalf.length;

        // 추이 계산
        const trendRatio = recentAvg / previousAvg;

        console.log('일주일 추이 분석:', {
            최근3일평균: Math.round(recentAvg),
            이전3일평균: Math.round(previousAvg),
            추이비율: trendRatio.toFixed(3)
        });

        // 급격한 변화 방지 (0.90 ~ 1.10 범위)
        return Math.max(0.90, Math.min(trendRatio, 1.10));
    }

    // 요일 이름 반환
    getDayName(refDate = new Date()) {
        const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
        return days[refDate.getDay()];
    }

    // 🔍 데이터 분석 및 예측 검증 시스템
    performDataAnalysis() {
        console.log('\n🔍 === 데이터 분석 및 예측 검증 시스템 시작 ===');

        // 1. 전체 데이터 패턴 분석
        this.analyzeOverallDataPatterns();

        // 2. 시간별 증가 패턴 분석
        this.analyzeHourlyGrowthPatterns();

        // 3. 예측 정확도 역산 테스트
        this.validatePredictionAccuracy();

        // 4. 새로운 단순화된 예측 방법 테스트
        this.testSimplifiedPrediction();
    }

    // 전체 데이터 패턴 분석
    analyzeOverallDataPatterns() {
        console.log('\n📊 === 전체 데이터 패턴 분석 ===');

        if (this.data.length < 3) {
            console.log('❌ 분석에 충분한 데이터가 없습니다');
            return;
        }

        // 최근 7일 일별 최종값 분석
        const recentDays = this.data.slice(-7);
        const dailyTotals = [];
        const hourlyAverages = Array(24).fill(0);
        const hourlyGrowthRates = Array(23).fill(0);

        recentDays.forEach(row => {
            let maxValue = 0;
            const dayValues = [];

            for (let h = 0; h <= 23; h++) {
                const value = parseInt(row[`hour_${h.toString().padStart(2, '0')}`]) || 0;
                dayValues.push(value);
                if (value > maxValue) maxValue = value;
            }

            if (maxValue > 0) {
                dailyTotals.push(maxValue);

                // 시간별 평균 계산
                dayValues.forEach((value, hour) => {
                    hourlyAverages[hour] += value;
                });

                // 시간별 증가율 계산
                for (let h = 0; h < 23; h++) {
                    if (dayValues[h] > 0) {
                        const growthRate = (dayValues[h + 1] - dayValues[h]) / dayValues[h];
                        hourlyGrowthRates[h] += growthRate;
                    }
                }
            }
        });

        // 평균 계산
        const avgDaily = dailyTotals.reduce((a, b) => a + b, 0) / dailyTotals.length;
        hourlyAverages.forEach((sum, index) => {
            hourlyAverages[index] = sum / recentDays.length;
        });
        hourlyGrowthRates.forEach((sum, index) => {
            hourlyGrowthRates[index] = sum / recentDays.length;
        });

        console.log(`📈 일별 평균 최종값: ${Math.round(avgDaily)}`);
        console.log(`📊 일별 최종값 범위: ${Math.min(...dailyTotals)} ~ ${Math.max(...dailyTotals)}`);
        console.log(`⭐ 시간별 평균 증가율 (상위 5개):`,
            hourlyGrowthRates
                .map((rate, hour) => ({ hour, rate }))
                .sort((a, b) => b.rate - a.rate)
                .slice(0, 5)
                .map(item => `${item.hour}시→${item.hour + 1}시: +${(item.rate * 100).toFixed(1)}%`)
        );

        // 분석 결과 저장
        this.analysisData = {
            avgDaily,
            dailyTotals,
            hourlyAverages,
            hourlyGrowthRates
        };
    }

    // 시간별 증가 패턴 분석
    analyzeHourlyGrowthPatterns() {
        console.log('\n⏰ === 시간별 증가 패턴 분석 ===');

        if (!this.analysisData) return;

        const currentHour = new Date().getHours();
        const currentData = this.getCurrentDayData();

        if (!currentData) {
            console.log('❌ 오늘 데이터를 찾을 수 없습니다');
            return;
        }

        console.log('📍 현재 상황 분석:');
        for (let h = 0; h <= currentHour && h <= 23; h++) {
            const currentValue = parseInt(currentData[`hour_${h.toString().padStart(2, '0')}`]) || 0;
            const avgValue = this.analysisData.hourlyAverages[h];
            const difference = currentValue - avgValue;
            const diffPercent = avgValue > 0 ? (difference / avgValue * 100) : 0;

            console.log(`${h}시: 현재 ${currentValue}, 평균 ${Math.round(avgValue)}, 차이 ${difference > 0 ? '+' : ''}${Math.round(difference)} (${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(1)}%)`);
        }
    }

    // 예측 정확도 역산 테스트 
    validatePredictionAccuracy() {
        console.log('\n🎯 === 예측 정확도 역산 테스트 ===');

        if (this.data.length < 3) return;

        // 어제 데이터로 예측 정확도 테스트
        const yesterdayData = this.data[this.data.length - 2]; // 어제
        const testHours = [12, 15, 18, 21]; // 테스트할 시간대

        console.log('🔬 어제 데이터로 예측 정확도 테스트:');

        testHours.forEach(hour => {
            if (hour >= 23) return;

            const actualCurrent = parseInt(yesterdayData[`hour_${hour.toString().padStart(2, '0')}`]) || 0;
            const actualNext = parseInt(yesterdayData[`hour_${(hour + 1).toString().padStart(2, '0')}`]) || 0;
            const actualGrowth = actualNext - actualCurrent;

            // 현재 알고리즘으로 예측
            const similarCases = this.findSimilarValueCasesForHour(hour, actualCurrent);
            if (similarCases.length > 0) {
                const nextHourValues = this.extractNextHourValues(similarCases, hour);
                const prediction = this.calculateBasePrediction(nextHourValues);
                const predictedGrowth = prediction - actualCurrent;

                const accuracy = actualNext > 0 ? Math.abs(prediction - actualNext) / actualNext * 100 : 100;

                console.log(`${hour}시→${hour + 1}시: 실제 ${actualCurrent}→${actualNext} (+${actualGrowth}), 예측 ${Math.round(prediction)} (+${Math.round(predictedGrowth)}), 오차 ${accuracy.toFixed(1)}%`);
            }
        });
    }

    // 단순화된 예측 방법 테스트
    testSimplifiedPrediction() {
        console.log('\n🚀 === 단순화된 예측 방법 테스트 ===');

        if (!this.analysisData) return;

        const currentData = this.getCurrentDayData();
        if (!currentData) return;

        const currentHour = new Date().getHours();
        console.log(`\n📍 현재 ${currentHour}시 기준 단순 예측:`);

        // 방법 1: 평균 증가율 적용
        const currentValue = parseInt(currentData[`hour_${currentHour.toString().padStart(2, '0')}`]) || 0;
        if (currentValue > 0 && currentHour < 23) {
            const avgGrowthRate = this.analysisData.hourlyGrowthRates[currentHour];
            const method1Prediction = currentValue * (1 + avgGrowthRate);

            // 방법 2: 평균 증가량 적용
            const avgCurrentValue = this.analysisData.hourlyAverages[currentHour];
            const avgNextValue = this.analysisData.hourlyAverages[currentHour + 1];
            const avgGrowthAmount = avgNextValue - avgCurrentValue;
            const method2Prediction = currentValue + avgGrowthAmount;

            // 방법 3: 현재값 대비 평균값 비율 적용
            const ratio = avgCurrentValue > 0 ? currentValue / avgCurrentValue : 1;
            const method3Prediction = avgNextValue * ratio;

            console.log(`방법1 (증가율): ${currentValue} × (1 + ${(avgGrowthRate * 100).toFixed(1)}%) = ${Math.round(method1Prediction)}`);
            console.log(`방법2 (증가량): ${currentValue} + ${Math.round(avgGrowthAmount)} = ${Math.round(method2Prediction)}`);
            console.log(`방법3 (비율적용): ${Math.round(avgNextValue)} × ${ratio.toFixed(2)} = ${Math.round(method3Prediction)}`);

            // 가장 보수적인 값 선택
            const conservativePrediction = Math.min(method1Prediction, method2Prediction, method3Prediction);
            console.log(`🎯 권장 예측값 (가장 보수적): ${Math.round(conservativePrediction)}`);

            return Math.round(conservativePrediction);
        }

        return null;
    }

    // 📊 하이브리드 예측 시스템 (다중 전략 결합)

    // 🔧 최근 7일 평균 최종값 계산
    calculateRecent7DayAverage() {
        if (!this.data || this.data.length < 2) {
            console.warn('⚠️ 데이터 부족: 기본값 사용');
            return null;
        }

        // 최근 7일 데이터 (오늘 제외)
        const recentDays = this.data.slice(-8, -1); // 마지막 8개 중 첫 7개 (오늘 제외)

        if (recentDays.length === 0) {
            console.warn('⚠️ 최근 데이터 없음');
            return null;
        }

        // 각 날의 최종값(23시) 추출
        const finalValues = [];
        recentDays.forEach(row => {
            const val23 = parseInt(row.hour_23);
            if (val23 && val23 > 0) {
                finalValues.push(val23);
            }
        });

        if (finalValues.length === 0) {
            console.warn('⚠️ 유효한 최종값 없음');
            return null;
        }

        // 평균 계산
        const average = Math.round(
            finalValues.reduce((sum, val) => sum + val, 0) / finalValues.length
        );

        console.log(`📊 최근 ${finalValues.length}일 평균 최종값: ${average}`);
        console.log(`   개별값: [${finalValues.join(', ')}]`);

        return average;
    }

    getLastNonZeroHour(row) {
        if (!row) return -1;
        for (let h = 23; h >= 0; h--) {
            const key = `hour_${String(h).padStart(2, '0')}`;
            const v = parseInt(row[key]) || 0;
            if (v > 0) return h;
        }
        return -1;
    }

    getLastNonZeroValue(row) {
        if (!row) return 0;
        const h = this.getLastNonZeroHour(row);
        if (h >= 0) {
            const key = `hour_${String(h).padStart(2, '0')}`;
            return parseInt(row[key]) || 0;
        }
        return parseInt(row.total) || 0;
    }

    getCumulativeAtHour(row, hour) {
        if (!row) return 0;
        const h0 = Math.max(0, Math.min(23, parseInt(hour) || 0));
        for (let h = h0; h >= 0; h--) {
            const key = `hour_${String(h).padStart(2, '0')}`;
            const v = parseInt(row[key]) || 0;
            if (v > 0) return v;
        }
        return 0;
    }

    getIncrementAtHour(row, hour) {
        const h = Math.max(0, Math.min(23, parseInt(hour) || 0));
        if (h <= 0) return null;
        const cur = this.getCumulativeAtHour(row, h);
        const prev = this.getCumulativeAtHour(row, h - 1);
        if (cur <= 0 || prev < 0) return null;
        if (cur >= prev) return cur - prev;
        return null;
    }

    getMonthPeriodTag(dateObj) {
        if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return 'unknown';
        const day = dateObj.getDate();
        const lastDay = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();
        if (day <= 7) return 'start';
        if (day >= (lastDay - 6)) return 'end';
        return 'mid';
    }

    computeSameWeekdayBaselines(currentData, currentHour) {
        if (!currentData || !currentData.date || !Array.isArray(this.data)) {
            return { sameWeekday8w: null, prevMonthSameWeekday: null };
        }

        const refDate = new Date(currentData.date);
        if (isNaN(refDate.getTime())) {
            return { sameWeekday8w: null, prevMonthSameWeekday: null };
        }

        const refDow = refDate.getDay();
        const refMonth = refDate.getMonth();
        const refYear = refDate.getFullYear();

        const recentStart = new Date(refDate);
        recentStart.setDate(recentStart.getDate() - 56);

        const prevMonthDate = new Date(refYear, refMonth - 1, 1);
        const prevMonth = prevMonthDate.getMonth();
        const prevYear = prevMonthDate.getFullYear();

        const candidates = this.data
            .filter(r => r && r.date && r.date !== currentData.date)
            .map(r => ({ row: r, d: new Date(r.date) }))
            .filter(x => x.d instanceof Date && !isNaN(x.d.getTime()));

        const sameDow = candidates
            .filter(x => x.d.getDay() === refDow && x.d <= refDate)
            .sort((a, b) => a.d - b.d);

        // 최근 8주 내 표본이 있으면 우선 사용, 없으면 동일 요일의 '가장 최근 표본'로 fallback
        const recent8wCandidates = sameDow.filter(x => x.d >= recentStart);
        const recent8wRows = (recent8wCandidates.length > 0 ? recent8wCandidates : sameDow)
            .slice(-8);

        const calendarPrevMonthRows = sameDow
            .filter(x => x.d.getFullYear() === prevYear && x.d.getMonth() === prevMonth);

        // 달력상 이전 월에 데이터가 없으면, 데이터상 존재하는 '직전 월'로 fallback
        let prevMonthRows = calendarPrevMonthRows;
        let prevMonthKey = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
        if (prevMonthRows.length === 0) {
            const cutoff = new Date(refYear, refMonth, 1);
            const monthKeys = new Set();
            for (const x of sameDow) {
                if (x.d < cutoff) {
                    monthKeys.add(`${x.d.getFullYear()}-${String(x.d.getMonth() + 1).padStart(2, '0')}`);
                }
            }
            const sortedKeys = Array.from(monthKeys).sort();
            const fallbackKey = sortedKeys.length ? sortedKeys[sortedKeys.length - 1] : null;
            if (fallbackKey) {
                prevMonthKey = fallbackKey;
                const [y, m] = fallbackKey.split('-');
                const yy = parseInt(y);
                const mm = parseInt(m) - 1;
                prevMonthRows = sameDow.filter(x => x.d.getFullYear() === yy && x.d.getMonth() === mm);
            }
        }

        const buildBaseline = (items, meta) => {
            if (!items || items.length === 0) return null;
            const cumValues = [];
            const finalValues = [];
            const incValues = [];
            const periodBuckets = { start: [], mid: [], end: [] };
            const periodCumBuckets = { start: [], mid: [], end: [] };

            for (const it of items) {
                const cum = this.getCumulativeAtHour(it.row, currentHour);
                const fin = this.getCumulativeAtHour(it.row, 23) || this.getLastNonZeroValue(it.row);
                const inc = this.getIncrementAtHour(it.row, currentHour);
                if (cum > 0) cumValues.push(cum);
                if (fin > 0) finalValues.push(fin);
                if (typeof inc === 'number') incValues.push(inc);

                const tag = this.getMonthPeriodTag(it.d);
                if (tag === 'start' || tag === 'mid' || tag === 'end') {
                    if (fin > 0) periodBuckets[tag].push(fin);
                    if (cum > 0) periodCumBuckets[tag].push(cum);
                }
            }

            const avg = (arr) => {
                if (!arr || arr.length === 0) return null;
                return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
            };

            const avgFinal = avg(finalValues);
            const avgCumAtHour = avg(cumValues);
            const avgIncAtHour = avg(incValues);

            const byPeriodFinal = {
                start: avg(periodBuckets.start),
                mid: avg(periodBuckets.mid),
                end: avg(periodBuckets.end),
            };
            const byPeriodCumAtHour = {
                start: avg(periodCumBuckets.start),
                mid: avg(periodCumBuckets.mid),
                end: avg(periodCumBuckets.end),
            };

            return {
                sampleCount: items.length,
                avgCumAtHour,
                avgIncAtHour,
                avgFinal,
                byPeriodFinal,
                byPeriodCumAtHour,
                meta: meta || null,
            };
        };

        return {
            sameWeekday8w: buildBaseline(recent8wRows, {
                requestedWeeks: 8,
                usedWindow: (recent8wCandidates.length > 0 ? 'within_8_weeks' : 'fallback_recent_available'),
            }),
            prevMonthSameWeekday: buildBaseline(prevMonthRows, {
                monthKey: prevMonthKey,
                usedWindow: (calendarPrevMonthRows.length > 0 ? 'calendar_previous_month' : 'fallback_previous_available_month'),
            }),
        };
    }

    computeWeekdayProfile(currentData, currentHour) {
        if (!currentData || !currentData.date || !Array.isArray(this.data)) return null;
        const refDate = new Date(currentData.date);
        if (isNaN(refDate.getTime())) return null;

        const recentStart = new Date(refDate);
        recentStart.setDate(recentStart.getDate() - 56);

        const candidates = this.data
            .filter(r => r && r.date)
            .map(r => ({ row: r, d: new Date(r.date) }))
            .filter(x => x.d instanceof Date && !isNaN(x.d.getTime()) && x.d <= refDate && x.row.date !== currentData.date)
            .sort((a, b) => a.d - b.d);

        const recent = candidates.filter(x => x.d >= recentStart);
        const source = (recent.length > 0 ? recent : candidates);

        const buckets = {
            0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
        };

        for (const it of source) {
            const dow = it.d.getDay();
            if (!(dow in buckets)) continue;
            const cum = this.getCumulativeAtHour(it.row, currentHour);
            const fin = this.getCumulativeAtHour(it.row, 23) || this.getLastNonZeroValue(it.row);
            if (cum > 0 || fin > 0) {
                buckets[dow].push({ cum, fin });
            }
        }

        const avg = (arr) => {
            if (!arr || arr.length === 0) return null;
            const sum = arr.reduce((a, b) => a + b, 0);
            return Math.round(sum / arr.length);
        };

        const profile = {};
        for (let dow = 0; dow <= 6; dow++) {
            const items = buckets[dow] || [];
            const cumValues = items.map(x => x.cum).filter(v => typeof v === 'number' && v > 0);
            const finValues = items.map(x => x.fin).filter(v => typeof v === 'number' && v > 0);
            profile[dow] = {
                sampleCount: items.length,
                avgCumAtHour: avg(cumValues),
                avgFinal: avg(finValues),
                usedWindow: (recent.length > 0 ? 'within_8_weeks' : 'fallback_all_available'),
            };
        }

        return profile;
    }

    computeWeekdayHourlyIncProfile(currentData) {
        if (!currentData || !currentData.date || !Array.isArray(this.data)) return null;
        const refDate = new Date(currentData.date);
        if (isNaN(refDate.getTime())) return null;

        const recentStart = new Date(refDate);
        recentStart.setDate(recentStart.getDate() - 56);

        const candidates = this.data
            .filter(r => r && r.date)
            .map(r => ({ row: r, d: new Date(r.date) }))
            .filter(x => x.d instanceof Date && !isNaN(x.d.getTime()) && x.d <= refDate && x.row.date !== currentData.date)
            .sort((a, b) => a.d - b.d);

        const recent = candidates.filter(x => x.d >= recentStart);
        const source = (recent.length > 0 ? recent : candidates);

        const profile = {
            usedWindow: (recent.length > 0 ? 'within_8_weeks' : 'fallback_all_available'),
            byDow: {
                0: {}, 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {},
            }
        };

        const getRawCum = (row, hour) => {
            const h = Math.max(0, Math.min(23, parseInt(hour) || 0));
            const key = `hour_${String(h).padStart(2, '0')}`;
            const v = parseInt(row?.[key]) || 0;
            return v > 0 ? v : null;
        };

        for (const it of source) {
            const dow = it.d.getDay();
            if (!(dow in profile.byDow)) continue;

            for (let h = 1; h <= 23; h++) {
                const cur = getRawCum(it.row, h);
                const prev = getRawCum(it.row, h - 1);
                if (cur === null || prev === null) continue;
                if (cur < prev) continue;

                const inc = cur - prev;
                if (!Number.isFinite(inc) || inc < 0) continue;

                const bucket = profile.byDow[dow];
                const hourKey = String(h);
                if (!bucket[hourKey]) bucket[hourKey] = { sampleCount: 0, avgInc: 0, _sum: 0 };
                bucket[hourKey].sampleCount += 1;
                bucket[hourKey]._sum += inc;
            }
        }

        for (let dow = 0; dow <= 6; dow++) {
            const bucket = profile.byDow[dow];
            for (let h = 1; h <= 23; h++) {
                const hourKey = String(h);
                const item = bucket[hourKey];
                if (!item || !item.sampleCount) continue;
                item.avgInc = Math.round(item._sum / item.sampleCount);
                delete item._sum;
            }
        }

        return profile;
    }

    getEffectiveCurrentHour(row) {
        if (!row || !row.date) return new Date().getHours();
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        if (row.date === todayStr) return now.getHours();
        const last = this.getLastNonZeroHour(row);
        return last >= 0 ? last : now.getHours();
    }

    // 🔧 현재 시간의 정확한 값 가져오기
    getCurrentActualValue() {
        const currentData = this.getCurrentDayData();

        if (!currentData) {
            console.warn('⚠️ 오늘 데이터 없음, 기본값 0 반환');
            return 0;
        }

        const currentHour = this.getEffectiveCurrentHour(currentData);

        // 방법 1: 현재 시간의 hour_XX 값
        const currentHourKey = `hour_${String(currentHour).padStart(2, '0')}`;
        const hourValue = parseInt(currentData[currentHourKey]) || 0;

        const lastActualValue = this.getLastNonZeroValue(currentData);
        const actualValue = hourValue > 0 ? hourValue : lastActualValue;

        console.log(`📍 현재 ${currentHour}시 실제값 확정:`);
        console.log(`   hour_${String(currentHour).padStart(2, '0')}: ${hourValue}`);
        console.log(`   lastActual: ${lastActualValue}`);
        console.log(`   → 사용값: ${actualValue}`);

        return actualValue;
    }

    // 🎯 단순 선형 예측 (현재값 → 최종값)
    calculateSimplePrediction(currentHour, currentValue, finalValue) {
        console.log(`\n📍 === 단순 선형 예측 시작 (${currentHour}시) ===`);
        console.log(`   현재값: ${currentValue}`);
        console.log(`   최종값: ${finalValue}`);

        if (currentHour >= 23) {
            console.log('⏰ 23시 이후, 예측 불필요');
            return {};
        }


        // Step 1: 시간 계산
        // currentHour = 마지막 실제 데이터 시간 (예: 14시)
        // startHour = 다음 시간부터 예측 (예: 15시)
        const startHour = currentHour + 1;
        const endHour = 23;
        const totalHours = endHour - startHour + 1;

        console.log(`   예측 시작: ${startHour}시 (마지막 실제: ${currentHour}시)`);

        // Step 2: 필요한 증가량
        const totalGrowth = finalValue - currentValue;
        const incrementPerHour = totalGrowth / totalHours;

        console.log(`   남은 시간: ${totalHours}시간`);
        console.log(`   필요 증가량: ${totalGrowth}`);
        console.log(`   시간당 증가: ${incrementPerHour.toFixed(1)}`);

        // Step 3: 기울기 제한 (너무 급격한 증가 방지)
        const MAX_INCREMENT = 100;
        let adjustedIncrement = incrementPerHour;

        if (Math.abs(incrementPerHour) > MAX_INCREMENT) {
            console.warn(`⚠️ 기울기 제한 적용: ${incrementPerHour.toFixed(1)} → ${incrementPerHour > 0 ? MAX_INCREMENT : -MAX_INCREMENT}`);
            adjustedIncrement = incrementPerHour > 0 ? MAX_INCREMENT : -MAX_INCREMENT;
        }

        // Step 4: 시간별 예측값 생성
        const predictions = {};
        for (let h = startHour; h <= endHour; h++) {
            const hoursElapsed = h - currentHour;
            const predictedValue = Math.round(currentValue + (adjustedIncrement * hoursElapsed));

            // 음수 방지 & 현재값보다 작지 않게
            const safeValue = Math.max(currentValue, predictedValue, 0);

            predictions[`hour_${String(h).padStart(2, '0')}`] = safeValue;

            // 처음/끝 몇 개만 로그
            if (h <= startHour + 1 || h >= endHour) {
                console.log(`   ${h}시: ${safeValue}`);
            } else if (h === startHour + 2) {
                console.log(`   ...`);
            }
        }

        console.log(`✅ 단순 선형 예측 완료`);

        return predictions;
    }


    // 🔧 평활화 헬퍼 메서드 1: 선형 궤적 계산
    calculateLinearTrajectory(currentValue, finalTarget, startHour, endHour) {
        const totalHours = endHour - startHour;
        const totalGrowth = finalTarget - currentValue;
        const incrementPerHour = totalGrowth / totalHours;

        const trajectory = [];
        for (let i = 1; i <= totalHours; i++) {
            const value = Math.round(currentValue + (incrementPerHour * i));
            trajectory.push(value);
        }

        return trajectory;
    }

    // 🔧 안전한 선형 궤적 계산 (검증 포함)
    calculateSafeLinearTrajectory(currentValue, finalTarget, startHour, endHour) {
        const totalHours = endHour - startHour;

        // 검증 1: 시간 범위
        if (totalHours <= 0) {
            console.error(`❌ 잘못된 시간 범위: ${startHour} → ${endHour}`);
            return [];
        }

        // 검증 2: 값 유효성
        if (currentValue < 0) {
            console.warn(`⚠️ 음수 현재값 감지: ${currentValue}, 0으로 보정`);
            currentValue = 0;
        }

        if (finalTarget < 0) {
            console.warn(`⚠️ 음수 최종값 감지: ${finalTarget}, 현재값으로 보정`);
            finalTarget = currentValue;
        }

        const totalGrowth = finalTarget - currentValue;
        const incrementPerHour = totalGrowth / totalHours;

        // 검증 3: 기울기 제한
        const MAX_INCREMENT = 100;  // 시간당 최대 증가
        const MIN_INCREMENT = -20;  // 시간당 최소 증가 (약간의 감소 허용)

        let adjustedIncrement = incrementPerHour;
        let wasAdjusted = false;

        if (incrementPerHour > MAX_INCREMENT) {
            console.warn(`⚠️ 과도한 증가율 감지:`);
            console.warn(`   현재값: ${currentValue}, 최종값: ${finalTarget}`);
            console.warn(`   원래 기울기: ${incrementPerHour.toFixed(1)}/시간`);
            console.warn(`   제한 적용: ${MAX_INCREMENT}/시간`);
            adjustedIncrement = MAX_INCREMENT;
            wasAdjusted = true;
        } else if (incrementPerHour < MIN_INCREMENT) {
            console.warn(`⚠️ 과도한 감소율 감지:`);
            console.warn(`   현재값: ${currentValue}, 최종값: ${finalTarget}`);
            console.warn(`   원래 기울기: ${incrementPerHour.toFixed(1)}/시간`);
            console.warn(`   현재값 유지로 조정 (증가율: 0)`);
            adjustedIncrement = 0; // 감소하지 않고 유지
            wasAdjusted = true;
        }

        // 궤적 생성
        const trajectory = [];
        for (let i = 1; i <= totalHours; i++) {
            const value = Math.round(currentValue + (adjustedIncrement * i));
            // 음수 방지
            trajectory.push(Math.max(0, value));
        }

        const actualFinal = trajectory[trajectory.length - 1];

        if (wasAdjusted) {
            console.log(`📏 조정된 안전 궤적: ${currentValue} → ${actualFinal} (${adjustedIncrement.toFixed(1)}/시간)`);
        } else {
            console.log(`📏 안전 선형 궤적: ${currentValue} → ${actualFinal} (${adjustedIncrement.toFixed(1)}/시간)`);
        }

        return trajectory;
    }


    // 🔧 평활화 헬퍼 메서드 2: 두 궤적 혼합
    blendTrajectories(historical, linear, weight = null) {
        const historicalWeight = weight || this.SMOOTHING_CONFIG.historicalWeight;
        const linearWeight = 1 - historicalWeight;

        if (historical.length !== linear.length) {
            console.warn('⚠️ 궤적 길이 불일치, 과거 패턴만 사용');
            return historical;
        }

        const blended = [];
        for (let i = 0; i < historical.length; i++) {
            const value = Math.round(
                (historical[i] * historicalWeight) + (linear[i] * linearWeight)
            );
            blended.push(value);
        }

        return blended;
    }

    // 🔧 평활화 헬퍼 메서드 3: 이동평균 적용
    applyMovingAverageSmoothing(values, windowSize = null) {
        const window = windowSize || this.SMOOTHING_CONFIG.movingAverageWindow;

        if (values.length < window) {
            return values; // 데이터가 윈도우보다 작으면 그대로 반환
        }

        const smoothed = [];

        for (let i = 0; i < values.length; i++) {
            if (i === 0) {
                // 첫 번째 값: 2-point average (현재, 다음)
                smoothed.push(Math.round((values[i] + values[i + 1]) / 2));
            } else if (i === values.length - 1) {
                // 마지막 값: 2-point average (이전, 현재)
                smoothed.push(Math.round((values[i - 1] + values[i]) / 2));
            } else {
                // 중간 값: 3-point centered moving average
                smoothed.push(Math.round((values[i - 1] + values[i] + values[i + 1]) / 3));
            }
        }

        return smoothed;
    }

    // 🔧 표준편차 계산 (디버깅용)
    calculateStdDev(values) {
        const increments = [];
        for (let i = 1; i < values.length; i++) {
            increments.push(values[i] - values[i - 1]);
        }

        const mean = increments.reduce((a, b) => a + b, 0) / increments.length;
        const variance = increments.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / increments.length;
        return Math.sqrt(variance);
    }

    // 🎯 궤적 기반 예측 (Trajectory-Based Prediction)
    calculateTrajectoryPrediction({ targetHour, previousValue, finalTarget = null, backtestBias = null }) {
        console.log(`\n🎯 궤적 예측 시작: ${targetHour}시, 현재값: ${previousValue}`);

        const currentDate = new Date();
        const currentDayOfWeek = currentDate.getDay();
        const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

        console.log(`📅 현재 요일: ${dayNames[currentDayOfWeek]}`);

        // 1. 같은 요일의 과거 데이터에서 12시→23시 궤적 패턴 추출
        const sameDayData = this.data.filter(row => {
            const rowDate = new Date(row.date);
            return rowDate.getDay() === currentDayOfWeek &&
                row.hour_12 && row.hour_23 &&
                parseInt(row.hour_12) > 0 &&
                parseInt(row.hour_23) > 0;
        });

        if (sameDayData.length < 3) {
            console.warn('⚠️ 같은 요일 데이터 부족, 전체 데이터 사용');
            // 폴백: 전체 데이터 사용
            return this.calculateSimplifiedPrediction({ targetHour, previousValue });
        }

        console.log(`📊 같은 요일 데이터: ${sameDayData.length}개`);

        // 2. 시간대별 증가 비율 패턴 계산
        const hourlyGrowthRatios = {};
        for (let h = 13; h <= 23; h++) {
            const ratios = [];
            sameDayData.forEach(row => {
                const val12 = parseInt(row.hour_12);
                const val23 = parseInt(row.hour_23);
                const valH = parseInt(row[`hour_${String(h).padStart(2, '0')}`]);

                if (val12 && val23 && valH && val23 > val12) {
                    const totalGrowth = val23 - val12;
                    const growthToH = valH - val12;
                    const ratio = growthToH / totalGrowth; // 0~1 사이 비율
                    if (ratio >= 0 && ratio <= 1) {
                        ratios.push(ratio);
                    }
                }
            });

            if (ratios.length > 0) {
                // 중간값 사용 (이상치 제거)
                ratios.sort((a, b) => a - b);
                const mid = Math.floor(ratios.length / 2);
                hourlyGrowthRatios[h] = ratios[mid];
            }
        }

        console.log('📈 시간대별 증가 비율:', hourlyGrowthRatios);

        // 3. 최종값 예측 (AI 예측값 또는 과거 패턴 기반)
        let predictedFinal;

        if (finalTarget) {
            // AI가 제공한 최종값 사용
            predictedFinal = finalTarget;
            console.log(`🤖 AI 제공 최종값: ${predictedFinal}`);
        } else {
            // 과거 패턴 기반 최종값 추정
            const ratios12to23 = sameDayData.map(row => {
                const val12 = parseInt(row.hour_12);
                const val23 = parseInt(row.hour_23);
                return val23 / val12;
            }).filter(r => r > 0 && r < 10); // 이상치 제거

            ratios12to23.sort((a, b) => a - b);
            const medianRatio = ratios12to23[Math.floor(ratios12to23.length / 2)];

            // 현재 12시 값 추정 (targetHour가 12시 이후라면)
            const estimated12 = previousValue; // 간단히 현재값을 12시 기준으로 사용
            predictedFinal = Math.round(estimated12 * medianRatio);

            console.log(`📊 패턴 기반 최종값: ${predictedFinal} (비율: ${medianRatio.toFixed(2)})`);
        }

        // 4. 백테스트 bias 반영
        if (backtestBias === 'overestimation') {
            predictedFinal = Math.round(predictedFinal * 0.95);
            console.log(`🔽 과대평가 보정: -5% → ${predictedFinal}`);
        } else if (backtestBias === 'underestimation') {
            predictedFinal = Math.round(predictedFinal * 1.05);
            console.log(`🔼 과소평가 보정: +5% → ${predictedFinal}`);
        }

        // 5. 현재 시간의 값 계산 (궤적 따라가기)
        const totalGrowth = predictedFinal - previousValue;
        const ratio = hourlyGrowthRatios[targetHour] || 0.5; // 기본값 0.5

        // 🔥 최소 증가량 보장 (plateau 방지)
        // totalGrowth가 너무 작으면 최소 증가량 적용
        const remainingHours = 23 - targetHour + 1;
        const minTotalGrowth = remainingHours * 10; // 시간당 최소 10건
        const guaranteedTotalGrowth = Math.max(totalGrowth, minTotalGrowth);

        const predictedValue = Math.round(previousValue + (guaranteedTotalGrowth * ratio));

        if (totalGrowth < minTotalGrowth) {
            console.log(`✅ ${targetHour}시 예측: ${predictedValue} (증가: ${predictedValue - previousValue}, 비율: ${(ratio * 100).toFixed(1)}%) [보정: ${totalGrowth} → ${guaranteedTotalGrowth}]`);
        } else {
            console.log(`✅ ${targetHour}시 예측: ${predictedValue} (증가: ${predictedValue - previousValue}, 비율: ${(ratio * 100).toFixed(1)}%)`);
        }

        return Math.max(previousValue, predictedValue); // 역행 방지
    }

    // 기존 메서드 유지 (폴백용)
    calculateSimplifiedPrediction({ targetHour, previousValue }) {
        console.log(`\n🎯 하이브리드 예측 시스템 시작: ${targetHour}시, 이전값: ${previousValue}`);

        if (!this.data || this.data.length === 0) {
            console.warn('⚠️ 과거 데이터 없음, 최소 증가만 적용');
            return previousValue + 10;
        }

        // 현재 요일 확인
        const currentDate = this.getCurrentDayData();
        const dayOfWeek = currentDate ? new Date(currentDate.date).getDay() : new Date().getDay();
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const currentDayName = dayNames[dayOfWeek];

        console.log(`📅 현재 요일: ${currentDayName}요일`);

        // 요일별 보정 계수 (현실적인 수준으로 하향 조정)
        const dayAdjustments = {
            0: 1.05,  // 일요일: +5%
            1: 1.08,  // 월요일: +8%
            2: 1.02,  // 화요일: +2%
            3: 1.04,  // 수요일: +4%
            4: 1.05,  // 목요일: +5%
            5: 1.03,  // 금요일: +3%
            6: 1.10   // 토요일: +10%
        };

        // 최소 예측값 보장 (50개 이상)
        const minPrediction = 50;

        // 하이브리드 예측: 가중 평균 적용
        // 4. 가중 평균 계산 (더 높은 값에 가중치 부여)
        let finalPrediction = this.calculateHybridWeightedAverage({
            targetHour,
            previousValue,
            dayAdjustments: dayAdjustments[dayOfWeek]
        });

        // 최소 예측값 적용
        finalPrediction = Math.max(minPrediction, finalPrediction);

        console.log(`🎯 최종 예측값: ${Math.round(finalPrediction)}`);
        return Math.round(finalPrediction);
    }

    getCurrentDayData() {
        if (!this.data || this.data.length === 0) return null;

        // 오늘 날짜 (로컬 시간 기준)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        // 데이터에서 오늘 날짜 찾기
        const exact = this.data.find(item => item && item.date === todayStr) || null;
        if (exact) {
            this.currentData = exact;
            return exact;
        }

        const candidates = (this.data || [])
            .filter(item => item && item.date)
            .slice()
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));

        const latest = candidates.length ? candidates[candidates.length - 1] : null;
        this.currentData = latest;
        return latest;
    }

    detectSpecialDay(currentDate) {
        if (!currentDate || !currentDate.date) return { detected: false, reason: '' };

        // 간단한 휴일 체크 (예시)
        // 실제로는 공휴일 목록을 관리하거나 API를 호출해야 함
        // 여기서는 주말만 체크하거나, 특정 날짜를 하드코딩할 수 있음

        // const date = new Date(currentDate.date);
        // const day = date.getDay();

        // 일요일(0)은 이미 dayAdjustments에서 처리되므로 여기서는 'special'로 취급하지 않음

        return { detected: false, reason: '' };
    }

    calculateHourlyIncrements(values, isPredicted) {
        if (!values || values.length === 0) return [];

        const increments = [];
        for (let i = 0; i < values.length; i++) {
            if (i === 0) {
                increments.push(null); // 0시는 증감 계산 불가
                continue;
            }

            const current = values[i];
            const prev = values[i - 1];

            // 값이 있고, 이전 값보다 크거나 같을 때만 증감 계산
            if (current !== null && prev !== null && !isNaN(current) && !isNaN(prev)) {
                // 0에서 0으로 가는건 0 증가
                if (current === 0 && prev === 0) {
                    increments.push(0);
                }
                // 유효한 증가
                else if (current >= prev) {
                    increments.push(current - prev);
                }
                else {
                    increments.push(null);
                }
            } else {
                increments.push(null);
            }
        }
        return increments;
    }

    // 🆕 주간 평균 증감량 계산 (시간별 - 막대 그래프 위에 선으로 표시)
    calculateWeeklyAvgIncrements(currentHour) {
        if (!this.data || this.data.length < 2) {
            return new Array(24).fill(null);
        }

        // 오늘 제외 최근 7일 데이터에서 평균 증감량 계산
        const sortedData = [...this.data].sort((a, b) => new Date(b.date) - new Date(a.date));
        const past7Days = sortedData.slice(1, 8);

        if (past7Days.length === 0) {
            return new Array(24).fill(null);
        }

        // 각 시간대별 증감량 수집
        const hourlyIncrements = {};
        for (let h = 1; h <= 23; h++) {
            hourlyIncrements[h] = [];
        }

        for (const dayData of past7Days) {
            const dayIncrements = this.calculateHourlyIncrements(
                Array.from({ length: 24 }, (_, i) => parseInt(dayData[`hour_${String(i).padStart(2, '0')}`]) || 0),
                new Array(24).fill(false)
            );
            for (let h = 1; h <= 23; h++) {
                if (dayIncrements[h] !== null && dayIncrements[h] > 0) {
                    hourlyIncrements[h].push(dayIncrements[h]);
                }
            }
        }

        // 시간대별 평균 증감량 (중간값)
        const result = new Array(24).fill(null);
        result[0] = null; // 0시는 증감 없음

        for (let h = 1; h <= 23; h++) {
            const increments = hourlyIncrements[h];
            if (increments && increments.length > 0) {
                const sorted = [...increments].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                result[h] = sorted.length % 2 === 0
                    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
                    : sorted[mid];
            }
        }

        console.log('📊 주간 평균 증감량 (시간별):', result);
        return result;
    }

    // 🆕 주간 평균 누적 계산 (datasets[5]용 - 현재시간까지 실제값, 이후 평균증감누적)
    calculateWeeklyAvgCumulative(todayData, currentHour) {
        if (!this.data || this.data.length < 2) {
            return new Array(24).fill(null);
        }

        // 현재시간 이전 실제값 추출
        const actualValues = [];
        for (let h = 0; h <= currentHour; h++) {
            const key = `hour_${String(h).padStart(2, '0')}`;
            actualValues[h] = parseInt(todayData[key]) || 0;
        }

        // 오늘 제외 최근 7일 데이터에서 평균 증감량 계산
        const sortedData = [...this.data].sort((a, b) => new Date(b.date) - new Date(a.date));
        const past7Days = sortedData.slice(1, 8);

        if (past7Days.length === 0) {
            return new Array(24).fill(null);
        }

        // 각 시간대별 증감량 수집
        const hourlyIncrements = {};
        for (let h = 1; h <= 23; h++) {
            hourlyIncrements[h] = [];
        }

        for (const dayData of past7Days) {
            const dayIncrements = this.calculateHourlyIncrements(
                Array.from({ length: 24 }, (_, i) => parseInt(dayData[`hour_${String(i).padStart(2, '0')}`]) || 0),
                new Array(24).fill(false)
            );
            for (let h = 1; h <= 23; h++) {
                if (dayIncrements[h] !== null && dayIncrements[h] > 0) {
                    hourlyIncrements[h].push(dayIncrements[h]);
                }
            }
        }

        // 시간대별 평균 증감량 (중간값)
        const avgIncrements = new Array(24).fill(null);
        for (let h = 1; h <= 23; h++) {
            const increments = hourlyIncrements[h];
            if (increments && increments.length > 0) {
                const sorted = [...increments].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                avgIncrements[h] = sorted.length % 2 === 0
                    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
                    : sorted[mid];
            }
        }

        // 현재시간의 실제값부터 평균증감누적 계산
        const result = new Array(24).fill(null);
        const lastActualValue = actualValues[currentHour] || 0;

        // 0시~현재시간: 실제값
        for (let h = 0; h <= currentHour; h++) {
            result[h] = actualValues[h];
        }

        // 현재시간 이후: 평균증감누적
        let accumulated = lastActualValue;
        for (let h = currentHour + 1; h < 24; h++) {
            const avgInc = avgIncrements[h];
            if (avgInc !== null) {
                accumulated += avgInc;
                result[h] = accumulated;
            }
        }

        console.log('📊 주간 평균 누적 (datasets[5]):', result);
        return result;
    }

    // 하이브리드 가중 평균 계산
    calculateHybridWeightedAverage({ targetHour, previousValue, dayAdjustments }) {
        // 1. 현재 날짜가 특수한 날인지 감지
        const currentDate = this.getCurrentDayData();
        const isSpecialDay = this.detectSpecialDay(currentDate);

        if (isSpecialDay.detected) {
            console.warn(`⚠️ 특수한 날 감지: ${isSpecialDay.reason}`);
            // 특수한 날은 보수적 예측
            return previousValue + Math.min(10, previousValue * 0.02);
        }

        // 최신 데이터 가중치 부여: 최근 3일에 2배 가중치 적용
        const pastGrowthRates = [];
        const pastIncreases = [];
        const today = new Date();

        // 같은 요일 데이터만 필터링 (데이터가 5개 미만이면 전체 데이터 사용)
        const currentDayOfWeek = new Date(this.getCurrentDayData()?.date || new Date()).getDay();
        const sameDayRows = this.data.filter(row => {
            if (!row.date) return false;
            return new Date(row.date).getDay() === currentDayOfWeek;
        });

        const targetRows = sameDayRows.length > 0 ? sameDayRows : this.data;
        console.log(`🎯 예측 데이터 소스: ${sameDayRows.length > 0 ? `같은 요일 데이터만 사용 (${sameDayRows.length}개)` : '전체 데이터 사용 (데이터 부족)'}`);

        for (const row of targetRows) {
            if (!row.date) continue

            const prevHourKey = `hour_${String(targetHour - 1).padStart(2, '0')}`;
            const currHourKey = `hour_${String(targetHour).padStart(2, '0')}`;

            const prevValue = parseInt(row[prevHourKey]) || 0;
            const currValue = parseInt(row[currHourKey]) || 0;

            if (prevValue > 0 && currValue > prevValue) {
                const increase = currValue - prevValue;
                const rate = increase / prevValue;

                // 이상치 제거: 증가량이 300개를 넘거나 증가율이 300%를 넘으면 제외
                if (targetRows.length > 10 && (increase > 300 || rate > 3.0)) {
                    continue;
                }

                // [일요일 15시 특수 보정] 일요일 15시에 50개 이상 증가는 이상치로 간주 (평일 데이터 혼입 방지)
                if (currentDayOfWeek === 0 && targetHour === 15 && increase > 60) {
                    console.warn(`⚠️ 일요일 15시 과도한 증가(${increase}) 제외`);
                    continue;
                }

                // 최근 3일 데이터 가중치 계산 (같은 요일 기준 최근)
                const daysDiff = Math.floor((today - new Date(row.date)) / (1000 * 60 * 60 * 24));
                // 같은 요일이면 3주 이내, 전체 데이터면 3일 이내를 '최근'으로 간주
                const isRecent = sameDayRows.length > 0 ? daysDiff <= 21 : daysDiff <= 3;

                if (isRecent) {
                    // 최근 데이터는 1.5배 가중치 (2배는 너무 과함)
                    pastIncreases.push(increase);
                    if (Math.random() > 0.5) pastIncreases.push(increase); // 1.5배 효과
                    pastGrowthRates.push(rate);
                } else {
                    pastIncreases.push(increase);
                    pastGrowthRates.push(rate);
                }
            }
        }

        console.log(`${targetHour}시 과거 ${pastIncreases.length}개 데이터 발견`);

        if (pastIncreases.length === 0) {
            // 데이터가 없으면 요일별 기본 증가량 적용
            const dayBaseIncreases = {
                0: 10,  // 일요일
                1: 15,  // 월요일
                2: 5,   // 화요일 (매우 낮음)
                3: 15,  // 수요일
                4: 15,  // 목요일
                5: 12,  // 금요일
                6: 20   // 토요일
            };

            const baseIncrease = dayBaseIncreases[dayOfWeek] || 10;
            const adjustedIncrease = Math.round(baseIncrease * dayAdjustments);

            console.log(`데이터 없음, 요일별 기본값 적용: +${adjustedIncrease}`);
            return previousValue + adjustedIncrease;
        }

        // 통계 계산
        pastIncreases.sort((a, b) => a - b);
        const medianIncrease = pastIncreases[Math.floor(pastIncreases.length / 2)];
        const avgIncrease = pastIncreases.reduce((a, b) => a + b, 0) / pastIncreases.length;
        const thirdQuartile = pastIncreases[Math.floor(pastIncreases.length * 0.75)] || pastIncreases[pastIncreases.length - 1];
        const maxIncrease = pastIncreases[pastIncreases.length - 1];

        // 하이브리드 예측: 가중치 재조정 (보수적 접근)
        // 1. 중간값 (40% 가중) - 가장 안정적
        const method1 = medianIncrease * 0.40;

        // 2. 평균값 (30% 가중) - 전체 경향
        const method2 = avgIncrease * 0.30;

        // 3. 상위 75% 값 (20% 가중) - 상승 추세 반영
        const method3 = thirdQuartile * 0.20;

        // 4. 최대값 (10% 가중) - 이상치 영향 최소화
        const method4 = maxIncrease * 0.10;

        // 가중 평균
        let predictedIncrease = method1 + method2 + method3 + method4;

        // 요일별 보정 적용
        predictedIncrease = predictedIncrease * dayAdjustments;

        console.log(`하이브리드 예측 - 중간: ${Math.round(medianIncrease)}, 평균: ${Math.round(avgIncrease)}, Q3: ${Math.round(thirdQuartile)}, 최대: ${Math.round(maxIncrease)}`);
        console.log(`가중 평균 증가량: ${Math.round(predictedIncrease)}`);
        console.log(`요일 보정 계수: ${dayAdjustments}`);

        // 최종 예측값
        let finalPrediction = previousValue + Math.round(predictedIncrease);
        if (this.analysisData && Array.isArray(this.analysisData.hourlyAverages)) {
            const hourlyAvg = this.analysisData.hourlyAverages[targetHour] || 0;
            const hourlyFloor = Math.round(hourlyAvg * 1.1); // 90% → 110%로 상향
            finalPrediction = Math.max(finalPrediction, hourlyFloor, previousValue + 10); // 최소 증가량도 5→10으로 상향
        }

        console.log(`최종 예측: ${previousValue} + ${Math.round(predictedIncrease)} = ${finalPrediction}`);
        return finalPrediction;
    }

    // 🤖 AI 분석 요청
    async fetchAIAnalysis() {
        console.log('🤖 fetchAIAnalysis called');
        const container = document.getElementById('ai-insight-container');
        const content = document.getElementById('ai-insight-content');

        console.log('🤖 Container found:', !!container);
        console.log('🤖 Content found:', !!content);

        if (!container || !content) {
            console.warn('🤖 AI container elements not found in DOM');
            return;
        }

        // 🎯 AI 분석 결과 캐시 확인 (새로고침 시 캐시된 분석 결과 사용)
        // 단, 캐시의 시간과 현재 데이터 시간이 다르면 다시 분석
        if (this.aiInsightCache) {
            const cachedDate = this.lastAIAnalysisDate;
            const cachedHour = this.lastAIAnalysisHour;

            // 현재 데이터의 마지막 시간과 다르면 다시 분석
            if (cachedDate === todayStr && cachedHour === lastNonZeroHour) {
                console.log('🤖 AI 분석 캐시 사용 (동일 시간):', cachedDate, cachedHour, '시');
                content.innerHTML = this.aiInsightCache;
                return;
            } else {
                console.log('🤖 캐시 시간과 다름, 새 분석 진행:', cachedHour, '→', lastNonZeroHour);
                // 캐시 삭제
                this.aiInsightCache = null;
                localStorage.removeItem('ai_insight_cache');
            }
        }

        // 🎯 AI 분석 최적화: 새로운 시간대의 데이터가 있을 때만 분석 실행
        const currentData = this.getCurrentDayData();
        if (!currentData) {
            console.warn('🤖 No current data found for AI analysis');
            return;
        }

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const lastNonZeroHour = this.getLastNonZeroHour(currentData);
        const currentHourKey = `hour_${String(lastNonZeroHour).padStart(2, '0')}`;
        const lastNonZeroValue = parseInt(currentData[currentHourKey]) || 0;

        // 오늘 데이터가 아니면 스킵
        if (currentData.date !== todayStr) {
            console.log('🤖 AI 분석 스킵: 오늘 데이터 아님');
            return;
        }

        // 마지막으로 입력된 시간대와 값이 같으면 스킵 (새로운 데이터 입력 없음)
        if (this.lastAIAnalysisDate === todayStr &&
            this.lastAIAnalysisHour === lastNonZeroHour &&
            this.lastAIAnalysisValue === lastNonZeroValue) {
            console.log('🤖 AI 분석 스킵: 같은 시간대, 같은 값, 새로운 데이터 없음');
            return;
        }

        // 분석 실행 후 시간와 값 기록
        this.lastAIAnalysisDate = todayStr;
        this.lastAIAnalysisHour = lastNonZeroHour;
        this.lastAIAnalysisValue = lastNonZeroValue;

        console.log('🤖 Current data:', currentData);

        const currentActual = this.getLastNonZeroValue(currentData);
        const nowHour = this.getEffectiveCurrentHour(currentData);

        // 🎯 dataCutoffHour는 실제 마지막 데이터 시간 사용 (과거 데이터 기준)
        // 사용자가 17시까지 입력했으면 15시 기준 분석 (滞后 2시간)
        let dataCutoffHour = lastNonZeroHour >= 0 ? lastNonZeroHour : nowHour;

        const currentCumAtHour = this.getCumulativeAtHour(currentData, dataCutoffHour);
        const currentIncAtHour = this.getIncrementAtHour(currentData, dataCutoffHour);
        const recentIncTrend = [];
        for (let h = Math.max(1, dataCutoffHour - 2); h <= dataCutoffHour; h++) {
            const inc = this.getIncrementAtHour(currentData, h);
            if (typeof inc === 'number') {
                recentIncTrend.push({ hour: h, inc });
            }
        }

        // UI 표시 (로딩 중)
        container.classList.remove('hidden');
        content.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI가 현재 데이터를 분석하고 있습니다...';

        try {
            // 같은 요일 평균 계산
            const currentDayOfWeek = new Date(currentData.date).getDay();
            const sameDayData = this.data.filter(row => {
                const rowDate = new Date(row.date);
                return rowDate.getDay() === currentDayOfWeek && row.date !== currentData.date;
            });

            const sameDayTotals = sameDayData
                .map(d => this.getLastNonZeroValue(d))
                .filter(v => v > 0);
            const averageTotal = sameDayTotals.length > 0
                ? Math.round(sameDayTotals.reduce((sum, v) => sum + v, 0) / sameDayTotals.length)
                : 0;

            const baselines = this.computeSameWeekdayBaselines(currentData, dataCutoffHour);
            const weekdayProfile = this.computeWeekdayProfile(currentData, dataCutoffHour);
            const weekdayHourlyIncProfile = this.computeWeekdayHourlyIncProfile(currentData);

            const lagHours = (currentData.date === todayStr && typeof nowHour === 'number' && typeof dataCutoffHour === 'number')
                ? Math.max(0, nowHour - dataCutoffHour)
                : 0;

            let specialNotes = null;
            try {
                specialNotes = await this.fetchSpecialNotes(currentData.date);
            } catch {
                specialNotes = null;
            }

            // 분석에 필요한 컨텍스트 구성
            const context = {
                date: currentData.date,
                dayOfWeek: currentData.dayOfWeek,
                currentHour: nowHour,
                dataCutoffHour,
                dataLagHours: lagHours,
                total: currentActual,
                averageTotal: averageTotal,
                currentCumAtHour,
                currentIncAtHour,
                recentIncTrend,
                comparison: baselines,
                weekdayProfile,
                weekdayHourlyIncProfile,
                aiPredictions: this.aiPredictions || null,  // AI 예측값 포함
                specialNotes: specialNotes || null,
            };

            const response = await fetch(`${this.apiBase}/api/ai/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: context })
            });

            console.log('🤖 Response status:', response.status);
            const json = await response.json();
            console.log('🤖 Response JSON:', json);

            if (json.success && json.insight) {
                console.log('🤖 AI Insight received:', json.insight.substring(0, 100) + '...');
                // 마크다운을 HTML로 변환 (간단한 처리)
                const htmlInsight = json.insight
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/^## (.*$)/gim, '<h4 class="font-bold mt-2 mb-1 text-indigo-900">$1</h4>')
                    .replace(/- /g, '• ')
                    .replace(/\n/g, '<br>');

                content.innerHTML = htmlInsight;

                // 🎯 AI 분석 결과 캐시 저장
                this.aiInsightCache = htmlInsight;
                this.saveAIInsightToStorage(htmlInsight);
            } else {
                console.warn('🤖 AI response invalid:', json);
                content.innerHTML = `
                    <div class="text-gray-500 italic">
                        <i class="fas fa-exclamation-triangle text-yellow-500 mr-1"></i>
                        AI 분석을 가져올 수 없습니다. (통계 기반 예측은 그래프를 참고하세요)
                    </div>
                `;
                this.showNotification('AI 분석 생성에 실패했습니다.', 'warning');
            }
        } catch (error) {
            console.error('🤖 AI Analysis Error:', error);
            content.innerHTML = `
                <div class="text-gray-500 italic">
                    <i class="fas fa-wifi text-red-400 mr-1"></i>
                    AI 서버 연결 실패
                </div>
            `;
            this.showNotification('AI 서버에 연결할 수 없습니다.', 'error');
        }
    }

    // 알림 표시 메서드
    showNotification(message, type = 'info') {
        const container = document.getElementById('ai-insight-container');
        if (!container) return;

        const existing = container.querySelector('.ai-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `ai-notification p-2 mb-2 text-sm rounded ${type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
            type === 'warning' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                'bg-blue-50 text-blue-700 border border-blue-200'
            }`;
        notification.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'} mr-2"></i>${message}`;

        const content = document.getElementById('ai-insight-content');
        if (content) {
            container.insertBefore(notification, content);
        } else {
            container.appendChild(notification);
        }

        setTimeout(() => {
            if (notification.parentNode) notification.remove();
        }, 5000);
    }

    // 🎯 AI를 위한 가중 평활화(Weighted Smoothing) 기반 예측 생성
    calculateBasePredictionsForAI(currentHour, currentData) {
        const currentValue = this.getLastNonZeroValue(currentData);
        console.log(`\n🎯 AI 기준값 계산 (가중 평활화): 현재 ${currentHour}시, 값: ${currentValue}`);

        const predictions = {};

        // 1. 같은 요일 데이터 필터링
        const currentDayOfWeek = currentData?.date ? new Date(currentData.date).getDay() : new Date().getDay();
        const sameDayData = this.data.filter(row => {
            const rowDate = new Date(row.date);
            return rowDate.getDay() === currentDayOfWeek;
        });

        console.log(`📊 같은 요일(${currentDayOfWeek}) 데이터: ${sameDayData.length}개`);

        if (sameDayData.length < 3) {
            console.warn('⚠️ 데이터 부족, 선형 증가 사용');
            let accumulated = currentValue;
            for (let h = currentHour + 1; h <= 23; h++) {
                accumulated += 20;
                predictions[`hour_${String(h).padStart(2, '0')}`] = accumulated;
            }
            return predictions;
        }

        // 2. 과거 패턴 학습 (Raw Increments)
        const rawIncrements = this.learnHistoricalIncrements(currentHour, sameDayData);

        // 3. 선형 기준 증가량 계산
        const linearIncrement = this.calculateLinearIncrement(currentHour, currentValue, sameDayData);

        // 4. 가중 평균 (과거 70% + 선형 30%)
        const weightedIncrements = this.applyWeightedAverage(rawIncrements, linearIncrement, currentHour);

        // 5. 이동평균 평활화 (3시간 윈도우)
        const smoothedIncrements = this.applyMovingAverage(weightedIncrements, currentHour);

        // 6. 추세 배수 적용
        const trendMultiplier = this.calculateTrendMultiplier(currentHour, currentValue, sameDayData);

        console.log(`📈 추세 배수: ${trendMultiplier.toFixed(2)}배`);

        // 7. 최종 예측값 계산 (누적)
        let accumulated = currentValue;

        for (let h = currentHour + 1; h <= 23; h++) {
            const smoothed = smoothedIncrements[h] || 20;
            const adjusted = Math.round(smoothed * trendMultiplier);

            // 최소 증가량 보장
            const finalIncrement = Math.max(adjusted, 10);

            accumulated += finalIncrement;
            predictions[`hour_${String(h).padStart(2, '0')}`] = accumulated;

            console.log(`  ${h}시: +${finalIncrement} → ${accumulated} (원본: ${rawIncrements[h]?.toFixed(0) || 'N/A'}, 평활: ${smoothed.toFixed(0)})`);
        }

        console.log('✅ AI 기준값 계산 완료 (가중 평활화)');
        return predictions;
    }

    // 📚 헬퍼: 과거 패턴 학습
    learnHistoricalIncrements(currentHour, sameDayData) {
        const hourlyIncrements = {};

        for (let h = currentHour + 1; h <= 23; h++) {
            hourlyIncrements[h] = [];

            sameDayData.forEach(row => {
                const prevHourKey = `hour_${String(h - 1).padStart(2, '0')}`;
                const currHourKey = `hour_${String(h).padStart(2, '0')}`;

                const prevVal = parseInt(row[prevHourKey]) || 0;
                const currVal = parseInt(row[currHourKey]) || 0;

                if (prevVal > 0 && currVal > prevVal) {
                    const increment = currVal - prevVal;
                    if (increment < 100) {
                        hourlyIncrements[h].push(increment);
                    }
                }
            });
        }

        // Median 계산
        const medianIncrements = {};
        for (let h = currentHour + 1; h <= 23; h++) {
            const increments = hourlyIncrements[h];
            if (increments && increments.length > 0) {
                increments.sort((a, b) => a - b);
                medianIncrements[h] = increments[Math.floor(increments.length / 2)];
            } else {
                medianIncrements[h] = 20; // 기본값
            }
        }

        return medianIncrements;
    }

    // 📚 헬퍼: 선형 기준 증가량 계산
    calculateLinearIncrement(currentHour, currentValue, sameDayData) {
        // 최종값 예측 (과거 패턴 비율)
        const ratios = [];

        sameDayData.forEach(row => {
            const baseVal = parseInt(row[`hour_${String(currentHour).padStart(2, '0')}`]) || 0;
            const finalVal = parseInt(row.hour_23) || 0;

            if (baseVal > 0 && finalVal > baseVal) {
                ratios.push(finalVal / baseVal);
            }
        });

        if (ratios.length === 0) return 40; // 기본값

        ratios.sort((a, b) => a - b);
        let medianRatio = ratios[Math.floor(ratios.length / 2)];
        medianRatio = Math.min(medianRatio, 2.5); // 과대 예측 방지 상한

        const estimatedFinal = currentValue * medianRatio;
        const totalGrowth = estimatedFinal - currentValue;
        const remainingHours = 23 - currentHour;

        return totalGrowth / remainingHours;
    }

    // 📚 헬퍼: 가중 평균 적용
    applyWeightedAverage(rawIncrements, linearIncrement, currentHour) {
        const weighted = {};
        const rawWeight = 0.7;  // 과거 패턴 70%
        const linearWeight = 0.3;  // 선형 30%

        for (let h = currentHour + 1; h <= 23; h++) {
            const raw = rawIncrements[h] || linearIncrement;
            weighted[h] = raw * rawWeight + linearIncrement * linearWeight;
        }

        return weighted;
    }

    // 📚 헬퍼: 이동평균 평활화
    applyMovingAverage(increments, currentHour, window = 3) {
        const smoothed = {};
        const hours = [];

        for (let h = currentHour + 1; h <= 23; h++) {
            hours.push(h);
        }

        for (let i = 0; i < hours.length; i++) {
            const h = hours[i];
            const start = Math.max(0, i - Math.floor(window / 2));
            const end = Math.min(hours.length, i + Math.ceil(window / 2));

            const slice = hours.slice(start, end);
            const avg = slice.reduce((sum, hour) => sum + increments[hour], 0) / slice.length;

            smoothed[h] = avg;
        }

        return smoothed;
    }

    // 📚 헬퍼: 추세 배수 계산
    calculateTrendMultiplier(currentHour, currentValue, sameDayData) {
        const currentHourValues = sameDayData
            .map(row => parseInt(row[`hour_${String(currentHour).padStart(2, '0')}`]) || 0)
            .filter(v => v > 0);

        const avgCurrentHour = currentHourValues.length > 0
            ? currentHourValues.reduce((sum, val) => sum + val, 0) / currentHourValues.length
            : 0;

        const trendMultiplier = avgCurrentHour > 0 ? currentValue / avgCurrentHour : 1.0;

        // 극단적 값 방지 (0.5 ~ 1.3 범위)
        return Math.max(0.5, Math.min(trendMultiplier, 1.3));
    }




    // 🔮 AI 예측 요청
    async fetchAIPredictions() {
        console.log('🔮 fetchAIPredictions called');

        // AI 예측 재요청 시작: 카드 값은 차트 최종 확정까지 숫자로 쓰지 않음
        this.aiPredictionsLoaded = false;

        const currentData = this.getCurrentDayData();
        if (!currentData) {
            console.warn('🔮 No current data for prediction');
            return null;
        }

        const currentHour = this.getEffectiveCurrentHour(currentData);

        // 🔮 백엔드의 개선된 예측 로직을 사용하기 위해 basePredictions를 비활성화
        const basePredictions = null;

        // 🧪 AI 자가 보정을 위한 백테스트 실행 (최근 90일)
        console.log('🧪 [DEBUG] 백테스트 시작 전 - this.data 크기:', this.data?.length);
        console.log('🧪 AI 보정을 위한 백테스트 실행 중...');
        let backtestSummary = null;
        try {
            const backtestResult = await this.runBacktest(90);
            console.log('🧪 [DEBUG] 백테스트 완료 - 결과:', backtestResult);

            // 서버에서 장기 통계 조회
            const todayDate = new Date();
            const isMonthStart = todayDate.getDate() <= 5;
            const isMonthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate() - todayDate.getDate() <= 5;
            const dayOfWeek = todayDate.getDay();

            console.log('🧪 [DEBUG] 서버 통계 조회 요청 - 요일:', dayOfWeek, '월초:', isMonthStart, '월말:', isMonthEnd);
            const statsResponse = await fetch(`${this.apiBase}/api/ai/accuracy-stats?dayOfWeek=${dayOfWeek}&isMonthStart=${isMonthStart}&isMonthEnd=${isMonthEnd}`);
            const statsData = await statsResponse.json();
            console.log('🧪 [DEBUG] 서버 통계 응답:', statsData);

            // 안전장치: stats가 없으면 기본값 사용
            const longTermStats = statsData?.stats || { total: null, day: null, period: null };

            backtestSummary = {
                avgError: backtestResult.summary,
                details: backtestResult.details.slice(0, 5).map(d => `${d.date}(${d.day}): 실제 ${d.actual} vs 예측 ${d.predicted} (오차 ${d.errorRate})`).join('\n'), // 최근 5개만 상세 표시
                bias: backtestResult.details.filter(d => d.predicted > d.actual).length > backtestResult.details.length / 2 ? 'overestimation' : 'underestimation',
                longTermStats: {
                    totalAvgError: longTermStats.total?.avg_error ? (longTermStats.total.avg_error * 100).toFixed(1) + '%' : 'N/A',
                    dayAvgError: longTermStats.day?.avg_error ? (longTermStats.day.avg_error * 100).toFixed(1) + '%' : 'N/A',
                    periodAvgError: longTermStats.period?.avg_error ? (longTermStats.period.avg_error * 100).toFixed(1) + '%' : 'N/A',
                    dayCount: longTermStats.day?.count || 0
                }
            };
            console.log('🧪 [DEBUG] 최종 backtestSummary:', backtestSummary);
        } catch (e) {
            console.error('🧪 [DEBUG] 백테스트 실행 실패:', e);
        }

        try {
            // historicalData를 최근 30일로 제한 (요청 크기 축소)
            const recentData = this.data.slice(-30);

            const response = await fetch(`${this.apiBase}/api/ai/predict-hourly`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentHour,
                    currentData,
                    historicalData: recentData, // 전체가 아닌 최근 30일만
                    analysisData: this.analysisData,
                    statisticalContext: this.getDetailedStats(currentHour, currentData),
                    basePredictions,
                    backtestSummary
                })
            });

            const result = await response.json();
            console.log('🔮 AI Predictions:', result);

            if (result.success && result.predictions) {
                // AI가 제공한 23시 최종값 추출
                const aiFinalValue = result.predictions.hour_23;

                if (aiFinalValue) {
                    console.log(`🤖 AI 원본 최종값(23시): ${aiFinalValue}`);

                    // 🔧 최근 7일 평균과 비교하여 보수적인 값 선택
                    const recent7DayAvg = this.calculateRecent7DayAverage();
                    let improvedFinalValue = aiFinalValue;

                    if (recent7DayAvg && recent7DayAvg > 0) {
                        // 🎯 둘 중 더 작은 값 선택 (과대 예측 방지)
                        improvedFinalValue = Math.min(aiFinalValue, recent7DayAvg);
                        if (improvedFinalValue === recent7DayAvg) {
                            console.log(`✅ 보수적 선택: AI(${aiFinalValue}) → 7일평균(${recent7DayAvg})`);
                        } else {
                            console.log(`✅ AI 값 사용 (AI ≤ 7일평균): ${aiFinalValue}`);
                        }
                    } else {
                        console.log(`⚠️ 7일 평균 계산 실패, AI 값 사용: ${aiFinalValue}`);
                    }

                    // 🎯 최종 예측값 상한 설정 (7일 평균의 115%까지만)
                    if (recent7DayAvg && recent7DayAvg > 0) {
                        const maxPrediction = Math.round(recent7DayAvg * 1.15);
                        if (improvedFinalValue > maxPrediction) {
                            console.log(`⚠️ 예측값 상한 초과: ${improvedFinalValue} → ${maxPrediction}`);
                            improvedFinalValue = maxPrediction;
                        }
                    }

                    // 🎯 현재값 정확히 파악
                    const currentValue = this.getCurrentActualValue();

                    // 🔧 최종값 검증 및 보정
                    if (improvedFinalValue < currentValue) {
                        console.warn(`⚠️ 최종값(${improvedFinalValue})이 현재값(${currentValue})보다 작음`);
                        const minFinalValue = currentValue + 50; // 최소 50 증가 보장
                        console.warn(`   보정: ${improvedFinalValue} → ${minFinalValue}`);
                        improvedFinalValue = minFinalValue;
                    }

                    // 🎯 실제 데이터의 마지막 시간 찾기
                    let lastActualHour = currentHour;
                    for (let h = 23; h >= 0; h--) {
                        const hourKey = `hour_${String(h).padStart(2, '0')}`;
                        if (currentData[hourKey] && parseInt(currentData[hourKey]) > 0) {
                            lastActualHour = h;
                            break;
                        }
                    }

                    console.log(`📍 실제 데이터 마지막 시간: ${lastActualHour}시`);
                    console.log(`📍 현재 시간: ${currentHour}시`);

                    // 마지막 실제 데이터의 값
                    const lastActualValue = lastActualHour < currentHour ? currentValue :
                        parseInt(currentData[`hour_${String(lastActualHour).padStart(2, '0')}`]) || currentValue;

                    // 🔥 추세 기반 최종값 동적 조정
                    if (lastActualHour >= 6 && lastActualHour < 23) {
                        // 현재 시점에서 예상되는 값 (7일 평균 기준)
                        const expectedProgress = (lastActualHour / 23) * improvedFinalValue;
                        const actualProgress = lastActualValue;
                        const progressRatio = actualProgress / expectedProgress;

                        console.log(`\n📈 추세 분석:`);
                        console.log(`   ${lastActualHour}시 예상값: ${Math.round(expectedProgress)}`);
                        console.log(`   ${lastActualHour}시 실제값: ${actualProgress}`);
                        console.log(`   진행률: ${(progressRatio * 100).toFixed(1)}%`);

                        // 🚀 가속도(Momentum) 기반 예측
                        // 최근 3시간(또는 가능한 만큼)의 평균 증가량을 계산
                        let recentVelocity = 0;
                        let velocityCount = 0;
                        const lookbackHours = 3;

                        for (let i = 0; i < lookbackHours; i++) {
                            const h = lastActualHour - i;
                            const prevH = h - 1;
                            if (prevH < 0) break;

                            const valCurrent = parseInt(currentData[`hour_${String(h).padStart(2, '0')}`]) || 0;
                            const valPrev = parseInt(currentData[`hour_${String(prevH).padStart(2, '0')}`]) || 0;

                            if (valCurrent > 0 && valPrev > 0) {
                                recentVelocity += (valCurrent - valPrev);
                                velocityCount++;
                            }
                        }

                        const avgVelocity = velocityCount > 0 ? recentVelocity / velocityCount : (lastActualValue / (lastActualHour + 1));
                        const remainingHours = 23 - lastActualHour;
                        const momentumPrediction = lastActualValue + (avgVelocity * remainingHours);

                        console.log(`   🚀 최근 속도: 시간당 ${avgVelocity.toFixed(1)}건`);
                        console.log(`   🚀 가속도 기반 예측: ${Math.round(momentumPrediction)}건`);

                        // 🧩 유사 패턴 기반 예측 추가
                        const similarDays = this.findSimilarPatterns(lastActualHour, currentData);
                        const patternPrediction = this.calculatePatternPrediction(similarDays, lastActualHour, lastActualValue);

                        let finalPredictionSource = momentumPrediction;
                        let sourceName = "가속도";

                        if (patternPrediction) {
                            console.log(`   🧩 패턴 매칭 예측: ${patternPrediction}건`);
                            // 가속도 예측과 패턴 예측 혼합 (50:50)
                            finalPredictionSource = (momentumPrediction + patternPrediction) / 2;
                            sourceName = "가속도+패턴";
                        }

                        // 혼합 가중치: 시간이 늦을수록 최근 추세(가속도/패턴)에 더 많은 가중치 (최대 80%)
                        const trendWeight = Math.min(0.8, Math.max(0.3, lastActualHour / 24));
                        const blendedFinal = Math.round((finalPredictionSource * trendWeight) + (improvedFinalValue * (1 - trendWeight)));

                        console.log(`   ⚖️ 가중치 적용: ${sourceName}(${Math.round(trendWeight * 100)}%) vs 7일평균(${(1 - trendWeight) * 100}%)`);
                        console.log(`   🎯 최종 보정값: ${improvedFinalValue} → ${blendedFinal}`);

                        improvedFinalValue = blendedFinal;

                        // 🔄 자가 보정(Self-Correction): 어제 오차율 반영
                        const biasFactor = this.calculateBacktestBias(lastActualHour);
                        if (biasFactor !== 1.0) {
                            const correctedFinal = Math.round(improvedFinalValue * biasFactor);
                            const percent = ((biasFactor - 1) * 100).toFixed(1);
                            console.log(`   🔄 자가 보정: 어제 ${percent}% 오차 반영 → ${improvedFinalValue}에서 ${correctedFinal}로 보정`);
                            improvedFinalValue = correctedFinal;
                        }

                        // 최종값이 현재값보다 작아지지 않도록 재검증
                        if (improvedFinalValue < lastActualValue) {
                            improvedFinalValue = lastActualValue + 50;
                            console.log(`   🔧 재보정: ${improvedFinalValue}`);
                        }
                    }

                    // 🎯 단순 선형 예측 적용 (마지막 실제 데이터 이후부터)
                    const trajectoryPredictions = this.calculateSimplePrediction(
                        lastActualHour,     // 실제 데이터의 마지막 시간
                        lastActualValue,    // 실제 데이터의 마지막 값
                        improvedFinalValue
                    );

                    this.aiPredictions = trajectoryPredictions;
                    console.log('✅ Trajectory + AI + Backtest 통합 예측 완료:', trajectoryPredictions);
                } else {
                    // AI가 최종값을 제공하지 않은 경우 기본 예측값 사용
                    this.aiPredictions = result.predictions;
                }

                // AI 예측 단계가 끝났으므로(성공) 카드/차트 업데이트를 허용
                this.aiPredictionsLoaded = true;

                // AI 예측값 단계가 끝났으므로 차트 갱신
                this.updateChart();

                // 🧪 백테스트 시뮬레이션 실행 (검증용)
                this.runBacktestSimulation();

                return result;
            }

            // 예측 성공 응답이 아니어도, AI 예측 단계는 종료된 것으로 간주
            this.aiPredictionsLoaded = true;
            return null;
        } catch (error) {
            console.error('🔮 AI Prediction Error:', error);
            this.showNotification('AI 예측을 가져오는데 실패했습니다.', 'warning');

            // 실패도 확정 상태로 간주(대기 상태로 남지 않게)
            this.aiPredictionsLoaded = true;
            return null;
        }
    }

    // 🧪 백테스트 시뮬레이션: 어제 데이터로 알고리즘 검증
    runBacktestSimulation() {
        console.log('\n📊 [백테스트] 어제 데이터 시뮬레이션 시작...');

        // 어제 데이터 찾기
        const yesterdayData = this.data.length > 1 ? this.data[this.data.length - 2] : null;
        if (!yesterdayData) {
            console.log('⚠️ 어제 데이터가 없어 백테스트를 건너뜁니다.');
            return;
        }

        const actualFinal = parseInt(yesterdayData.total) || 0;
        const testHours = [12, 15, 18]; // 테스트할 시점들
        const results = [];

        console.log(`   어제 실제 최종값: ${actualFinal}건`);

        testHours.forEach(simHour => {
            // 시뮬레이션: simHour까지만 데이터가 있다고 가정
            const currentVal = parseInt(yesterdayData[`hour_${String(simHour).padStart(2, '0')}`]) || 0;

            // 1. 가속도 계산 (최근 3시간)
            let recentVelocity = 0;
            let velocityCount = 0;
            for (let i = 0; i < 3; i++) {
                const h = simHour - i;
                const prevH = h - 1;
                if (prevH < 0) break;
                const valCurrent = parseInt(yesterdayData[`hour_${String(h).padStart(2, '0')}`]) || 0;
                const valPrev = parseInt(yesterdayData[`hour_${String(prevH).padStart(2, '0')}`]) || 0;
                if (valCurrent > 0 && valPrev > 0) {
                    recentVelocity += (valCurrent - valPrev);
                    velocityCount++;
                }
            }
            const avgVelocity = velocityCount > 0 ? recentVelocity / velocityCount : (currentVal / (simHour + 1));

            // 2. 가속도 기반 예측
            const remainingHours = 23 - simHour;
            const momentumPrediction = currentVal + (avgVelocity * remainingHours);

            // 3. 7일 평균 (여기서는 간단히 실제값과 비슷하다고 가정하거나 고정값 사용)
            // 시뮬레이션의 정확도를 위해 어제 기준 7일 평균을 계산해야 하지만, 
            // 여기서는 알고리즘의 '보정 능력'을 보기 위해 600(임의의 평균)을 가정
            const assumedAvg = 600;

            // 4. 가중치 혼합
            const momentumWeight = Math.min(0.8, Math.max(0.3, simHour / 24));
            const blendedFinal = Math.round((momentumPrediction * momentumWeight) + (assumedAvg * (1 - momentumWeight)));

            // 정확도 계산
            const accuracy = (1 - Math.abs(blendedFinal - actualFinal) / actualFinal) * 100;

            results.push({
                '시점': `${simHour}시`,
                '당시값': currentVal,
                '당시속도': avgVelocity.toFixed(1),
                '예측값': blendedFinal,
                '실제값': actualFinal,
                '정확도': `${accuracy.toFixed(1)}%`
            });
        });

        // 결과 출력
        console.table(results);

        const avgAccuracy = results.reduce((sum, r) => sum + parseFloat(r['정확도']), 0) / results.length;
        console.log(`✅ 백테스트 평균 정확도: ${avgAccuracy.toFixed(1)}%`);

        if (avgAccuracy > 90) {
            console.log('✨ 알고리즘 신뢰도: 매우 높음');
        } else if (avgAccuracy > 80) {
            console.log('✨ 알고리즘 신뢰도: 높음');
        } else {
            console.log('⚠️ 알고리즘 개선 필요');
        }
    }

    // 🔄 자가 보정: 어제 동시간대 오차율 계산
    calculateBacktestBias(checkHour) {
        // 어제 데이터 찾기
        const yesterdayData = this.data.length > 1 ? this.data[this.data.length - 2] : null;
        if (!yesterdayData) return 1.0; // 데이터 없으면 보정 없음

        const actualFinal = parseInt(yesterdayData.total) || 0;
        const currentVal = parseInt(yesterdayData[`hour_${String(checkHour).padStart(2, '0')}`]) || 0;

        if (actualFinal === 0 || currentVal === 0) return 1.0;

        // 어제 기준 가속도 예측 시뮬레이션
        let recentVelocity = 0;
        let velocityCount = 0;
        for (let i = 0; i < 3; i++) {
            const h = checkHour - i;
            const prevH = h - 1;
            if (prevH < 0) break;
            const valCurrent = parseInt(yesterdayData[`hour_${String(h).padStart(2, '0')}`]) || 0;
            const valPrev = parseInt(yesterdayData[`hour_${String(prevH).padStart(2, '0')}`]) || 0;
            if (valCurrent > 0 && valPrev > 0) {
                recentVelocity += (valCurrent - valPrev);
                velocityCount++;
            }
        }
        const avgVelocity = velocityCount > 0 ? recentVelocity / velocityCount : (currentVal / (checkHour + 1));

        const remainingHours = 23 - checkHour;
        const momentumPrediction = currentVal + (avgVelocity * remainingHours);

        // 어제 기준 혼합 예측 (평균값 600 가정)
        const assumedAvg = 600;
        const momentumWeight = Math.min(0.8, Math.max(0.3, checkHour / 24));
        const predictedFinal = (momentumPrediction * momentumWeight) + (assumedAvg * (1 - momentumWeight));

        // 보정 계수 = 실제값 / 예측값
        // 예: 실제 688 / 예측 622 = 1.106 (10.6% 과소평가했음 -> 1.106배 올려야 함)
        let bias = actualFinal / predictedFinal;

        // 안전장치: 너무 큰 보정 방지 (최대 ±20%)
        bias = Math.max(0.8, Math.min(1.2, bias));

        return bias;
    }

    // 🔍 유사 패턴 찾기: 현재까지의 그래프 모양과 가장 비슷한 과거 날짜 찾기
    findSimilarPatterns(currentHour, currentData) {
        if (this.data.length < 10) return []; // 데이터가 너무 적으면 스킵

        const similarities = [];
        const currentVector = [];

        // 현재 데이터 벡터 생성 (0시 ~ currentHour)
        for (let h = 0; h <= currentHour; h++) {
            const key = `hour_${String(h).padStart(2, '0')}`;
            currentVector.push(parseInt(currentData[key]) || 0);
        }

        // 과거 데이터와 비교
        // 마지막 데이터(오늘)는 제외
        for (let i = 0; i < this.data.length - 1; i++) {
            const pastDay = this.data[i];
            const pastVector = [];
            let isValid = true;

            for (let h = 0; h <= currentHour; h++) {
                const key = `hour_${String(h).padStart(2, '0')}`;
                const val = parseInt(pastDay[key]);
                if (isNaN(val)) {
                    isValid = false;
                    break;
                }
                pastVector.push(val);
            }

            if (!isValid) continue;

            // 유사도 계산 (MAE: Mean Absolute Error) - 낮을수록 유사함
            // 단순 차이가 아니라 '비율'의 차이를 봐야 함 (물량 규모가 다를 수 있으므로)
            // 정규화(Normalize) 후 비교
            const currentMax = Math.max(...currentVector, 1);
            const pastMax = Math.max(...pastVector, 1);

            let errorSum = 0;
            for (let k = 0; k < currentVector.length; k++) {
                const normCurrent = currentVector[k] / currentMax;
                const normPast = pastVector[k] / pastMax;
                errorSum += Math.abs(normCurrent - normPast);
            }

            const similarityScore = 1 - (errorSum / currentVector.length); // 1에 가까울수록 유사

            if (similarityScore > 0.8) { // 80% 이상 유사한 경우만
                similarities.push({
                    date: pastDay.date,
                    score: similarityScore,
                    data: pastDay,
                    finalValue: parseInt(pastDay.total) || 0
                });
            }
        }

        // 유사도 높은 순 정렬 후 상위 3개 반환
        return similarities.sort((a, b) => b.score - a.score).slice(0, 3);
    }

    // 🔮 패턴 기반 예측 계산
    calculatePatternPrediction(similarDays, currentHour, currentValue) {
        if (!similarDays || similarDays.length === 0) return null;

        let weightedSum = 0;
        let totalWeight = 0;

        console.log('   🔍 유사 패턴 기반 예측 분석:');

        similarDays.forEach(day => {
            // 과거 해당 날짜의 currentHour 시점 값
            const pastCurrentVal = parseInt(day.data[`hour_${String(currentHour).padStart(2, '0')}`]) || 1;
            const pastFinalVal = day.finalValue;

            // 그 날은 남은 시간 동안 몇 배 성장했나?
            const growthFactor = pastFinalVal / pastCurrentVal;

            // 오늘에 적용
            const predicted = currentValue * growthFactor;

            // 유사도를 가중치로 사용
            // score^2를 사용하여 아주 유사한 날에 더 큰 가중치 부여
            const weight = Math.pow(day.score, 2);

            weightedSum += predicted * weight;
            totalWeight += weight;

            console.log(`      - ${day.date} (유사도 ${(day.score * 100).toFixed(1)}%): 성장배수 ${growthFactor.toFixed(2)}배 → 예측 ${Math.round(predicted)}`);
        });

        if (totalWeight === 0) return null;

        return Math.round(weightedSum / totalWeight);
    }

    // 📊 상세 통계 컨텍스트 생성 (AI 제공용)
    getDetailedStats(currentHour, currentData) {
        const dayOfWeek = currentData.dayOfWeek;
        const todayDate = new Date();
        const isMonthStart = todayDate.getDate() <= 5;
        const isMonthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate() - todayDate.getDate() <= 5;

        // 1. 요일별 시간대 평균 (해당 요일의 과거 데이터만 필터링)
        const sameDayRows = this.data.filter(row => row.dayOfWeek === dayOfWeek);
        const hourlyAvg = new Array(24).fill(0);
        const hourlyCounts = new Array(24).fill(0);

        sameDayRows.forEach(row => {
            for (let h = 0; h < 24; h++) {
                const val = parseInt(row[`hour_${String(h).padStart(2, '0')}`]) || 0;
                if (val > 0) {
                    hourlyAvg[h] += val;
                    hourlyCounts[h]++;
                }
            }
        });
        for (let h = 0; h < 24; h++) {
            if (hourlyCounts[h] > 0) hourlyAvg[h] = Math.round(hourlyAvg[h] / hourlyCounts[h]);
        }

        // 2. 현재 추세 배수 (평균 대비 현재 실적 비율)
        let trendMultiplier = 1.0;
        const currentVal = parseInt(currentData[`hour_${String(currentHour).padStart(2, '0')}`]) || 0;
        if (currentVal > 0 && hourlyAvg[currentHour] > 0) {
            trendMultiplier = currentVal / hourlyAvg[currentHour];
        }

        // 3. 유사 과거 사례 (가장 비슷한 패턴의 3일)
        const similarDays = this.getSimilarDays(currentHour, currentData, sameDayRows);

        return {
            dayOfWeek,
            isMonthStart,
            isMonthEnd,
            hourlyAvg, // 해당 요일의 시간대별 평균
            trendMultiplier: trendMultiplier.toFixed(2), // 오늘이 평소보다 몇 배 바쁜지
            similarDays // 유사한 과거 3일의 데이터
        };
    }

    // 유사 패턴 날짜 찾기
    getSimilarDays(currentHour, currentData, candidateRows) {
        const currentVal = parseInt(currentData[`hour_${String(currentHour).padStart(2, '0')}`]) || 0;

        // 현재 시간대 값이 비슷한 날짜들을 찾음
        const scored = candidateRows.map(row => {
            const rowVal = parseInt(row[`hour_${String(currentHour).padStart(2, '0')}`]) || 0;
            const diff = Math.abs(rowVal - currentVal);
            return { ...row, diff };
        });

        // 차이가 적은 순으로 정렬하여 상위 3개 추출
        scored.sort((a, b) => a.diff - b.diff);

        return scored.slice(0, 3).map(row => ({
            date: row.date,
            total: row.total,
            data: row // 전체 데이터 포함
        }));
    }

    // 오늘의 현재까지 진행률 분석
    analyzeTodayProgress(currentHour, currentValue) {
        const currentData = this.getCurrentDayData();
        if (!currentData || !this.analysisData) {
            return { progressRatio: 1.0, velocityTrend: 1.0 };
        }

        // 같은 시간대 평균값 대비 현재 진행률
        const avgAtCurrentHour = this.analysisData.hourlyAverages[currentHour - 1] || currentValue;
        const progressRatio = avgAtCurrentHour > 0 ? currentValue / avgAtCurrentHour : 1.0;

        // 최근 3시간 속도 변화 분석
        const recentVelocity = this.calculateRecentVelocity(currentData, currentHour);

        return {
            progressRatio: Math.max(0.5, Math.min(2.0, progressRatio)), // 0.5배~2배 범위
            velocityTrend: Math.max(0.7, Math.min(1.5, recentVelocity)), // 0.7배~1.5배 범위
            currentValue
        };
    }

    // 최근 3시간 속도 변화 계산
    calculateRecentVelocity(currentData, currentHour) {
        if (currentHour < 3) return 1.0;

        const recentHours = Math.min(3, currentHour);
        let totalGrowth = 0;
        let growthCount = 0;

        for (let i = 1; i <= recentHours; i++) {
            const prevHour = currentHour - i;
            const currHour = currentHour - i + 1;

            const prevValue = parseInt(currentData[`hour_${prevHour.toString().padStart(2, '0')}`]) || 0;
            const currValue = parseInt(currentData[`hour_${currHour.toString().padStart(2, '0')}`]) || 0;

            if (prevValue > 0 && currValue > prevValue) {
                totalGrowth += (currValue - prevValue) / prevValue;
                growthCount++;
            }
        }

        return growthCount > 0 ? (totalGrowth / growthCount + 1) : 1.0;
    }

    // 최근 3-5일 같은 시간대 증가 패턴 분석
    analyzeRecentGrowthPattern(targetHour) {
        if (!this.data || this.data.length < 3) {
            return { avgGrowth: 20, growthRange: [10, 40], pattern: 'insufficient_data' };
        }

        const recentDays = this.data.slice(-5); // 최근 5일
        const growthValues = [];

        recentDays.forEach(dayData => {
            const fromValue = parseInt(dayData[`hour_${(targetHour - 1).toString().padStart(2, '0')}`]) || 0;
            const toValue = parseInt(dayData[`hour_${targetHour.toString().padStart(2, '0')}`]) || 0;

            if (fromValue > 0 && toValue > fromValue) {
                growthValues.push(toValue - fromValue);
            }
        });

        if (growthValues.length === 0) {
            return { avgGrowth: 20, growthRange: [15, 30], pattern: 'no_growth_data' };
        }

        // 통계 계산
        growthValues.sort((a, b) => a - b);
        const avgGrowth = growthValues.reduce((a, b) => a + b, 0) / growthValues.length;
        const medianGrowth = growthValues[Math.floor(growthValues.length / 2)];
        const minGrowth = growthValues[0];
        const maxGrowth = growthValues[growthValues.length - 1];

        return {
            avgGrowth: Math.round(avgGrowth),
            medianGrowth: Math.round(medianGrowth),
            growthRange: [minGrowth, maxGrowth],
            recentTrend: this.detectRecentTrend(growthValues),
            sampleSize: growthValues.length
        };
    }

    // 최근 추세 감지
    detectRecentTrend(growthValues) {
        if (growthValues.length < 3) return 'stable';

        const recent = growthValues.slice(-3);
        const earlier = growthValues.slice(0, -3);

        if (earlier.length === 0) return 'stable';

        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

        const changePct = (recentAvg - earlierAvg) / earlierAvg;

        if (changePct > 0.15) return 'increasing';
        if (changePct < -0.15) return 'decreasing';
        return 'stable';
    }

    // 추세 기반 최종 예측 계산
    calculateTrendBasedPrediction({ targetHour, previousValue, todayProgress, recentPattern, trendFactor }) {
        const { avgGrowth, medianGrowth, growthRange } = recentPattern;

        // 기본 예측: 최근 중간값 사용
        let basePrediction = previousValue + medianGrowth;

        // 추세 조정 적용
        const trendAdjustment = (avgGrowth * trendFactor) - avgGrowth;
        basePrediction += trendAdjustment;

        // 범위 내 제한
        const minPrediction = previousValue + Math.max(5, growthRange[0] * 0.8);
        const maxPrediction = previousValue + Math.min(growthRange[1] * 1.2, avgGrowth * 2);

        let finalPrediction = Math.max(minPrediction, Math.min(basePrediction, maxPrediction));

        // 일일 총량 현실성 체크
        if (this.analysisData) {
            const currentDailyMax = this.analysisData.avgDaily * 1.1; // 평균의 110%까지만
            if (finalPrediction > currentDailyMax) {
                finalPrediction = Math.max(previousValue + 10, currentDailyMax);
                console.log(`📉 일일 한계 적용: ${Math.round(currentDailyMax)}`);
            }
        }

        console.log(`📊 예측 세부사항:`);
        console.log(`  - 기본 증가량: ${medianGrowth} (범위: ${growthRange[0]}-${growthRange[1]})`);
        console.log(`  - 추세 계수: ${trendFactor.toFixed(2)}`);
        console.log(`  - 조정된 증가량: ${Math.round(finalPrediction - previousValue)}`);
        console.log(`🎯 최종 예측값: ${Math.round(finalPrediction)}`);

        return finalPrediction;
    }
    // 🧪 백테스트 실행 (과거 데이터로 예측 로직 검증 및 서버 동기화)
    async runBacktest(daysToTest = 90) { // 기본값 90일로 확대
        console.log(`🧪 Starting Backtest for last ${daysToTest} days...`);
        const results = [];
        const logsToSave = [];
        let totalErrorRate = 0;
        let validDays = 0;

        // 최근 날짜부터 역순으로 조회
        const sortedData = [...this.data].sort((a, b) => new Date(b.date) - new Date(a.date));

        // 오늘을 제외한 과거 데이터만 테스트
        const testData = sortedData.slice(1, daysToTest + 1);

        for (const dayData of testData) {
            if (!dayData.hour_23 || dayData.hour_23 === 0) continue;

            const actualFinal = parseInt(dayData.hour_23);
            const date = dayData.date;
            const dateObj = new Date(date);
            const dayOfWeek = dateObj.getDay();
            const dayName = ['일', '월', '화', '수', '목', '금', '토'][dayOfWeek];

            // 월초/월말 계산
            const isMonthStart = dateObj.getDate() <= 5 ? 1 : 0;
            const isMonthEnd = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate() - dateObj.getDate() <= 5 ? 1 : 0;

            // 12시 시점에서의 예측 테스트
            const targetHour = 12;
            const currentValAt12 = parseInt(dayData[`hour_${targetHour}`]) || 0;

            // 🔥 수정: Trajectory 누적 호출 제거, basePredictions 직접 사용
            let predictedFinal = 0;

            try {
                // calculateBasePredictionsForAI를 직접 호출
                const basePredictions = this.calculateBasePredictionsForAI(targetHour, {
                    total: currentValAt12,
                    date: date,
                    dayOfWeek: dayName
                });

                // 23시 예측값 추출
                predictedFinal = basePredictions.hour_23 || currentValAt12;
            } catch (error) {
                console.warn(`백테스트 ${date} 예측 실패:`, error);
                // 폴백: 간단한 배수 적용
                predictedFinal = Math.round(currentValAt12 * 3.0);
            }

            const error = predictedFinal - actualFinal; // 양수면 과대, 음수면 과소
            const errorRate = (error / actualFinal); // 퍼센트가 아닌 소수점 비율

            results.push({
                date,
                day: dayName,
                actual: actualFinal,
                predicted: predictedFinal,
                error: Math.abs(error),
                errorRate: (Math.abs(errorRate) * 100).toFixed(1) + '%'
            });

            logsToSave.push({
                date,
                day_of_week: dayOfWeek,
                is_month_start: isMonthStart,
                is_month_end: isMonthEnd,
                predicted_value: predictedFinal,
                actual_value: actualFinal,
                error_rate: errorRate
            });

            totalErrorRate += Math.abs(errorRate);
            validDays++;
        }

        // 서버에 로그 저장 (비동기)
        if (logsToSave.length > 0) {
            fetch(`${this.apiBase}/api/ai/log-accuracy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logs: logsToSave })
            }).then(res => res.json())
                .then(data => console.log(`💾 백테스트 결과 ${data.count}건 서버 저장 완료`))
                .catch(err => console.error('백테스트 저장 실패:', err));
        }

        const avgError = validDays > 0 ? (totalErrorRate / validDays * 100).toFixed(1) : 0;

        console.log(`🧪 백테스트 결과: 평균 오차율 ${avgError}%`);

        return {
            summary: `최근 ${validDays}일 평균 오차율: ${avgError}%`,
            details: results
        };
    }

    // 🧪 6가지 예측 알고리즘 백테스트 실행
    async runAllVariantsBacktest(daysToTest = 90) {
        console.log(`🧪========== 6가지 예측 알고리즘 백테스트 시작 ==========`);

        const variants = {
            V1: { name: '현재 방식', trendCap: 1.3, rawWeight: 0.7, minIncrement: 10 },
            V2: { name: '보수적', trendCap: 1.2, rawWeight: 0.5, minIncrement: 5 },
            V3: { name: '추세 제거', trendCap: 1.0, rawWeight: 0.7, minIncrement: 10 },
            V4: { name: '단순 평균', trendCap: 1.0, rawWeight: 0.0, minIncrement: 5 },  // 선형만 사용
            V5: { name: '선형 중심', trendCap: 1.3, rawWeight: 0.3, minIncrement: 10 },
            V6: { name: '시간대별 차등', trendCap: 1.2, rawWeight: 0.5, minIncrement: 'variable' }
        };

        const results = {};

        // 데이터 준비
        const sortedData = [...this.data].sort((a, b) => new Date(b.date) - new Date(a.date));
        const testData = sortedData.slice(1, daysToTest + 1);

        // 각 variant 테스트
        for (const [variantId, config] of Object.entries(variants)) {
            console.log(`\n🧪 [${variantId}] ${config.name} 테스트 중...`);

            let totalError = 0;
            let validDays = 0;
            let overCount = 0;
            let underCount = 0;

            for (const dayData of testData) {
                if (!dayData.hour_23 || dayData.hour_23 === 0) continue;

                const actualFinal = parseInt(dayData.hour_23);
                const date = dayData.date;
                const dateObj = new Date(date);
                const dayOfWeek = dateObj.getDay();
                const dayName = ['일', '월', '화', '수', '목', '금', '토'][dayOfWeek];

                const targetHour = 12;
                const currentValAt12 = parseInt(dayData[`hour_${targetHour}`]) || 0;

                // variant별 예측 계산
                const predicted = this.calculateVariantPrediction(
                    targetHour,
                    { total: currentValAt12, date: date, dayOfWeek: dayName },
                    config
                );

                const error = predicted - actualFinal;
                const errorRate = Math.abs(error) / actualFinal;

                totalError += errorRate;
                validDays++;

                if (error > 0) overCount++;
                else underCount++;
            }

            const avgErrorRate = validDays > 0 ? (totalError / validDays * 100).toFixed(2) : 0;

            results[variantId] = {
                name: config.name,
                avgError: avgErrorRate + '%',
                overCount,
                underCount,
                overRate: ((overCount / validDays) * 100).toFixed(1) + '%',
                underRate: ((underCount / validDays) * 100).toFixed(1) + '%'
            };

            console.log(`   ✅ ${variantId}: 오차율 ${avgErrorRate}%, 과대 ${overCount}회, 과소 ${underCount}회`);

            // 서버에 결과 저장
            try {
                const logs = [];
                for (const dayData of testData) {
                    if (!dayData.hour_23 || dayData.hour_23 === 0) continue;
                    const dateObj = new Date(dayData.date);
                    logs.push({
                        date: dayData.date,
                        day_of_week: dateObj.getDay(),
                        is_month_start: dateObj.getDate() <= 5 ? 1 : 0,
                        is_month_end: (new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate() - dateObj.getDate()) <= 5 ? 1 : 0,
                        predicted_value: this.calculateVariantPrediction(12, { total: parseInt(dayData.hour_12) || 0, date: dayData.date }, config),
                        actual_value: parseInt(dayData.hour_23),
                        error_rate: 0
                    });
                }
                fetch(`${this.apiBase}/api/ai/backtest-log`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ logs, variantId })
                }).catch(e => console.warn('백테스트 로그 저장 실패:', e));
            } catch (e) { }
        }

        // 결과 정렬 (오차율 낮은 순)
        const sorted = Object.entries(results).sort((a, b) =>
            parseFloat(a[1].avgError) - parseFloat(b[1].avgError)
        );

        console.log('\n🧪========== 백테스트 결과 요약 ==========');
        console.log('| Variant | 알고리즘 | 오차율 | 과대 | 과소 |');
        console.log('|---------|----------|--------|------|------|');
        for (const [id, data] of sorted) {
            console.log(`| ${id} | ${data.name} | ${data.avgError} | ${data.overRate} | ${data.underRate} |`);
        }
        console.log('=========================================');

        // 최고 성능 variant 반환
        const bestVariant = sorted[0][0];
        console.log(`\n🏆 최고 성능: ${bestVariant} (${results[bestVariant].name}) - 오차율 ${results[bestVariant].avgError}`);

        return { results, bestVariant };
    }

    // 🧪 Variant별 예측 계산
    calculateVariantPrediction(currentHour, currentData, config) {
        const currentValue = this.getLastNonZeroValue(currentData);
        const predictions = {};

        const currentDayOfWeek = currentData?.date ? new Date(currentData.date).getDay() : new Date().getDay();
        const sameDayData = this.data.filter(row => {
            const rowDate = new Date(row.date);
            return rowDate.getDay() === currentDayOfWeek;
        });

        if (sameDayData.length < 3) {
            // 데이터 부족 시 선형 증가
            let accumulated = currentValue;
            for (let h = currentHour + 1; h <= 23; h++) {
                accumulated += config.minIncrement === 'variable' ? 10 : config.minIncrement;
            }
            return accumulated;
        }

        // Raw increments
        const rawIncrements = this.learnHistoricalIncrements(currentHour, sameDayData);
        const linearIncrement = this.calculateLinearIncrement(currentHour, currentValue, sameDayData);

        // Variant별 가중치
        const rawWeight = config.rawWeight;
        const linearWeight = 1 - rawWeight;

        const weightedIncrements = {};
        for (let h = currentHour + 1; h <= 23; h++) {
            const raw = rawIncrements[h] || linearIncrement;
            weightedIncrements[h] = raw * rawWeight + linearIncrement * linearWeight;
        }

        // 이동평균
        const smoothedIncrements = this.applyMovingAverage(weightedIncrements, currentHour);

        // 추세 배수 (caps 적용)
        const trendMultiplier = this.calculateTrendMultiplier(currentHour, currentValue, sameDayData);
        const cappedTrend = Math.min(trendMultiplier, config.trendCap);

        // 최종 예측
        let accumulated = currentValue;

        for (let h = currentHour + 1; h <= 23; h++) {
            const smoothed = smoothedIncrements[h] || 20;
            const adjusted = Math.round(smoothed * cappedTrend);

            // 시간대별 차등 최소값
            let minInc;
            if (config.minIncrement === 'variable') {
                if (h < 12) minInc = 5;
                else if (h < 18) minInc = 10;
                else minInc = 15;
            } else {
                minInc = config.minIncrement;
            }

            const finalIncrement = Math.max(adjusted, minInc);
            accumulated += finalIncrement;
        }

        return accumulated;
    }
}
class PredictionMonitor {
    constructor() {
        this.metrics = {
            control: { total: 0, error: 0, squaredError: 0 },
            challenger: { total: 0, error: 0, squaredError: 0 }
        };
        this.userVariant = this.assignVariant();
        this.loadMetrics();
    }

    assignVariant() {
        const userId = localStorage.getItem('userId') || this.generateUserId();
        const hash = userId.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        const bucket = Math.abs(hash) % 100;
        return bucket < 50 ? 'control' : 'challenger';
    }

    generateUserId() {
        const userId = Math.random().toString(36).substr(2, 9);
        localStorage.setItem('userId', userId);
        return userId;
    }

    logPrediction(variant, predicted, actual) {
        const error = Math.abs(predicted - actual) / actual;
        const squaredError = Math.pow((predicted - actual) / actual, 2);

        this.metrics[variant].total++;
        this.metrics[variant].error += error;
        this.metrics[variant].squaredError += squaredError;

        // 로컬 스토리지에 저장
        const key = `prediction_log_${new Date().toISOString().split('T')[0]}`;
        const logs = JSON.parse(localStorage.getItem(key) || '[]');
        logs.push({
            variant,
            predicted,
            actual,
            error,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem(key, JSON.stringify(logs));

        this.saveMetrics();
    }

    saveMetrics() {
        localStorage.setItem('prediction_metrics', JSON.stringify(this.metrics));
    }

    loadMetrics() {
        const saved = localStorage.getItem('prediction_metrics');
        if (saved) {
            this.metrics = JSON.parse(saved);
        }
    }

    getAverageError(variant) {
        if (this.metrics[variant].total === 0) return 0;
        return this.metrics[variant].error / this.metrics[variant].total;
    }

    getRMSE(variant) {
        if (this.metrics[variant].total === 0) return 0;
        return Math.sqrt(this.metrics[variant].squaredError / this.metrics[variant].total);
    }

    checkRollbackConditions() {
        const alerts = [];

        // 1. 오차율 기반 롤백
        const controlError = this.getAverageError('control');
        if (controlError > 0.30) {
            alerts.push({
                type: 'ERROR_RATE',
                severity: 'critical',
                message: `오차율 ${controlError * 100}%로 임계값 초과`
            });
        }

        // 2. 시스템 오류 기반 롤백
        const systemErrorRate = this.getSystemErrorRate();
        if (systemErrorRate > 0.10) {
            alerts.push({
                type: 'SYSTEM_ERROR',
                severity: 'critical',
                message: `시스템 오류율 ${systemErrorRate * 100}%`
            });
        }

        return {
            shouldRollback: alerts.filter(a => a.severity === 'critical').length > 0,
            alerts,
            timestamp: new Date().toISOString()
        };
    }

    getSystemErrorRate() {
        // 실제 구현 시 서버 API 호출
        return 0.05; // 예시 값
    }

    generateReport() {
        return {
            timestamp: new Date().toISOString(),
            control: {
                totalPredictions: this.metrics.control.total,
                averageError: this.getAverageError('control'),
                rmse: this.getRMSE('control')
            },
            challenger: {
                totalPredictions: this.metrics.challenger.total,
                averageError: this.getAverageError('challenger'),
                rmse: this.getRMSE('challenger')
            },
            rollbackStatus: this.checkRollbackConditions()
        };
    }
}


// 전역에 추가
if (typeof window !== 'undefined') {
    window.Dashboard = Dashboard;
    window.PredictionMonitor = PredictionMonitor;
    window.OllamaPredictionEnhancer = OllamaPredictionEnhancer;
}
