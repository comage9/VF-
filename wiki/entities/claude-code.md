# Claude Code 설정

## 현재 설정
- **버전:** 2.1.100
- **설정 파일:** `~/.claude/settings.json`
- **API:** Z.AI (GLM-4.7)
- **Base URL:** `https://api.z.ai/api/anthropic`

## 실행 방법
```bash
# 포그라운드
claude --permission-mode bypassPermissions --print '작업 내용'

# 백그라운드
claude --permission-mode bypassPermissions --print '작업 내용' &
```

## 모델 매핑 (Z.AI)
- `ANTHROPIC_DEFAULT_OPUS_MODEL`: GLM-4.7
- `ANTHROPIC_DEFAULT_SONNET_MODEL`: GLM-4.7
- `ANTHROPIC_DEFAULT_HAIKU_MODEL`: GLM-4.5-Air

## 이전 이력
- OpenRouter 무료 모델 (qwen/qwen3.6-plus:free) → 접근 불가로 실패
- Z.AI API로 변경 후 정상 작동

## 주의사항
- `--print` 모드 필수 (대화형 모드는 PTY 필요)
- `--permission-mode bypassPermissions` 필요
- PTY 사용하지 않음 (Claude Code는 --print로 충분)
- 실행 디렉토리: `~/clawd` 절대 사용 금지

---
*Source: 작업 기록 (2026-04-13)*
