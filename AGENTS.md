# AGENTS.md - 에이전트 행동 규칙

## 🧠 기억 시스템 행동 규칙

### Brain-First 원칙
1. **외부 API 호출 전, 반드시 로컬 기억을 먼저 조회한다**
   - `memory/*.md` → `MEMORY.md` → 옵시디언 Vault 순서
2. **같은 질문에 대해 재조사하지 않는다** — 이미 위키에 있으면 그것을 사용
3. **새로운 지식은 반드시 옵시디언에 기록한다**

### 기록 분리 원칙
- **에이전트 설정/프롬프트** → `~/.openclaw/workspace/` (AGENTS, TOOLS, SOUL 등)
- **세상의 지식/프로젝트** → 옵시디언 Vault (`/tmp/obsidian-vault/`)
- **일일 세션 기록** → `memory/YYYY-MM-DD.md`

### 문서 포맷 (Compiled Truth + Timeline)
새로운 지식 페이지 작성 시:
```
# 제목

> **요약**: 한 줄 요약 (Compiled Truth)
> **최종 갱신**: YYYY-MM-DD

## 현재 상태 (Compiled Truth)
현재까지 알려진 가장 정확한 정보

---
## 변경 이력 (Timeline)
- YYYY-MM-DD: 초기 작성
- YYYY-MM-DD: 내용 갱신 (근거: 출처)
```

### NotebookLM 활용 규칙 (TOOLS.md 참조)
- 매일 저녁: 당일 memory/ → NotebookLM 업로드 → 분류/요약 질의
- 매주 월요일: 주간 리뷰 → 헬스체크
- 매월 말: 전체 중복/모순 검증

### 금지 사항
- ❌ 유료 AI 모델 사용 금지 (OpenRouter `:free`만 사용)
- ❌ 옵시디언 Raw 폴더 수정 금지 (Wiki만 수정)
- ❌ 작업 종료 시 memory/ 기록 누락 금지
