// 자동 롤백 시스템
class RollbackSystem {
    constructor() {
        this.featureFlags = {
            improvedPrediction: {
                enabled: true,
                rollout: 100,
                fallback: 'original'
            },
            dayPenaltyRemoval: {
                enabled: true,
                rollout: 100
            },
            recentDataWeighting: {
                enabled: true,
                rollout: 100
            },
            abTesting: {
                enabled: true,
                rollout: 50
            }
        };

        this.rollbackConditions = {
            maxErrorRate: 0.30,              // 평균 오차율 30% 이상
            errorSpikeThreshold: 0.50,      // 5분간 오류율 50% 이상
            errorSpikeDuration: 5 * 60 * 1000, // 5분
            userComplaints: 10,             // 사용자 불만 10건 이상
            systemErrorRate: 0.10           // 시스템 오류율 10% 이상
        };

        this.rollbackHistory = [];
        this.isRollingBack = false;
        this.lastCheck = Date.now();
        this.errorHistory = [];

        // 자동 체크 시작
        this.startAutomaticMonitoring();
    }

    // 자동 모니터링 시작
    startAutomaticMonitoring() {
        setInterval(() => {
            this.performHealthCheck();
        }, 60000); // 1분마다 체크

        console.log('🛡️ 자동 롤백 모니터링 시스템 시작');
    }

    // 건강 상태 체크
    async performHealthCheck() {
        const now = Date.now();
        const alerts = [];

        try {
            // 1. A/B 테스트 성능 체크
            const abTestPerformance = this.checkABTestPerformance();
            if (abTestPerformance.needsRollback) {
                alerts.push({
                    type: 'AB_TEST_PERFORMANCE',
                    severity: abTestPerformance.severity,
                    message: abTestPerformance.message,
                    data: abTestPerformance
                });
            }

            // 2. 시스템 오류율 체크
            const systemHealth = await this.checkSystemHealth();
            if (systemHealth.needsRollback) {
                alerts.push({
                    type: 'SYSTEM_HEALTH',
                    severity: 'critical',
                    message: '시스템 오류율 임계값 초과',
                    data: systemHealth
                });
            }

            // 3. 오차율 스파이크 체크
            const errorSpike = this.checkErrorSpike();
            if (errorSpike.detected) {
                alerts.push({
                    type: 'ERROR_SPIKE',
                    severity: 'critical',
                    message: `오차율 급증: ${errorSpike.rate.toFixed(1)}%`,
                    data: errorSpike
                });
            }

            // 4. 사용자 불만 체크 (실제로는 API/피드백 시스템 연동)
            const userComplaints = this.checkUserComplaints();
            if (userComplaints.needsRollback) {
                alerts.push({
                    type: 'USER_COMPLAINTS',
                    severity: 'high',
                    message: `사용자 불만 ${userComplaints.count}건 발생`,
                    data: userComplaints
                });
            }

            // 롤백 결정
            if (alerts.length > 0 && !this.isRollingBack) {
                await this.evaluateAndExecuteRollback(alerts);
            }

        } catch (error) {
            console.error('🚨 건강 상태 체크 오류:', error);
        }
    }

    // A/B 테스트 성능 체크
    checkABTestPerformance() {
        if (!window.abTestFramework) {
            return { needsRollback: false };
        }

        const performance = window.abTestFramework.evaluatePerformance();
        const currentVariant = window.abTestFramework.getCurrentVariant();
        const metrics = performance[currentVariant];

        if (!metrics || !metrics.valid) {
            return { needsRollback: false, severity: 'warning' };
        }

        // 평균 오차율 체크
        if (metrics.averageError > this.rollbackConditions.maxErrorRate) {
            return {
                needsRollback: true,
                severity: 'critical',
                message: `A/B 테스트 평균 오차율 ${(metrics.averageError * 100).toFixed(1)}% 초과`,
                variant: currentVariant,
                error: metrics.averageError
            };
        }

        return { needsRollback: false };
    }

