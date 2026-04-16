---
name: claude-ai-rotate
description: Claude Code AI 자동 전환 스킬. GLM-5.1 → MiniMax M2.7 → Qwen3.6 Plus 순서로 사용량 초과 시 자동 전환. 매 5시간마다 GLM-5.1 복귀 시도. 담당: simple 에이전트.
---

# Claude Code AI 자동 전환

## 개요

Claude Code의 AI 모델 사용량이 초과될 때 자동으로 다음 AI로 전환하는 스킬.

## AI 우선순위

```
1차: GLM-5.1 (Z.AI)        → 사용량 초과 시
2차: MiniMax M2.7 (MiniMax) → 사용량 초과 시
3차: Qwen3.6 Plus (OpenRouter 무료)
→ 매 5시간마다 1차(GLM-5.1) 복귀 시도
```

## 설정 파일

- Claude Code 설정: `~/.claude/settings.json`
- 상태 파일: `/home/comage/.openclaw/scripts/rotate-state.json`
- 로그 파일: `/home/comage/.openclaw/scripts/rotate.log`
- 전환 스크립트: `/home/comage/.openclaw/scripts/rotate-claude-ai.py`

## API 엔드포인트

| AI | Base URL | 모델명 |
|---|---|---|
| GLM-5.1 | `https://api.z.ai/api/coding/paas/v4` | `glm-5.1` |
| MiniMax M2.7 | `https://api.minimaxi.com/anthropic/v1` | `MiniMax-M2.7` |
| Qwen3.6 Plus | `https://openrouter.ai/api/v1` | `qwen/qwen3.6-plus:free` |

## 사용량 확인 방법

### 1. API 직접 호출 (자동)
스크립트가 자동으로 확인:
```python
# GLM-5.1
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer {ZAI_KEY}" \
  -X POST "https://api.z.ai/api/coding/paas/v4/chat/completions" \
  -d '{"model":"glm-5.1","messages":[{"role":"user","content":"hi"}],"max_tokens":1}'

# MiniMax M2.7
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer {MINIMAX_KEY}" \
  -X POST "https://api.minimaxi.com/anthropic/v1/messages" \
  -d '{"model":"MiniMax-M2.7","messages":[{"role":"user","content":"hi"}],"max_tokens":1}'
```

### 2. 웹 대시보드 (수동)
- Z.AI: https://z.ai/dashboard/usage
- MiniMax: https://platform.minimaxi.com/balance
- OpenRouter: https://openrouter.ai/balance

## 수동 전환 명령

```bash
# 스크립트 직접 실행
python3 /home/comage/.openclaw/scripts/rotate-claude-ai.py

# 상태 확인
cat /home/comage/.openclaw/scripts/rotate-state.json

# 로그 확인
tail -20 /home/comage/.openclaw/scripts/rotate.log
```

## 전환 로그 확인

```bash
tail -20 /home/comage/.openclaw/scripts/rotate.log
```

## 현재 상태 확인

```bash
cat /home/comage/.openclaw/scripts/rotate-state.json
```
