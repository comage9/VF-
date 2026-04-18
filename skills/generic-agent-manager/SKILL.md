# GenericAgent 통합 관리자 스킬

## 설명
GenericAgent와 OpenClaw를 통합 관리하는 스킬입니다. GenericAgent의 자가-진화 시스템을 OpenClaw에서 제어하고 관리합니다.

## 트리거
- genericagent, generic agent, 자가진화, self-evolving
- GenericAgent 시작/중지/상태 확인
- 작업 위임 (OpenClaw → GenericAgent)
- Skill 동기화

## 담당
- 통합 관리 시스템

## 사용법

### 1. GenericAgent 시작
```bash
./manage_generic_agent.sh start
```

### 2. 상태 확인
```bash
./manage_generic_agent.sh status
```

### 3. 작업 위임
```bash
./manage_generic_agent.sh delegate "작업 설명"
```

### 4. 데이터 동기화
```bash
./manage_generic_agent.sh sync
```

### 5. 데몬 모드
```bash
./manage_generic_agent.sh daemon
```

## 파일 구조
```
~/.openclaw/workspace/
├── generic_agent_manager.py      # 통합 관리자
├── manage_generic_agent.sh       # 관리 스크립트
├── generic_agent_status.json     # 상태 파일
├── generic_agent_skills/         # 추출된 Skills
│   └── [skill-name]/
│       ├── SKILL.md
│       └── [skill-name].py
└── logs/                         # 로그 파일
    └── generic_agent_YYYYMMDD.log
```

## 통합 기능

### 1. 자동 Skill 결정화
- GenericAgent가 작업을 해결하면 실행 경로를 Skill로 자동 결정화
- 결정화된 Skill을 OpenClaw 형식으로 변환하여 저장
- OpenClaw Skill 라이브러리에 자동 통합

### 2. 데이터 동기화
- OpenClaw의 MEMORY.md, Skills, 세션 히스토리를 GenericAgent에 주입
- GenericAgent의 학습 데이터를 OpenClaw에 동기화
- 양방향 실시간 데이터 교환

### 3. 작업 위임 시스템
- 특정 작업 유형을 GenericAgent에 자동 위임
- 작업 결과를 OpenClaw에 통합
- 성능 비교 및 최적 실행자 선택

### 4. 통합 모니터링
- GenericAgent 실행 상태 실시간 모니터링
- Skill 생성 추적 및 통계
- 오류 감지 및 자동 복구

## 설정

### 1. API 키 설정
GenericAgent의 `mykey.py` 파일에 z.ai GLM-5.1 API 키 설정:
```python
native_claude_glm_config = {
    'name': 'glm-5.1',
    'apikey': 'ad8a871a1f2842d09bb03d02f9585a33.hfO8VY0OuMx0OBJ8',
    'apibase': 'https://api.z.ai/api/anthropic',
    'model': 'glm-5.1',
    'max_retries': 3,
    'connect_timeout': 10,
    'read_timeout': 180,
}
```

### 2. 백업 모델 설정 (선택사항)
```python
native_claude_config_minimax = {
    'name': 'minimax-anthropic',
    'apikey': 'sk-<your-minimax-key>',
    'apibase': 'https://api.minimaxi.com/anthropic',
    'model': 'MiniMax-M2.7',
    'max_retries': 3,
}
```

## 작업 흐름

### 일반 작업:
```
사용자 요청 → OpenClaw 분석 → OpenClaw 처리 → 결과 반환
```

### GenericAgent 위임 작업:
```
사용자 요청 → OpenClaw 분석 → 작업 유형 판별 → GenericAgent 위임
                ↓
GenericAgent 처리 → Skill 결정화 → OpenClaw Skill 라이브러리 통합
                ↓
결과 수신 → OpenClaw 통합 → 사용자 응답
```

## 모니터링 명령어

### 1. 실시간 로그
```bash
./manage_generic_agent.sh monitor
```

### 2. 생성된 Skills 확인
```bash
./manage_generic_agent.sh skills
```

### 3. 상세 상태
```bash
./manage_generic_agent.sh status
```

## 문제 해결

### 1. GenericAgent 시작 실패
- 가상 환경 확인: `cd /home/comage/GenericAgent && source .venv/bin/activate`
- 의존성 확인: `pip install streamlit pywebview`
- 포트 확인: `netstat -tlnp | grep 18503`

### 2. API 연결 실패
- API 키 확인: `mykey.py` 파일 검토
- 네트워크 연결: `curl https://api.z.ai/api/health`
- 프록시 설정: 필요한 경우 `proxy` 설정 추가

### 3. Skill 동기화 실패
- 권한 확인: `ls -la ~/.openclaw/workspace/generic_agent_skills/`
- 디스크 공간: `df -h`
- 로그 확인: `tail -f ~/.openclaw/workspace/logs/generic_agent_*.log`

## 성능 지표

### 모니터링 항목:
1. **실행 상태**: GenericAgent 실행 여부
2. **Skill 생성률**: 시간당 생성된 Skill 수
3. **작업 완료율**: 위임 작업 성공률
4. **토큰 효율성**: GenericAgent vs OpenClaw 비교
5. **응답 시간**: 작업 처리 소요 시간

### 최적화 지점:
1. **작업 분류기**: 어떤 작업을 GenericAgent에 위임할지 결정
2. **Skill 재사용**: 결정화된 Skill의 활용도
3. **데이터 동기화**: 동기화 빈도 및 데이터 양
4. **리소스 관리**: 메모리/CPU 사용량 최적화

## 보안 고려사항

### 1. 데이터 보호
- 민감 정보 암호화
- API 키 안전한 저장
- 로그 파일 접근 제한

### 2. 시스템 접근
- GenericAgent의 높은 권한 주의
- 작업 실행 전 사용자 승인
- 샌드박스 환경 고려

### 3. 네트워크 보안
- HTTPS 연결 강제
- API 호출 인증
- 불필요한 포트 노출 방지

## 향후 개선사항

### 단기 (1-2주):
- [ ] 작업 분류 알고리즘 개선
- [ ] Skill 변환 정확도 향상
- [ ] 실시간 모니터링 대시보드

### 중기 (1-2개월):
- [ ] 양방향 API 통합
- [ ] 자동 최적 실행자 선택
- [ ] 통합 로깅 시스템

### 장기 (3개월 이상):
- [ ] 완전 통합 자가-진화 시스템
- [ ] 분산 에이전트 네트워크
- [ ] 실시간 협업 기능

---

**이 스킬은 OpenClaw와 GenericAgent의 통합 관리를 담당합니다. GenericAgent의 자가-진화 능력을 활용하여 OpenClaw의 기능을 확장하고 효율성을 개선합니다.**