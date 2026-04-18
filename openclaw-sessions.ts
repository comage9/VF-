/**
 * OpenClaw 세션 관리 TypeScript 인터페이스
 * OpenClaw CLI의 sessions 명령어 기능을 TypeScript로 표현한 인터페이스
 */

/**
 * 세션 종류 (kind)
 */
export type SessionKind = 'direct' | 'subagent' | 'background' | 'task';

/**
 * 세션 모델 정보
 */
export interface SessionModelInfo {
  /** 모델 이름 (예: "deepseek/deepseek-v3.2") */
  model: string;
  /** 모델 제공자 (예: "openrouter") */
  modelProvider: string;
  /** 컨텍스트 토큰 수 */
  contextTokens: number;
}

/**
 * 세션 토큰 사용량
 */
export interface SessionTokenUsage {
  /** 입력 토큰 수 */
  inputTokens?: number;
  /** 출력 토큰 수 */
  outputTokens?: number;
  /** 총 토큰 수 */
  totalTokens?: number;
  /** 토큰 사용량 정보가 최신인지 여부 */
  totalTokensFresh?: boolean;
}

/**
 * 개별 세션 정보
 */
export interface OpenClawSession {
  /** 세션 키 (고유 식별자) */
  key: string;
  /** 마지막 업데이트 타임스탬프 (밀리초) */
  updatedAt: number;
  /** 세션 생성 이후 경과 시간 (밀리초) */
  ageMs: number;
  /** 세션 ID */
  sessionId: string;
  /** 에이전트 ID */
  agentId: string;
  /** 세션 종류 */
  kind: SessionKind;
  /** 시스템 메시지 전송 여부 */
  systemSent?: boolean;
  /** 마지막 실행이 중단되었는지 여부 */
  abortedLastRun?: boolean;
  /** 모델 정보 */
  model?: string;
  modelProvider?: string;
  contextTokens?: number;
  /** 토큰 사용량 */
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalTokensFresh?: boolean;
}

/**
 * 세션 목록 응답
 */
export interface OpenClawSessionsResponse {
  /** 세션 저장소 파일 경로 */
  path: string;
  /** 세션 수 */
  count: number;
  /** 활성 세션 필터 (분) */
  activeMinutes: number | null;
  /** 세션 목록 */
  sessions: OpenClawSession[];
}

/**
 * 세션 목록 조회 옵션
 */
export interface ListSessionsOptions {
  /** 에이전트 ID (기본값: 설정된 기본 에이전트) */
  agent?: string;
  /** 모든 에이전트의 세션을 집계할지 여부 */
  allAgents?: boolean;
  /** N분 내에 업데이트된 활성 세션만 표시 */
  active?: number;
  /** JSON 출력 여부 */
  json?: boolean;
  /** 세션 저장소 경로 */
  store?: string;
  /** 상세 로깅 여부 */
  verbose?: boolean;
}

/**
 * 세션 정리 옵션
 */
export interface CleanupSessionsOptions {
  /** 에이전트 ID */
  agent?: string;
  /** 최대 보관 기간 (일) */
  maxAgeDays?: number;
  /** 최대 세션 수 */
  maxSessions?: number;
  /** 건별 확인 여부 */
  interactive?: boolean;
  /** 실제 삭제 전 시뮬레이션 실행 */
  dryRun?: boolean;
}

/**
 * 세션 관리 클라이언트 인터페이스
 */
export interface OpenClawSessionsClient {
  /**
   * 세션 목록 조회
   * @param options 조회 옵션
   * @returns 세션 목록
   */
  list(options?: ListSessionsOptions): Promise<OpenClawSessionsResponse>;
  
  /**
   * 세션 정리 실행
   * @param options 정리 옵션
   * @returns 정리 결과
   */
  cleanup(options?: CleanupSessionsOptions): Promise<CleanupResult>;
  
  /**
   * 특정 세션 정보 조회
   * @param sessionId 세션 ID
   * @returns 세션 정보
   */
  get(sessionId: string): Promise<OpenClawSession | null>;
  
