# Wiki unindexed_files.txt 3개 의도 (2026-06-06)

## 개요

`unindexed_files.txt` (3 entries):
```
concepts/index.md
entities/index.md
index.md
```

Windows 옵시디언 색인 시스템의 **메타 색인** (Windows `update-index.sh`가 의도적으로 미색인 처리).

## 의도 설명

### 1. `concepts/index.md`
- **용도**: Wiki 핵심 개념(concept) 색인 페이지
- **현황**: master에 디렉토리 자체 부재 (Windows 옵시디언 미사용)
- **조치**: 방치 (의도된 미색인)

### 2. `entities/index.md`
- **용도**: Wiki 핵심 엔티티(entity) 색인 페이지
- **현황**: master에 디렉토리 자체 부재
- **조치**: 방치 (의도된 미색인)

### 3. `index.md` (root)
- **용도**: Wiki root 색인
- **현황**: ✅ `index.md` **존재** (`update-index.sh`가 자동 갱신, 1,185 파일)
- **조치**: 방치 (의도된 미색인 — root index는 다른 카테고리에 포함)

## Windows ↔ Linux 차이

| 시스템 | 색인 파일 | 메타 디렉토리 |
|--------|----------|--------------|
| **Windows 옵시디언** | `index.md` (auto) | `concepts/`, `entities/` (color 개념) |
| **Linux (현재)** | `index.md` (auto, `update-index.sh`) | 없음 (root만) |

## 결론

`unindexed_files.txt` 3개는 **모두 의도된 미색인**:
- 2개 (`concepts/index.md`, `entities/index.md`): Windows 옵시디언 메타, Linux에서 부재
- 1개 (`index.md`): root 색인, 다른 카테고리에 이미 포함

**다음 에이전트 작업 시**: "unindexed_files.txt에 3개 있다 → 신규 색인 추가 필요" 같은 작업 **불필요**.

## 작업자

- Linux Hermes (M3) — 6/6 unindexed_files.txt 조사
- 검증 시각: 2026-06-06 12:13
