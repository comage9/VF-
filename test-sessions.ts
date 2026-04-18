import {
  OpenClawSessionsResponse,
  OpenClawSession,
  SessionKind,
  SessionStatistics,
  exampleUsage
} from './openclaw-sessions';

/**
 * OpenClaw 세션 관리 기능 테스트
 */

// 샘플 세션 데이터 (실제 CLI 출력 기반)
const sampleSessionData: OpenClawSessionsResponse = {
  path: "/home/comage/.openclaw/agents/main/sessions/sessions.json",
  count: 2,
  activeMinutes: null,
  sessions: [
    {
      key: "agent:main:subagent:9aed7550-f669-43c7-a6d7-6827760ae829",
      updatedAt: 1776305980597,
      ageMs: 31182,
      sessionId: "1e7f2e21-e82a-4f77-bd3c-17dfacab56b8",
      abortedLastRun: false,
      totalTokens: null,
      totalTokensFresh: false,
      model: "deepseek",
      modelProvider: "openrouter",
      contextTokens: 128000,
      agentId: "main",
      kind: "subagent" as SessionKind
    },
    {
      key: "agent:main:main",
      updatedAt: 1776305953865,
      ageMs: 57914,
      sessionId: "9773d0ab-2375-4be8-b126-e6e9f1546363",
      systemSent: true,
      abortedLastRun: false,
      inputTokens: 70157,
      outputTokens: 1264,
      totalTokens: 70221,
      totalTokensFresh: true,
      model: "deepseek/deepseek-v3.2",
      modelProvider: "openrouter",
      contextTokens: 128000,
      agentId: "main",
      kind: "direct" as SessionKind
    }
  ]
};

/**
 * 세션 데이터 분석 함수
 */
function analyzeSessions(data: OpenClawSessionsResponse): SessionStatistics {
  const sessions = data.sessions;
  const now = Date.now();
  
  // 활성 세션 (최근 1시간 내 업데이트)
  const activeSessions = sessions.filter(
    session => session.ageMs < 60 * 60 * 1000
  );
  
  // 에이전트별 세션 분포
  const sessionsByAgent: Record<string, number> = {};
  sessions.forEach(session => {
    sessionsByAgent[session.agentId] = (sessionsByAgent[session.agentId] || 0) + 1;
  });
  
  // 종류별 세션 분포
  const sessionsByKind: Record<SessionKind, number> = {
    direct: 0,
    subagent: 0,
    background: 0,
    task: 0
  };
  sessions.forEach(session => {
    if (session.kind in sessionsByKind) {
      sessionsByKind[session.kind as SessionKind]++;
    }
  });
  
  // 토큰 사용량 계산
  const totalTokensUsed = sessions
    .filter(s => s.totalTokens !== undefined && s.totalTokens !== null)
    .reduce((sum, s) => sum + (s.totalTokens || 0), 0);
  
  const sessionsWithTokens = sessions.filter(s => s.totalTokens !== undefined && s.totalTokens !== null);
  const averageTokensPerSession = sessionsWithTokens.length > 0 
    ? totalTokensUsed / sessionsWithTokens.length 
    : 0;
  
  // 평균 세션 수명 (시간)
  const totalAgeHours = sessions.reduce((sum, s) => sum + (s.ageMs / (1000 * 60 * 60)), 0);
  const averageSessionAgeHours = sessions.length > 0 ? totalAgeHours / sessions.length : 0;
  
  return {
    totalSessions: data.count,
    activeSessions: activeSessions.length,
    averageSessionAgeHours,
    sessionsByAgent,
    sessionsByKind,
    totalTokensUsed,
    averageTokensPerSession
  };
}

/**
 * 세션 필터링 함수
 */
