# 도구 폴더 분리/삭제 기준 (3차 정리)

기준일: 2026-07-10

## 판정 기준

| 판정 | 조건 |
|------|------|
| **삭제** | (1) 앱 import/런타임 경로 아님 (2) 자체 `.git` 을 가진 외부 클론 이거나 (3) 세션/캐시/로그 산출물 (4) 비어 있거나 heartbeat만 존재 |
| **유지** | 앱 의존성, `.claude/skills` 문서, 프론트 `package.json` 의 playwright |
| **재설치** | 삭제해도 `npm i -g` / `npx` 로 복구 가능 |

## 적용 결과

| 경로 | 판정 | 이유 |
|------|------|------|
| `playwright-cli/` | **삭제** | 외부 패키지 클론(자체 `.git`+node_modules). 앱 미참조. 스킬은 `npx`/`npm i -g @playwright/cli` 안내 |
| `.playwright/`, `.playwright-cli/`, `.playwright-mcp/` | **삭제** | CLI 세션 스냅샷·로그·스크린샷 |
| `opencode-telegram-bot/` | **삭제** | VF 앱과 무관한 별도 봇 레포(자체 `.git`) |
| `antigravity-telegram-suite/` | **삭제** | heartbeat만 존재 |
| `.antigravitycli/` | **삭제** | CLI 세션 상태 |
| `.codegraph/` 런타임 | **삭제** | codegraph 데몬 캐시/로그 |
| `.claude/skills/playwright-cli/` | **유지** | 에이전트 스킬 문서 |
| `frontend` 의 `playwright` / `@playwright/test` | **유지** | E2E 의존성 |
| `test-vf-outbound*.spec.ts` | **이동** | `tests/e2e/` 로 정리 |

## 재설치 (필요 시)

```bash
# Playwright CLI (에이전트 브라우저 자동화)
npm install -g @playwright/cli@latest

# 프론트 E2E
cd frontend/client && npx playwright install
```

## 유지하지 않은 이유 요약

모노레포 루트에 **제3자 git 클론 + node_modules** 를 두면  
용량·커밋 오염·경로 혼선이 커진다. VF 코어는 `backend/` + `frontend/` 만으로 충분하다.
