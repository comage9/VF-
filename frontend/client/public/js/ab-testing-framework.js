// A/B 테스트 프레임워크
class ABTestingFramework {
    constructor() {
        this.config = {
            enabled: true,
            userId: localStorage.getItem('dashboardUserId') || this.generateUserId(),
            variants: {
                control: {
                    weight: 0.5,
                    predictionFunc: 'calculateHybridWeightedAverage',
                    name: '기존 개선 모델'
                },
                challenger: {
                    weight: 0.5,
                    predictionFunc: 'calculateRealisticPrediction',
                    name: '대체 모델'
                }
            },
            currentVariant: null,
            metrics: {
                control: { total: 0, error: 0, squaredError: 0, samples: [] },
                challenger: { total: 0, error: 0, squaredError: 0, samples: [] }
            }
        };

        // 평가 기준
        this.evaluationCriteria = {
            maxAverageError: 0.15,           // 평균 오차율 < 15%
            accuracyThreshold: 0.90,        // 90% 이상의 예측이 ±30% 이내
            errorMargin: 0.30,
            minSamples: 100,                 // 최소 100개의 샘플 필요
            testDuration: 14,                // 2주간의 테스트 기간
            statisticalSignificance: 0.10    // 90% 신뢰 수준
        };

        // 롤백 조건
        this.rollbackConditions = {
            maxErrorRate: 0.30,              // 평균 오차율이 30% 이상
            errorSpikeThreshold: 0.50,      // 5분간 오류율이 50% 이상
            errorSpikeDuration: 5 * 60 * 1000, // 5분
            userComplaints: 10,             // 사용자 불만 신고가 10건 이상
            systemErrorRate: 0.10           // 시스템 오류율이 10% 이상
        };

        this.initializeABTest();
        this.loadStoredMetrics();
    }

    // 사용자 ID 생성
    generateUserId() {
        const userId = Math.random().toString(36).substr(2, 9);
        localStorage.setItem('dashboardUserId', userId);
        return userId;
    }

    // A/B 테스트 초기화
    initializeABTest() {
        if (!this.config.enabled) {
            this.config.currentVariant = 'control';
            console.log('A/B 테스트 비활성화 - Control 모델만 사용');
            return;
        }

        // 해시 기반 variant 할당
        const hash = this.config.userId.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        const bucket = Math.abs(hash) % 100;

        this.config.currentVariant = bucket < 50 ? 'control' : 'challenger';

        console.log(`🧪 A/B 테스트 할당: ${this.config.currentVariant} (${this.config.variants[this.config.currentVariant].name})`);
        this.logVariantAssignment();
    }

    // Variant 할당 로깅
    logVariantAssignment() {
        const logEntry = {
            userId: this.config.userId,
            variant: this.config.currentVariant,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        };

        // 로컬 스토리지에 저장
        const key = `ab_test_assignment_${new Date().toISOString().split('T')[0]}`;
        const logs = JSON.parse(localStorage.getItem(key) || '[]');
        logs.push(logEntry);
        localStorage.setItem(key, JSON.stringify(logs));
    }