    // 시스템 건강 상태 체크
    async checkSystemHealth() {
        try {
            // API 상태 체크 (실제로는 서버 상태 API 호출)
            const response = await fetch('/api/health', { timeout: 5000 });
            const health = await response.json();

            if (health.errorRate > this.rollbackConditions.systemErrorRate) {
                return {
                    needsRollback: true,
                    errorRate: health.errorRate,
                    uptime: health.uptime,
                    memory: health.memory
                };
            }

        } catch (error) {
            // API 호출 실패도 시스템 문제로 간주
            return {
                needsRollback: true,
                error: 'Health check API failed',
                timestamp: new Date().toISOString()
            };
        }

        return { needsRollback: false };
    }

    // 오차율 스파이크 체크
    checkErrorSpike() {
        const now = Date.now();
        const recentErrors = this.errorHistory.filter(
            timestamp => now - timestamp < this.rollbackConditions.errorSpikeDuration
        );

        if (recentErrors.length > 0) {
            const errorRate = recentErrors.length / (this.rollbackConditions.errorSpikeDuration / (1000 * 60));
            if (errorRate > this.rollbackConditions.errorSpikeThreshold) {
                return {
                    detected: true,
                    rate: errorRate,
                    count: recentErrors.length,
                    duration: this.rollbackConditions.errorSpikeDuration
                };
            }
        }

        return { detected: false };
    }

    // 사용자 불만 체크
    checkUserComplaints() {
        // 실제로는 피드백 데이터베이스/시스템 연동
        const today = new Date().toISOString().split('T')[0];
        const complaints = JSON.parse(localStorage.getItem(`user_complaints_${today}`) || '[]');

        if (complaints.length >= this.rollbackConditions.userComplaints) {
            return {
                needsRollback: true,
                count: complaints.length,
                complaints: complaints.slice(-5) // 최근 5개
            };
        }

        return { needsRollback: false, count: complaints.length };
    }

    // 롤백 평가 및 실행
    async evaluateAndExecuteRollback(alerts) {
        const criticalAlerts = alerts.filter(a => a.severity === 'critical');
        const highAlerts = alerts.filter(a => a.severity === 'high');

        if (criticalAlerts.length > 0) {
            console.error('🚨 즉시 롤백 실행 (Critical):', criticalAlerts);
            await this.executeRollback('critical', criticalAlerts);
        } else if (highAlerts.length >= 2) {
            console.warn('⚠️ 롤백 실행 (High):', highAlerts);
            await this.executeRollback('high', highAlerts);
        } else {
            console.log('📋 롤백 경고 기록:', alerts);
            this.logRollbackAlert(alerts);
        }
    }

    // 롤백 실행
    async executeRollback(severity, alerts) {
        this.isRollingBack = true;

        try {
            const rollbackId = this.generateRollbackId();
            const timestamp = new Date().toISOString();

            // 1. 롤백 기록
            const rollbackEntry = {
                id: rollbackId,
                timestamp: timestamp,
                severity: severity,
                alerts: alerts,
                preRollbackState: this.captureCurrentState(),
                actions: []
            };

            // 2. 기능 플래그 비활성화
            const disabledFeatures = this.disableFeatures(alerts);
            rollbackEntry.actions.push(...disabledFeatures);

            // 3. 원본 로직으로 복구
            const restoredFunctions = this.restoreOriginalLogic();
            rollbackEntry.actions.push(...restoredFunctions);

            // 4. A/B 테스트 중단
            if (window.abTestFramework) {
                window.abTestFramework.config.enabled = false;
                rollbackEntry.actions.push('A/B 테스트 비활성화');
            }

            // 5. 롤백 기록 저장
            this.rollbackHistory.push(rollbackEntry);
            this.saveRollbackHistory();

            // 6. 알림 전송
            await this.sendRollbackNotification(rollbackEntry);

            console.log(`✅ 롤백 완료 (${rollbackId}):`, rollbackEntry);

            // 7. 모니터링 강화 (롤백 후 30분간)
            this.intensifyMonitoring(rollbackId);

        } catch (error) {
            console.error('🚨 롤백 실행 중 오류:', error);
            // 긴급 알림 전송
            await this.sendEmergencyAlert(error);
        } finally {
            this.isRollingBack = false;
        }
    }