  /**
   * 특정 세션 삭제
   * @param sessionId 세션 ID
   * @returns 삭제 성공 여부
   */
  delete(sessionId: string): Promise<boolean>;
  
  /**
   * 모든 세션 삭제
   * @param agentId 에이전트 ID (지정하지 않으면 모든 에이전트)
   * @returns 삭제된 세션 수
   */
  deleteAll(agentId?: string): Promise<number>;
}

/**
 * 세션 정리 결과
 */
export interface CleanupResult {
  /** 삭제된 세션 수 */
  deletedCount: number;
  /** 보존된 세션 수 */
  retainedCount: number;
  /** 총 세션 수 (삭제 전) */
  totalCount: number;
  /** 삭제된 세션 ID 목록 */
  deletedSessions: string[];
  /** 보존된 세션 ID 목록 */
  retainedSessions: string[];
  /** 정리 기준 */
  criteria: {
    maxAgeDays?: number;
    maxSessions?: number;
    agentFilter?: string;
  };
}

/**
 * 세션 통계 정보
 */
export interface SessionStatistics {
  /** 총 세션 수 */
  totalSessions: number;
  /** 활성 세션 수 (최근 1시간 내) */
  activeSessions: number;
  /** 평균 세션 수명 (시간) */
  averageSessionAgeHours: number;
  /** 에이전트별 세션 분포 */
  sessionsByAgent: Record<string, number>;
  /** 종류별 세션 분포 */
  sessionsByKind: Record<SessionKind, number>;
  /** 총 토큰 사용량 */
  totalTokensUsed: number;
  /** 평균 토큰 사용량 */
  averageTokensPerSession: number;
}

/**
 * 세션 모니터링 옵션
 */
export interface SessionMonitoringOptions {
  /** 모니터링 간격 (밀리초) */
  intervalMs?: number;
  /** 상태 변경 시 콜백 */
  onSessionChange?: (changes: SessionChangeEvent) => void;
  /** 토큰 사용량 임계값 */
  tokenThreshold?: number;
  /** 장시간 실행 세션 경고 임계값 (시간) */
  longRunningThresholdHours?: number;
}

/**
 * 세션 변경 이벤트
 */
export interface SessionChangeEvent {
  /** 이벤트 타입 */
  type: 'created' | 'updated' | 'deleted' | 'tokenThreshold' | 'longRunning';
  /** 세션 정보 */
  session: OpenClawSession;
  /** 변경 전 세션 정보 (업데이트/삭제 시) */
  previousSession?: OpenClawSession;
  /** 추가 데이터 */
  data?: {
    tokenUsage?: SessionTokenUsage;
    runningTimeHours?: number;
  };
}

/**
 * CLI 명령어 실행을 위한 유틸리티 함수
 */
export interface OpenClawCLIUtils {
  /**
   * OpenClaw CLI 명령어 실행
   * @param args 명령어 인수
   * @returns 실행 결과
   */
  executeCommand(args: string[]): Promise<CommandResult>;
  
  /**
   * 세션 목록 조회 (CLI 호출)
   * @param options 조회 옵션
   * @returns 세션 목록 JSON
   */
  getSessionsViaCLI(options?: ListSessionsOptions): Promise<OpenClawSessionsResponse>;
  
  /**
   * 세션 정리 실행 (CLI 호출)
   * @param options 정리 옵션
   * @returns 정리 결과
   */
  cleanupSessionsViaCLI(options?: CleanupSessionsOptions): Promise<CleanupResult>;
}

/**
 * CLI 명령어 실행 결과
 */
export interface CommandResult {
  /** 성공 여부 */
  success: boolean;
  /** 표준 출력 */
  stdout: string;
  /** 표준 에러 */
  stderr: string;
  /** 종료 코드 */
  exitCode: number;
  /** 실행 시간 (밀리초) */
  executionTimeMs: number;
}

/**
 * 구현 예시: 간단한 세션 관리 클라이언트
 */
export class SimpleOpenClawSessionsClient implements OpenClawSessionsClient {
  private cliPath: string = 'openclaw';
  
