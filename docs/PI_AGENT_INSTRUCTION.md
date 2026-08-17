# pi 에이전트 지시문 (권역지 인쇄 + 지식 공유)

작성: Hermes (2026-08-12)
대상: pi coding agent
목적: 권역지 인쇄 작업의 정확한 실행법과, 지식/스킬 공유 계획 문서 검토 지시

---

## 1. 권역지 인쇄 — 정확한 실행법

"권역지 <권역> <N>장" 요청이 오면 **절대 위키/문서 페이지로 오해하지 말 것**. 이건 실제 프린터 출력 작업이다.

### 1-1. 인식 (권역 약어 ↔ 파일명)

| 약어/호칭 | 파일명 (E:\자주쓰는 문서\권역지\) |
|-----------|----------------------------------|
| d / dgu | DGU.pdf |
| e / east / 이스트 | EAST.pdf |
| g / gmh | GMH.pdf |
| j / gwj | GWJ.pdf |
| m / middle / 미들 | Middle.pdf |
| w / west / 웨스트 | WEST.pdf |
| hf / 해피 / happy | 해피프렌즈 설명서.ai |

**모든 파일은 이미 존재한다** (WEST.pdf 포함, 35,624 bytes). "없다"고 말하지 말 것.

### 1-2. 실행 명령

```bash
# 웨스트 1장
cd /c/Users/kis/AppData/Local/hermes/skills/automation/gwon-yeokji/scripts
python print_region.py w 1
```

- **인터프리터**: 반드시 `python`(3.11, pywin32 포함). `python3`(3.14)에는 win32print가 없어 실패한다.
- **경로**: git-bash(MSYS)에서 `C:/...` 인자를 그대로 주면 `E:\c\Users\...`로 잘못 변환될 수 있다. `cd` 후 상대경로(`print_region.py`)로 실행하거나 스크립트의 절대경로를 사용.
- **사전 확인**: `--dry-run` 옵션으로 매수/파일 검증 후 실행:
  ```bash
  python print_region.py --dry-run w 1   # "인쇄 예정: WEST.pdf → 1장" 확인
  ```
- **프린터**: 스크립트가 Canon G2010 series로 자동 교정한다. (기본 프린터는 ZDesigner ZM600 라벨 프린터 — 교정 안 하면 깨진 출력)
- **보고**: "스풀러 전송 완료 → 출력물 확인 부탁드립니다"라고 보고. "인쇄 완료"로 단정 금지.

### 1-3. 금지 사항

- ❌ llm-wiki/위키/문서 출력으로 해석
- ❌ "파일이 없다"고 답하기 전에 `ls "/e/자주쓰는 문서/권역지/"` 실행해서 실제 확인
- ❌ python3(3.14)로 실행
- ❌ 파일 생성/추가를 제안 (이미 존재)

---

## 2. 지식/스킬 공유 계획 — Hermes 검토 반영 사항

Hermes가 `E:\coding\VF-new\docs\AGENT_KNOWLEDGE_SHARING_PLAN.md`를 검토·수정했다.
이미 반영된 내용이므로 새 작업은 없고, 아래 사실만 숙지하라.

1. **위키 SSOT**: Hermes의 실무 위키는 `E:\hermes-backup\obsidian\06-Wiki-시스템\Wiki-okf` (vault_gate.py가 결정). `hermes\wiki\workspace-wiki`는 보조.
2. **메모리 구조**: Hermes는 3-tier(MEMORY.md + USER.md 자동 주입 + fact_store DB). 단일 파일 대체 불가 → 공유는 pi가 systemPrompt로 읽는 (A) 주입 방식 권장.
3. **읽기 전용은 관례**: "Hermes 스킬만 수정"은 시스템 강제가 아니라 운영 규칙. pi는 Hermes 스킬 디렉토리(`C:/Users/kis/AppData/Local/hermes/skills`)를 수정하지 말 것.
4. **설정 최신 상태**: pi settings.json은 현재 `defaultProvider: omniroute`, `defaultModel: auto/best-free` (OmniRoute 사용 중).
5. **스킬 공유 방법**: pi `~/.pi/agent/settings.json`에 `"skills": ["C:/Users/kis/AppData/Local/hermes/skills"]` 추가하면 Hermes 스킬 80개+를 로드 가능 (pi 공식 문서 "Using Skills from Other Harnesses" 지원).

---

## 3. 추가 지시

- 이 문서를 읽은 후 "확인했습니다" 한 줄로 답하고, 추가 질문 없이 종료하라.
- 권역지 인쇄 요청이 오면 §1의 명령을 그대로 실행하라.