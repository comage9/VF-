# 하네스 엔지니어링

## 정의
AI 에이전트가 안정적이고 예측 가능하게 작동하도록 모델 주변의 환경, 제약 조건, 피드백 루프, 도구 등을 설계하는 기술.

**핵심 공식:** 모델 + 하네스 = 에이전트

## CIVC 4대 원칙
1. **C - 제약 (Constrain):** 아키텍처 경계, 보안 정책, 린터로 사전 차단
2. **I - 정보 제공 (Inform):** 컨텍스트 엔지니어링, 최적의 맥락 주입
3. **V - 검증 (Verify):** PreCompletionChecklist, 결과 점검 강제
4. **C - 교정 (Correct):** 둠 루프 탐지, 2회 규칙, 접근 방식 재고

## 추론 샌드위치
- **Planning (xHigh):** 문제 분석 + 계획 수립에 최대 추론
- **Implementation (Medium):** 코드 작성은 효율성 중심
- **Verification (xHigh):** 검증에 다시 최대 추론

## 뇌/손/세션 분리
- **뇌 (Brain):** LLM/컨트롤러 (OpenClaw)
- **손 (Hands):** 샌드박스 실행 (Claude Code)
- **세션 (Session):** 영구 지식 그래프 (wiki/)

## 참고 자료
- Anthropic: Managed Agents (뇌/손 분리)
- Meta + UBC: HyperAgents (자기 개선)
- Sakana AI: DGM (진화론 기반 자기 개선)
- Karpathy: LLM Wiki (지식 컴파일)

---
*Source: 엔터프라이즈 에이전트 하네스 엔지니어링 표준 설계서 (2026-04-13)*