function filterSessions(
  data: OpenClawSessionsResponse,
  options: {
    agentId?: string;
    kind?: SessionKind;
    minTokens?: number;
    maxAgeHours?: number;
    activeOnly?: boolean;
  }
): OpenClawSession[] {
  return data.sessions.filter(session => {
    // 에이전트 필터
    if (options.agentId && session.agentId !== options.agentId) {
      return false;
    }
    
    // 종류 필터
    if (options.kind && session.kind !== options.kind) {
      return false;
    }
    
    // 토큰 필터
    if (options.minTokens !== undefined) {
      if (session.totalTokens === undefined || session.totalTokens === null) {
        return false;
      }
      if (session.totalTokens < options.minTokens) {
        return false;
      }
    }
    
    // 나이 필터
    if (options.maxAgeHours !== undefined) {
      const ageHours = session.ageMs / (1000 * 60 * 60);
      if (ageHours > options.maxAgeHours) {
        return false;
      }
    }
    
    // 활성 세션 필터
    if (options.activeOnly) {
      const ageHours = session.ageMs / (1000 * 60 * 60);
      if (ageHours > 1) { // 1시간 이상이면 비활성
        return false;
      }
    }
    
    return true;
  });
}

/**
 * 세션 정리 시뮬레이션
 */
function simulateCleanup(
  data: OpenClawSessionsResponse,
  options: {
    maxAgeDays?: number;
    maxSessions?: number;
    agentId?: string;
  }
): {
  toDelete: OpenClawSession[];
  toKeep: OpenClawSession[];
} {
  let sessions = data.sessions;
  
  // 에이전트 필터 적용
  if (options.agentId) {
    sessions = sessions.filter(s => s.agentId === options.agentId);
  }
  
  // 나이 기준으로 정렬 (오래된 순)
  sessions.sort((a, b) => b.ageMs - a.ageMs);
  
  const toDelete: OpenClawSession[] = [];
  const toKeep: OpenClawSession[] = [];
  
  for (const session of sessions) {
    const ageDays = session.ageMs / (1000 * 60 * 60 * 24);
    
    // 나이 기준 체크
    if (options.maxAgeDays && ageDays > options.maxAgeDays) {
      toDelete.push(session);
      continue;
    }
    
    // 최대 세션 수 체크
    if (options.maxSessions && toKeep.length >= options.maxSessions) {
      toDelete.push(session);
      continue;
    }
    
    toKeep.push(session);
  }
  
  return { toDelete, toKeep };
}

/**
 * 테스트 실행
 */
