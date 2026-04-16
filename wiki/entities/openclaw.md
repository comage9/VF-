# OpenClaw 설정

## 기본 정보
- **런타임:** agent=main
- **호스트:** comage-IdeaPad-Gaming-3-15IHU6
- **OS:** Linux 7.0.0-13-generic (x64)
- **Node:** v22.22.2
- **채널:** Telegram (direct)

## 현재 모델 구성
- **기본 모델:** zai/glm-5.1
- **이미지 모델:** (설정 필요)
- **생각 모델:** low

## 모델 별칭
| 별칭 | 실제 모델 |
|------|----------|
| GLM | zai/glm-4.7 |
| Grok-4.1-Fast | x-ai/grok-4.1-fast |
| Gemma-4-26B-Free | openrouter/google/gemma-4-26b-a4b:free |
| Nemotron-Free | openrouter/nvidia/nemotron-3-nano-30b-a3b:free |
| Qwen-Free | openrouter/qwen/qwen3.6-plus:free |

## 스킬 목록
- vf-production: 생산 계획 관리
- claude-ai-rotate: AI 자동 전환
- claude-code-troubleshoot: Claude Code 문제 해결
- code-agent: 코딩 작업 위임
- research-agent: 웹검색/정보수집

## 디렉토리
- **워크스페이스:** `/home/comage/.openclaw/workspace/`
- **문서:** `/home/comage/.npm-global/lib/node_modules/openclaw/docs`
- **설정:** `~/.claude/settings.json` (Claude Code)

---
*Source: MEMORY.md → wiki/entities/ 분리 (2026-04-13)*