  constructor(cliPath?: string) {
    if (cliPath) {
      this.cliPath = cliPath;
    }
  }
  
  async list(options: ListSessionsOptions = {}): Promise<OpenClawSessionsResponse> {
    const args = ['sessions'];
    
    if (options.agent) {
      args.push('--agent', options.agent);
    }
    
    if (options.allAgents) {
      args.push('--all-agents');
    }
    
    if (options.active !== undefined) {
      args.push('--active', options.active.toString());
    }
    
    if (options.json) {
      args.push('--json');
    }
    
    if (options.store) {
      args.push('--store', options.store);
    }
    
    if (options.verbose) {
      args.push('--verbose');
    }
    
    const result = await this.executeCommand(args);
    
    if (!result.success) {
      throw new Error(`Failed to list sessions: ${result.stderr}`);
    }
    
    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`Failed to parse sessions JSON: ${error}`);
    }
  }
  
  async cleanup(options: CleanupSessionsOptions = {}): Promise<CleanupResult> {
    // 실제 구현에서는 CLI의 cleanup 하위 명령어를 호출해야 함
    // 현재 CLI에는 cleanup 명령어만 있고 옵션이 명시되지 않음
    const args = ['sessions', 'cleanup'];
    
    // 옵션을 CLI 인수로 변환 (가정)
    if (options.agent) {
      args.push('--agent', options.agent);
    }
    
    if (options.maxAgeDays) {
      args.push('--max-age-days', options.maxAgeDays.toString());
    }
    
    if (options.maxSessions) {
      args.push('--max-sessions', options.maxSessions.toString());
    }
    
    if (options.interactive) {
      args.push('--interactive');
    }
    
    if (options.dryRun) {
      args.push('--dry-run');
    }
    
    const result = await this.executeCommand(args);
    
    if (!result.success) {
      throw new Error(`Failed to cleanup sessions: ${result.stderr}`);
    }
    
    // 실제 구현에서는 CLI 출력을 파싱하여 CleanupResult 생성
    // 여기서는 단순한 예시 반환
    return {
      deletedCount: 0,
      retainedCount: 0,
      totalCount: 0,
      deletedSessions: [],
      retainedSessions: [],
      criteria: {
        maxAgeDays: options.maxAgeDays,
        maxSessions: options.maxSessions,
        agentFilter: options.agent
      }
    };
  }
  
  async get(sessionId: string): Promise<OpenClawSession | null> {
    const response = await this.list({ json: true });
    return response.sessions.find(session => session.sessionId === sessionId) || null;
  }
  
  async delete(sessionId: string): Promise<boolean> {
    // 실제 구현에서는 세션 삭제 CLI 명령어 필요
    // 현재는 목록에서 필터링하는 방식으로 구현
    console.warn('Session deletion not fully implemented in CLI');
    return false;
  }
  
  async deleteAll(agentId?: string): Promise<number> {
    // 실제 구현에서는 모든 세션 삭제 CLI 명령어 필요
    console.warn('Delete all sessions not fully implemented in CLI');
    return 0;
  }
  
  private async executeCommand(args: string[]): Promise<CommandResult> {
    // 실제 구현에서는 child_process를 사용하여 CLI 실행
    // 여기서는 단순한 예시
    const startTime = Date.now();
    
    try {
      // 실제 구현에서는 exec 또는 spawn 사용
      console.log(`Executing: ${this.cliPath} ${args.join(' ')}`);
      
      // 더미 응답 반환
      return {
        success: true,
        stdout: '{}',
        stderr: '',
        exitCode: 0,
        executionTimeMs: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1,
        executionTimeMs: Date.now() - startTime
      };
    }
  }
}

/**
 * 세션 모니터링 클래스
 */
export class SessionMonitor {
  private client: OpenClawSessionsClient;
  private options: SessionMonitoringOptions;
  private intervalId?: NodeJS.Timeout;
  private lastSessions: Map<string, OpenClawSession> = new Map();
  
  constructor(client: OpenClawSessionsClient, options: SessionMonitoringOptions = {}) {
    this.client = client;
    this.options = {
      intervalMs: 60000, // 1분
      ...options
    };
  }
  
