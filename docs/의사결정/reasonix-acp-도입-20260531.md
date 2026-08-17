---
title: Reasonix ACP 도입 — Codex CLI 대체
date: 2026-05-31
category: 의사결정
tags: [reasonix, deepseek, acp, 코딩에이전트, codex대체]
---

# Reasonix ACP 도입 결정

## 배경
- 기존 Codex CLI(OpenRouter 경유, Responses API)에서 **DeepSeek 네이티브 Reasonix ACP**로 전환
- Reasonix는 DeepSeek prefix-cache에 최적화되어 캐시 히트율 92~99%, 비용 $0.000023~$0.000207/task
- ACP(Agent Client Protocol)로 Hermes와 완전 연동 가능

## 설치
- `npm install -g reasonix` → 0.53.2
- API 키: DeepSeek 네이티브 (`sk-66350...`)
- 경로: `~/.npm-global/bin/reasonix`
- 헬스 체크: `reasonix doctor` (7/7 pass)

## 사용법
```python
delegate_task(
    goal="작업 설명",
    acp_command="reasonix",
    acp_args=["acp", "--dir", "/path", "--model", "deepseek-v4-flash", "--yolo"],
    context="컨텍스트",
    toolsets=["terminal", "file"]
)
```

## 주의사항
1. `--dir` 디렉토리 사전 생성 필수
2. `--yolo` 플래그 필수 (non-interactive)
3. `DEEPSEEK_API_KEY` env var 필수
4. OpenRouter 키 불가 — DeepSeek 네이티브 전용
5. `reasonix run`은 파일 조작 불가 (ACP만 가능)
6. Codex CLI는 더 이상 사용 안 함