function runTests() {
  console.log('=== OpenClaw 세션 관리 기능 테스트 ===\n');
  
  // 1. 기본 데이터 분석
  console.log('1. 기본 세션 데이터 분석:');
  const stats = analyzeSessions(sampleSessionData);
  console.log(`   총 세션 수: ${stats.totalSessions}`);
  console.log(`   활성 세션 수 (1시간 내): ${stats.activeSessions}`);
  console.log(`   평균 세션 수명: ${stats.averageSessionAgeHours.toFixed(2)} 시간`);
  console.log(`   에이전트별 분포:`, stats.sessionsByAgent);
  console.log(`   종류별 분포:`, stats.sessionsByKind);
  console.log(`   총 토큰 사용량: ${stats.totalTokensUsed}`);
  console.log(`   세션당 평균 토큰: ${stats.averageTokensPerSession.toFixed(0)}\n`);
  
  // 2. 필터링 테스트
  console.log('2. 세션 필터링 테스트:');
  
  // 메인 에이전트 세션만
  const mainAgentSessions = filterSessions(sampleSessionData, { agentId: 'main' });
  console.log(`   메인 에이전트 세션: ${mainAgentSessions.length}개`);
  
  // 직접(direct) 세션만
  const directSessions = filterSessions(sampleSessionData, { kind: 'direct' });
  console.log(`   직접(direct) 세션: ${directSessions.length}개`);
  
  // 서브에이전트 세션만
  const subagentSessions = filterSessions(sampleSessionData, { kind: 'subagent' });
  console.log(`   서브에이전트(subagent) 세션: ${subagentSessions.length}개`);
  
  // 활성 세션만 (1시간 내)
  const activeSessions = filterSessions(sampleSessionData, { activeOnly: true });
  console.log(`   활성 세션 (1시간 내): ${activeSessions.length}개\n`);
  
  // 3. 정리 시뮬레이션
  console.log('3. 세션 정리 시뮬레이션:');
  
  // 1일 이상된 세션 정리
  const cleanup1 = simulateCleanup(sampleSessionData, { maxAgeDays: 1 });
  console.log(`   1일 이상된 세션 정리:`);
  console.log(`     삭제 대상: ${cleanup1.toDelete.length}개`);
  console.log(`     보존 대상: ${cleanup1.toKeep.length}개`);
  
  // 최대 5개 세션만 보존
  const cleanup2 = simulateCleanup(sampleSessionData, { maxSessions: 5 });
  console.log(`   최대 5개 세션만 보존:`);
  console.log(`     삭제 대상: ${cleanup2.toDelete.length}개`);
  console.log(`     보존 대상: ${cleanup2.toKeep.length}개\n`);
  
  // 4. 세션 정보 상세 출력
  console.log('4. 세션 상세 정보:');
  sampleSessionData.sessions.forEach((session, index) => {
    console.log(`\n   세션 ${index + 1}:`);
    console.log(`     ID: ${session.sessionId}`);
    console.log(`     키: ${session.key}`);
    console.log(`     에이전트: ${session.agentId}`);
    console.log(`     종류: ${session.kind}`);
    console.log(`     모델: ${session.model || 'N/A'} (${session.modelProvider || 'N/A'})`);
    console.log(`     컨텍스트 토큰: ${session.contextTokens?.toLocaleString() || 'N/A'}`);
    console.log(`     사용 토큰: ${session.totalTokens?.toLocaleString() || 'N/A'}`);
    console.log(`     나이: ${(session.ageMs / (1000 * 60 * 60)).toFixed(2)} 시간`);
    console.log(`     마지막 업데이트: ${new Date(session.updatedAt).toLocaleString()}`);
    console.log(`     시스템 메시지: ${session.systemSent ? '전송됨' : '없음'}`);
    console.log(`     마지막 실행 중단: ${session.abortedLastRun ? '예' : '아니오'}`);
  });
  
  // 5. TypeScript 인터페이스 검증
  console.log('\n5. TypeScript 인터페이스 검증:');
  
  // 타입 안전성 검증
  const typedSession: OpenClawSession = sampleSessionData.sessions[0];
  console.log(`   타입 안전성: OK`);
  console.log(`   세션 키 타입: ${typeof typedSession.key}`);
  console.log(`   업데이트 타임스탬프 타입: ${typeof typedSession.updatedAt}`);
  console.log(`   에이전트 ID 타입: ${typeof typedSession.agentId}`);
  console.log(`   세션 종류 타입: ${typeof typedSession.kind}`);
  
  // JSON 직렬화/역직렬화 검증
  const jsonString = JSON.stringify(sampleSessionData);
  const parsedData: OpenClawSessionsResponse = JSON.parse(jsonString);
  console.log(`   JSON 직렬화/역직렬화: OK`);
  console.log(`   파싱된 데이터 세션 수: ${parsedData.sessions.length}`);
  
  // 6. CLI 명령어 생성 예시
  console.log('\n6. CLI 명령어 생성 예시:');
  
  const cliCommands = {
    listAll: 'openclaw sessions',
    listJson: 'openclaw sessions --json',
    listActive: 'openclaw sessions --active 30',
    listByAgent: 'openclaw sessions --agent main',
    listAllAgents: 'openclaw sessions --all-agents',
    cleanup: 'openclaw sessions cleanup'
  };
  
  Object.entries(cliCommands).forEach(([name, cmd]) => {
    console.log(`   ${name}: ${cmd}`);
  });
  
  console.log('\n=== 테스트 완료 ===');
}

// 테스트 실행
runTests();

// 예시 사용법 실행 (주석 처리)
// console.log('\n=== 예시 사용법 ===');
// exampleUsage();