    // 기능 비활성화
    disableFeatures(alerts) {
        const actions = [];

        if (alerts.some(a => a.type.includes('PREDICTION') || a.type.includes('AB_TEST'))) {
            this.featureFlags.improvedPrediction.enabled = false;
            this.featureFlags.abTesting.enabled = false;
            actions.push('예측 개선 기능 비활성화');
            actions.push('A/B 테스트 비활성화');
        }

        if (alerts.some(a => a.type.includes('SYSTEM'))) {
            // 모든 실험적 기능 비활성화
            Object.keys(this.featureFlags).forEach(feature => {
                if (this.featureFlags[feature].enabled) {
                    this.featureFlags[feature].enabled = false;
                    actions.push(`${feature} 비활성화`);
                }
            });
        }

        return actions;
    }

    // 원본 로직 복구
    restoreOriginalLogic() {
        const actions = [];

        // 실제로는 백업된 원본 함수로 복구
        if (typeof window.restoreOriginalPredictionLogic === 'function') {
            window.restoreOriginalPredictionLogic();
            actions.push('원본 예측 로직 복구');
        }

        if (typeof window.restoreOriginalDayAdjustments === 'function') {
            window.restoreOriginalDayAdjustments();
            actions.push('원본 요일 조정 복구');
        }

        return actions;
    }

    // 현재 상태 캡처
    captureCurrentState() {
        return {
            featureFlags: { ...this.featureFlags },
            timestamp: new Date().toISOString(),
            abTestVariant: window.abTestFramework ? window.abTestFramework.getCurrentVariant() : null,
            metrics: window.abTestFramework ? { ...window.abTestFramework.config.metrics } : null
        };
    }

