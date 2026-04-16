---
name: claude-code-troubleshoot
description: Claude Code 문제 해결 스킬. API 키 오류, 사용량 초과(429), 연결 실패, 설정 파일 오류 등 문제 발생 시 진단 및 해결. 담당: simple 에이전트.
---

# Claude Code 문제 해결

## 개요

Claude Code 사용 중 발생하는 일반적인 문제를 진단하고 해결하는 스킬.

## 일반적 오류 유형

### 1. 429 Rate Limit (사용량 초과)
**증상**: API 응답이 429
**해결**: `rotate-claude-ai.py` 스크립트 실행하여 다음 AI로 전환

```bash
python3 /home/comage/.openclaw/scripts/rotate-claude-ai.py
```

### 2. API 키 오류 (401 Unauthorized)
**증상**: 인증 실패
**확인**: `~/.claude/settings.json`의 `ANTHROPIC_AUTH_TOKEN` 확인
**해결**: 올바른 API 키로 설정 파일 업데이트

### 3. 연결 실패 (Connection Error)
**증상**: API 서버에 연결 불가
**확인**: Base URL이 정확한지 확인
**해결**: `~/.claude/settings.json`의 `ANTHROPIC_BASE_URL` 확인

### 4. 설정 파일 오류
**증상**: Claude Code가 시작 안 됨
**확인**: JSON 문법 오류
**해결**: `python3 -m json.tool ~/.claude/settings.json`으로 검증

## 설정 파일 경로

```
~/.claude/settings.json      ← Claude Code API 설정
~/.claude/settings.local.json ← 권한 설정
~/.claude.json               ← 앱 설정
/home/comage/.openclaw/openclaw.json ← OpenClaw 에이전트 설정
```

## 각 AI별 설정 템플릿

### GLM-5.1 (Z.AI)
```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "ad8a871a1f2842d09bb03d02f9585a33.hfO8VY0OuMx0OBJ8",
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

### MiniMax M2.7
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.minimaxi.com/anthropic/v1",
    "ANTHROPIC_AUTH_TOKEN": "sk-cp-S8sT-0-...",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "ANTHROPIC_MODEL": "MiniMax-M2.7"
  }
}
```

### Qwen3.6 Plus (OpenRouter)
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api/v1",
    "ANTHROPIC_AUTH_TOKEN": "sk-or-v1-...",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "ANTHROPIC_MODEL": "qwen/qwen3.6-plus:free"
  }
}
```

## CLI로 Claude Code 직접 확인

```bash
# Claude Code 버전 확인
claude --version

# Claude Code 상태
openclaw status

# 현재 AI 모델 확인
cat ~/.claude/settings.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['env'].get('ANTHROPIC_BASE_URL','?'), d['env'].get('ANTHROPIC_AUTH_TOKEN','?')[:20]+'...')"
```

## 로그 분석

```bash
# 전환 로그
tail -50 /home/comage/.openclaw/scripts/rotate.log

# OpenClaw 에이전트 로그
openclaw logs --follow
```