  start(): void {
    if (this.intervalId) {
      this.stop();
    }
    
    this.intervalId = setInterval(async () => {
      try {
        await this.checkSessions();
      } catch (error) {
        console.error('Session monitoring error:', error);
      }
    }, this.options.intervalMs);
    
    // 초기 검사 실행
    this.checkSessions().catch(console.error);
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
  
  private async checkSessions(): Promise<void> {
    const response = await this.client.list();
    const currentSessions = new Map(response.sessions.map(s => [s.sessionId, s]));
    
    // 새로 생성된 세션 찾기
    for (const [id, session] of currentSessions) {
      if (!this.lastSessions.has(id)) {
        this.options.onSessionChange?.({
          type: 'created',
          session
        });
      } else {
        // 업데이트된 세션 찾기
        const previous = this.lastSessions.get(id)!;
        if (session.updatedAt !== previous.updatedAt) {
          this.options.onSessionChange?.({
            type: 'updated',
            session,
            previousSession: previous
          });
        }
        
        // 토큰 사용량 임계값 검사
        if (this.options.tokenThreshold && session.totalTokens) {
          if (session.totalTokens > this.options.tokenThreshold) {
            this.options.onSessionChange?.({
              type: 'tokenThreshold',
              session,
              data: {
                tokenUsage: {
                  totalTokens: session.totalTokens,
                  inputTokens: session.inputTokens,
                  outputTokens: session.outputTokens
                }
              }
            });
          }
        }
        
        // 장시간 실행 세션 검사
        if (this.options.longRunningThresholdHours) {
          const runningTimeHours = session.ageMs / (1000 * 60 * 60);
          if (runningTimeHours > this.options.longRunningThresholdHours) {
            this.options.onSessionChange?.({
              type: 'longRunning',
              session,
              data: { runningTimeHours }
            });
          }
        }
      }
    }
    
    // 삭제된 세션 찾기
    for (const [id, session] of this.lastSessions) {
      if (!currentSessions.has(id)) {
        this.options.onSessionChange?.({
          type: 'deleted',
          session
        });
      }
    }
    
    this.lastSessions = currentSessions;
  }
}

/**
 * 사용 예시
 */
export function exampleUsage(): void {
  // 클라이언트 생성
  const client = new SimpleOpenClawSessionsClient();
  
  // 세션 목록 조회
  client.list({ json: true, allAgents: true })
    .then(response => {
      console.log(`Found ${response.count} sessions`);
      
      // 활성 세션 필터링 (최근 30분)
      const activeSessions = response.sessions.filter(
        session => session.ageMs < 30 * 60 * 1000
      );
      console.log(`Active sessions (last 30min): ${activeSessions.length}`);
      
      // 토큰 사용량이 많은 세션 찾기
      const highTokenSessions = response.sessions.filter(
        session => session.totalTokens && session.totalTokens > 10000
      );
      console.log(`High token usage sessions: ${highTokenSessions.length}`);
      
      // 에이전트별 통계
      const byAgent: Record<string, number> = {};
      response.sessions.forEach(session => {
        byAgent[session.agentId] = (byAgent[session.agentId] || 0) + 1;
      });
      console.log('Sessions by agent:', byAgent);
    })
    .catch(error => {
      console.error('Error listing sessions:', error);
    });
  
  // 세션 모니터링 시작
  const monitor = new SessionMonitor(client, {
    intervalMs: 30000, // 30초
    tokenThreshold: 5000,
    longRunningThresholdHours: 24,
    onSessionChange: (event) => {
      console.log(`Session event [${event.type}]:`, {
        sessionId: event.session.sessionId,
        agentId: event.session.agentId,
        ageMs: event.session.ageMs,
        tokens: event.session.totalTokens
      });
    }
  });
  
  monitor.start();
  
  // 5분 후 모니터링 중지 예시
  setTimeout(() => {
    monitor.stop();
    console.log('Session monitoring stopped');
  }, 5 * 60 * 1000);
}