    // 롤백 ID 생성
    generateRollbackId() {
        return `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    // 롤백 알림 전송
    async sendRollbackNotification(rollbackEntry) {
        const message = `🚨 자동 롤백 실행\n\nID: ${rollbackEntry.id}\n시간: ${rollbackEntry.timestamp}\n심각도: ${rollbackEntry.severity}\n사유: ${rollbackEntry.alerts.map(a => a.message).join(', ')}\n조치: ${rollbackEntry.actions.join(', ')}`;

        // 실제로는 Slack, Email, PagerDuty 등 연동
        console.error('📧 롤백 알림:', message);

        // 로컬 스토리지에 저장
        const notifications = JSON.parse(localStorage.getItem('rollback_notifications') || '[]');
        notifications.push({
            id: rollbackEntry.id,
            message: message,
            timestamp: rollbackEntry.timestamp,
            sent: true
        });
        localStorage.setItem('rollback_notifications', JSON.stringify(notifications));
    }

    // 긴급 알림 전송
    async sendEmergencyAlert(error) {
        const message = `🆘 긴급: 롤백 시스템 오류\n\n${error.message}\n\n즉시 확인 필요!`;

        console.error('🆘 긴급 알림:', message);

        // 로컬 스토리지에 저장
        const emergencies = JSON.parse(localStorage.getItem('emergency_alerts') || '[]');
        emergencies.push({
            message: message,
            error: error.toString(),
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('emergency_alerts', JSON.stringify(emergencies));
    }

    // 모니터링 강화
    intensifyMonitoring(rollbackId) {
        console.log(`🔍 롤백 후 모니터링 강화 (${rollbackId}) - 30분간`);

        let intensifiedChecks = 0;
        const maxChecks = 30; // 30분간 1분마다 체크

        const intensifiedInterval = setInterval(async () => {
            intensifiedChecks++;

            try {
                const health = await this.checkSystemHealth();
                console.log(`🔍 롤백 후 모니터링 (${intensifiedChecks}/${maxChecks}):`, health);

                if (health.needsRollback) {
                    console.error('🚨 롤백 후에도 시스템 문제 지속 - 수동 개입 필요!');
                    clearInterval(intensifiedInterval);
                    await this.sendEmergencyAlert(new Error('Rollback failed - system still unstable'));
                }

            } catch (error) {
                console.error('🔍 롤백 후 모니터링 오류:', error);
            }

            if (intensifiedChecks >= maxChecks) {
                console.log('✅ 롤백 후 모니터링 완료');
                clearInterval(intensifiedInterval);
            }
        }, 60000); // 1분마다
    }

    // 롤백 기록 저장
    saveRollbackHistory() {
        try {
            localStorage.setItem('rollback_history', JSON.stringify(this.rollbackHistory));
        } catch (error) {
            console.error('롤백 기록 저장 오류:', error);
        }
    }

    // 롤백 기록 로드
    loadRollbackHistory() {
        try {
            const saved = localStorage.getItem('rollback_history');
            if (saved) {
                this.rollbackHistory = JSON.parse(saved);
            }
        } catch (error) {
            console.error('롤백 기록 로드 오류:', error);
            this.rollbackHistory = [];
        }
    }

    // 롤백 경고 기록
    logRollbackAlert(alerts) {
        const entry = {
            timestamp: new Date().toISOString(),
            alerts: alerts,
            action: 'logged_only'
        };

        this.rollbackHistory.push(entry);
        this.saveRollbackHistory();
    }

    // 오차율 기록 (외부에서 호출)
    recordError(error) {
        this.errorHistory.push(Date.now());

        // 오류 기록 정리 (최근 1시간만 유지)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        this.errorHistory = this.errorHistory.filter(timestamp => timestamp > oneHourAgo);
    }

    // 롤백 기록 보고서
    generateRollbackReport() {
        const last24Hours = this.rollbackHistory.filter(
            entry => Date.now() - new Date(entry.timestamp).getTime() < 24 * 60 * 60 * 1000
        );

        const last7Days = this.rollbackHistory.filter(
            entry => Date.now() - new Date(entry.timestamp).getTime() < 7 * 24 * 60 * 60 * 1000
        );

        return {
            summary: {
                last24Hours: last24Hours.length,
                last7Days: last7Days.length,
                total: this.rollbackHistory.length,
                lastRollback: this.rollbackHistory.length > 0 ? this.rollbackHistory[this.rollbackHistory.length - 1] : null
            },
            featureFlags: this.featureFlags,
            currentSystem: {
                isRollingBack: this.isRollingBack,
                lastCheck: new Date(this.lastCheck).toISOString()
            },
            recentRollbacks: last7Days.slice(-5)
        };
    }

    // 수동 롤백
    async manualRollback(reason = 'Manual rollback requested') {
        const alerts = [{
            type: 'MANUAL',
            severity: 'critical',
            message: reason,
            data: { requestedBy: 'user', timestamp: new Date().toISOString() }
        }];

        console.warn('🔧 수동 롤백 요청:', reason);
        await this.executeRollback('manual', alerts);
    }

    // 수동 롤백 취소 (개선된 모델 복구)
    async cancelRollback() {
        console.log('🔄 롤백 취소 및 개선 모델 복구');

        // 기능 플래그 복구
        this.featureFlags.improvedPrediction.enabled = true;
        this.featureFlags.abTesting.enabled = true;

        if (window.abTestFramework) {
            window.abTestFramework.config.enabled = true;
            window.abTestFramework.initializeABTest();
        }

        const recoveryEntry = {
            id: `recovery_${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: 'recovery',
            message: '롤백 취소 및 개선 모델 복구'
        };

        this.rollbackHistory.push(recoveryEntry);
        this.saveRollbackHistory();

        console.log('✅ 개선 모델 복구 완료');
    }
}

// 전역 롤백 시스템 인스턴스
window.rollbackSystem = new RollbackSystem();