    // 예측 결과 로깅
    logPrediction(predicted, actual) {
        const variant = this.config.currentVariant;
        const error = Math.abs(predicted - actual) / actual;
        const squaredError = Math.pow((predicted - actual) / actual, 2);

        this.config.metrics[variant].total++;
        this.config.metrics[variant].error += error;
        this.config.metrics[variant].squaredError += squaredError;
        this.config.metrics[variant].samples.push({
            predicted,
            actual,
            error,
            timestamp: new Date().toISOString()
        });

        // 로컬 스토리지에 저장
        const key = `prediction_log_${new Date().toISOString().split('T')[0]}`;
        const logs = JSON.parse(localStorage.getItem(key) || '[]');
        logs.push({
            variant,
            userId: this.config.userId,
            predicted,
            actual,
            error,
            squaredError,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem(key, JSON.stringify(logs));

        this.checkRollbackConditions();
        this.updateMetricsDisplay();
    }

    // 롤백 조건 체크
    checkRollbackConditions() {
        const alerts = [];
        const currentMetrics = this.config.metrics[this.config.currentVariant];

        if (currentMetrics.total > 0) {
            const errorRate = currentMetrics.error / currentMetrics.total;

            // 1. 오차율 기반 롤백 체크
            if (errorRate > this.rollbackConditions.maxErrorRate) {
                alerts.push({
                    type: 'ERROR_RATE',
                    severity: 'critical',
                    message: `오차율 ${(errorRate * 100).toFixed(1)}%로 임계값 초과`
                });
            }

            // 2. 최소 샘플 수 체크
            if (currentMetrics.total < this.evaluationCriteria.minSamples &&
                this.getTestDuration() > this.evaluationCriteria.testDuration) {
                alerts.push({
                    type: 'INSUFFICIENT_SAMPLES',
                    severity: 'warning',
                    message: `샘플 수 부족: ${currentMetrics.total}/${this.evaluationCriteria.minSamples}`
                });
            }
        }

        if (alerts.length > 0) {
            console.warn('🚨 A/B 테스트 롤백 경고:', alerts);
            this.notifyRollbackAlerts(alerts);
        }
    }

    // 롤백 알림
    notifyRollbackAlerts(alerts) {
        const criticalAlerts = alerts.filter(a => a.severity === 'critical');
        if (criticalAlerts.length > 0) {
            // 실제 시스템에서는 Slack/Email 알림 구현
            console.error('🚨 즉시 롤백 권장:', criticalAlerts);
        }
    }

    // 테스트 기간 계산
    getTestDuration() {
        const firstLogKey = Object.keys(localStorage).find(key => key.startsWith('ab_test_assignment_'));
        if (!firstLogKey) return 0;

        const firstDate = new Date(firstLogKey.split('_')[3]);
        const today = new Date();
        return Math.floor((today - firstDate) / (1000 * 60 * 60 * 24));
    }

    // 성능 평가
    evaluatePerformance() {
        const results = {};

        for (const [variant, metrics] of Object.entries(this.config.metrics)) {
            if (metrics.total === 0) {
                results[variant] = { valid: false, reason: '데이터 부족' };
                continue;
            }

            const avgError = metrics.error / metrics.total;
            const accuracy = this.calculateAccuracy(metrics.samples);
            const confidenceInterval = this.calculateConfidenceInterval(metrics.samples);

            results[variant] = {
                valid: true,
                totalSamples: metrics.total,
                averageError: avgError,
                accuracy: accuracy,
                confidenceInterval: confidenceInterval,
                passedCriteria: {
                    avgError: avgError <= this.evaluationCriteria.maxAverageError,
                    accuracy: accuracy >= this.evaluationCriteria.accuracyThreshold,
                    samples: metrics.total >= this.evaluationCriteria.minSamples,
                    duration: this.getTestDuration() >= this.evaluationCriteria.testDuration
                }
            };
        }

        // 승자 결정
        if (results.control.valid && results.challenger.valid) {
            const controlError = results.control.averageError;
            const challengerError = results.challenger.averageError;
            const improvement = ((controlError - challengerError) / controlError * 100);

            results.winner = improvement > 0 ? 'challenger' : 'control';
            results.improvement = improvement;
        }

        return results;
    }

    // 정확도 계산 (±30% 이내 예측 비율)
    calculateAccuracy(samples) {
        if (samples.length === 0) return 0;

        const accuratePredictions = samples.filter(sample => {
            const relativeError = Math.abs(sample.predicted - sample.actual) / sample.actual;
            return relativeError <= this.evaluationCriteria.errorMargin;
        });

        return accuratePredictions.length / samples.length;
    }

    // 신뢰 구간 계산
    calculateConfidenceInterval(samples, confidence = 0.90) {
        if (samples.length < 2) return { lower: 0, upper: 1 };

        const errors = samples.map(s => s.error);
        const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
        const variance = errors.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (errors.length - 1);
        const stdError = Math.sqrt(variance / errors.length);

        // t-분포 임계값 (단순화)
        const tScore = confidence === 0.90 ? 1.645 : 1.96;
        const margin = tScore * stdError;

        return {
            lower: Math.max(0, mean - margin),
            upper: Math.min(1, mean + margin),
            mean: mean
        };
    }

    // 저장된 메트릭 로드
    loadStoredMetrics() {
        const logKeys = Object.keys(localStorage).filter(key => key.startsWith('prediction_log_'));

        logKeys.forEach(key => {
            try {
                const logs = JSON.parse(localStorage.getItem(key) || '[]');
                logs.forEach(log => {
                    if (log.userId === this.config.userId) {
                        const metrics = this.config.metrics[log.variant];
                        metrics.total++;
                        metrics.error += log.error;
                        metrics.squaredError += log.squaredError;
                        metrics.samples.push({
                            predicted: log.predicted,
                            actual: log.actual,
                            error: log.error,
                            timestamp: log.timestamp
                        });
                    }
                });
            } catch (e) {
                console.warn('Failed to load stored metrics:', e);
            }
        });
    }

    // 메트릭 표시 업데이트
    updateMetricsDisplay() {
        const performance = this.evaluatePerformance();

        // UI 업데이트 (실제 구현 시 필요)
        console.log(`📊 A/B 테스트 성능 (${this.config.currentVariant}):`, performance);
    }

    // 현재 variant 확인
    getCurrentVariant() {
        return this.config.currentVariant;
    }

    // 예측 함수 실행
    async executePrediction(dashboard, targetHour, previousValue) {
        const variant = this.config.currentVariant;
        const config = this.config.variants[variant];

        try {
            if (config.predictionFunc === 'calculateHybridWeightedAverage') {
                return await dashboard.calculateHybridWeightedAverage({
                    targetHour,
                    previousValue,
                    dayAdjustments: dashboard.getCurrentDayAdjustments()
                });
            } else if (config.predictionFunc === 'calculateRealisticPrediction') {
                return await dashboard.calculateRealisticPrediction({
                    targetHour,
                    previousValue
                });
            } else {
                throw new Error(`Unknown prediction function: ${config.predictionFunc}`);
            }
        } catch (error) {
            console.error(`예측 함수 실행 오류 (${variant}):`, error);
            // Fallback to control
            return await dashboard.calculateHybridWeightedAverage({
                targetHour,
                previousValue,
                dayAdjustments: dashboard.getCurrentDayAdjustments()
            });
        }
    }

    // 테스트 결과 보고서 생성
    generateReport() {
        const performance = this.evaluatePerformance();
        const testDuration = this.getTestDuration();

        return {
            testConfig: {
                duration: testDuration,
                enabled: this.config.enabled,
                variants: this.config.variants
            },
            performance: performance,
            recommendations: this.generateRecommendations(performance),
            summary: {
                totalSamples: Object.values(this.config.metrics).reduce((sum, m) => sum + m.total, 0),
                testDuration: testDuration,
                meetsMinSamples: Object.values(this.config.metrics).some(m => m.total >= this.evaluationCriteria.minSamples)
            }
        };
    }

    // 권장 사항 생성
    generateRecommendations(performance) {
        const recommendations = [];

        if (!performance.control.valid && !performance.challenger.valid) {
            recommendations.push({
                type: 'warning',
                message: '충분한 데이터가 수집되지 않았습니다. 테스트를 계속 진행하세요.'
            });
            return recommendations;
        }

        if (performance.winner) {
            const winner = performance.winner;
            const improvement = performance.improvement;

            if (improvement > 10) {
                recommendations.push({
                    type: 'success',
                    message: `${winner.toUpperCase()} 모델이 ${improvement.toFixed(1)}% 향상되었습니다. 전체 배포를 권장합니다.`
                });
            } else if (improvement > 0) {
                recommendations.push({
                    type: 'info',
                    message: `${winner.toUpperCase()} 모델이 ${improvement.toFixed(1)}% 향상되었습니다. 추가 테스트를 권장합니다.`
                });
            } else {
                recommendations.push({
                    type: 'warning',
                    message: '통계적으로 유의미한 차이가 없습니다. 기존 모델 유지를 권장합니다.'
                });
            }
        }

        return recommendations;
    }
}

// 전역 인스턴스 생성
window.abTestFramework = new ABTestingFramework();