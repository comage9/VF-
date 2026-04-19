# VF 프로젝트 - 생산 계획 페이지 모바일 UI 개선 프로젝트

## 📅 프로젝트 타임라인
- **시작일**: 2026-04-15
- **최근 업데이트**: 2026-04-19
- **상태**: 일시 중단 (사용자 지시)

## 🤖 AI 모델 상태
- **기본 모델**: `openrouter/nvidia/nemotron-3-super-120b-a12b:free` (NVIDIA Nemotron-3 Super 120B A12B - Free)
- **폴백 1**: `openrouter/moonshotai/kimi-k2.5` (Moonshot Kimi K2.5)
- **폴백 2**: `openrouter/openrouter/elephant-alpha` (Elephant Alpha)
- **폴백 3**: `openrouter/qwen/qwen3.5-flash-02-23` (Qwen 3.5 Flash)
- **폴백 4**: `openrouter/minimax/minimax-m2.5:free` (MiniMax M2.5 Free)
- **폴백 5**: `deepseek/deepseek-chat` (DeepSeek Chat)
- **API 키 설정**: OpenRouter, DeepSeek 완료

## 🔗 Claude Code 연결 상태
- **상태**: OpenCoder로 전환 완료
- **OpenCoder 버전**: 1.4.7
- **모델**: openai/gpt-oss-120b:free (OpenRouter 무료)
- **연결 방법**: `~/.opencode/bin/opencode run "작업 지시"`

## 📋 완료된 작업

### 1. VF 프로젝트 출고 페이지 오류 수정 (2026-04-18) ✅
**문제**: `configStatus is not defined` - 흰화면 현상
**솔루션**: `outboundConfig.ts` 의 `checkOutboundConfigStatus()` import 추가
**Git 커밋**: `d6ab8c4` - fix: configStatus 참조 오류 수정
**출력**: outbound 페이지 정상 작동

### 2. Git 동기화 완료 (2026-04-18) ✅
- **GitHub 토큰**: `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`
- **저장소**: `https://github.com/comage9/VF-.git`
- **업로드된 커밋**:
  - `d6ab8c4` - outbound 페이지 오류 수정
  - `cc05cf2` - getMachineAccent TDZ 에러 수정
  - `c1a29e4` - docs 및 불필요 파일 정리
  - `9fa0129` - 불필요한 프론트엔드 파일 정리

### 3. 옵시디언 파일 정리 완료 (2026-04-18) ✅
**정리 완료**: 22 개 날짜 파일 재정리
**생성된 파일**:
- 2026-04-06 ~ 2026-04-15 일일 메모 파일 (내용 추가 완료)
- 자동 정리 스크립트 2 개
- 옵시디언 템플릿 1 개

### 4. 긴급 문제 해결 (2026-04-17 ~ 2026-04-19)
#### ✅ VF 프로젝트
1. **CORS 프록시 문제 해결**: 3001 포트 제거, 백엔드 API(5176) 사용
2. **React 속성 오류 수정**: `jsx="true"` boolean 오류 해결
3. **빌드 오류 수정**: 구문 오류 수정, 빌드 성공 확인
4. **GitHub 백업본 방식 복원**: Google Sheets 연동 최적화
5. **/outbound 페이지 문제 해결 시도** (2026-04-19):
   - 문제 진단: Google Sheets API HTML 반환
   - 임시 해결: 테스트 데이터 모드 구현
   - Git 백업 복원: `8db6f10` 커밋 버전으로 되돌림
   - 제약 사항: Ubuntu 26.04 Playwright 미지원

#### ✅ 키 프로젝트
1. **자동 완료 체크 시스템 구현**: 실시간 모니터링 시스템
2. **보고 시스템 개선**: 자동 완료 감지, 상태 대시보드
3. **테스트 완료**: 시스템 정상 작동 확인

### 5. 시스템 개선
1. **OpenCoder 설치 및 설정**: OpenRouter 무료 모델 연동
2. **자동 알림 시스템**: 보고 파일 시스템 구현
3. **실시간 모니터링**: 10 초 간격 상태 확인
4. **명령어 체계 정립**: 사용자 친화적 명령어 시스템

### 6. 문서화
1. **옵시디언 동기화**: 모든 작업 기록 저장
2. **메모리 시스템 업데이트**: 체계적 정보 관리
3. **Git 백업**: 모든 변경사항 버전 관리

## 🗂️ 생성된 파일 구조
```
workspace/
├── 컴포넌트/ (VF 프로젝트)
├── 유틸리티/ (VF 프로젝트)
├── 데이터/ (VF 프로젝트)
├── 문서/ (모든 프로젝트)
├── 메모리/ (시스템 메모리)
│   ├── index.md (메모리 시스템 인덱스) ✅
│   └── 2026-04-*.md (일일 기록)
└── ki-ai-trader/ (키 프로젝트)
    ├── reports/ (보고 시스템)
    ├── src/ (AI 매매 시스템)
    ├── scripts/ (실행 스크립트)
    └── *.sh (명령어 스크립트)
```

## 🎯 구현된 핵심 기능
1. **VF 프로젝트**: 출고 현황 페이지 Google Sheets 연동 복원
2. **키 프로젝트**: AI 매매 시스템 기반 구축
3. **시스템**: 자동 완료 체크 및 실시간 모니터링

## 📊 데이터 소스
- **Windows 서버**: bonohouse.p-e.kr:5174
- **API 엔드포인트**: /api/production, /api/master/specs
- **Google Sheets**: 출고 데이터 연동

## 🔄 현재 진행 중
1. **VF 프로젝트 서버 테스트** - 출고 현황 페이지 확인 (일시 중단)
2. **Git 동기화** - Windows 서버 배포 준비
3. **옵시디언 인덱스 관리** - MEMORY.md 업데이트 (완료)
4. **메모리 시스템 업데이트** - 2026-04-19 작업 기록 저장 (완료)

## ⚠️ 주의사항
- OpenCoder 작업 시 20 분 타임아웃 설정 권장
- 모니터링 시스템은 백그라운드 실행 유지
- 모든 작업은 보고 시스템 통해 추적
- **메모리 시스템**: MEMORY.md 파일이 모든 작업 기록의 핵심 인덱스 역할

## 🚀 사용 가능한 명령어 시스템

### OpenCoder 작업 실행
```bash
./run_opencode_with_report.sh "작업 설명"
```

### 상태 확인
```bash
./check_opencode_status.sh      # 전체 상태 확인
./check_opencode_reports.sh     # 보고서 확인
```

### 모니터링 관리
```bash
./opencode_monitor.sh start     # 모니터링 시작
./opencode_monitor.sh stop      # 모니터링 중지
```

### VF 프로젝트
```bash
cd /home/comage/coding/VF/frontend/client
npm run build                   # 빌드 테스트
npm run dev                     # 개발 서버 실행
```

## 📚 옵시디언 llm-wiki 시스템 구축 (2026-04-18)

### ✅ 완료된 작업
1. **옵시디언 저장소 동기화**: `obsidian-vault` GitHub 저장소 구축
2. **llm-wiki 패턴 구현**: Andrej Karpathy의 llm-wiki 패턴 적용
3. **인덱스 시스템 구축**: 162개 파일 중 82개 연결 (50.6% 연결률)
4. **체계적 카테고리화**:
   - 일일 기록 (13개)
   - 엔티티 (9개)
   - 개념 (8개)
   - VF 프로젝트 상세 (21개)
   - 시스템 파일 (6개)
5. **Windows-Linux 동기화**: 양방향 Git 동기화 체계 구축

### 🎯 목표 설정 (사용자 지시)
1. **연결률 100% 목표**: 남은 80개 파일 점진적 인덱스 추가
2. **정기적인 인덱스 유지보수**: 주기적인 인덱스 업데이트 시스템
3. **옵시디언 인덱스 활용**: 모든 작업에서 옵시디언 인덱스 참조

### 🔄 작업 원칙
- **llm-wiki 핵심**: "위키는 지속적이고 복리적인 산물이다. LLM이 모든 것을 작성하고 유지한다."
- **인덱스 중심 작업**: 모든 파일은 인덱스에 연결되어야 접근 가능
- **점진적 개선**: 연결률을 단계적으로 100%까지 향상

### 📊 현재 통계
- **전체 파일**: 162개 (마크다운 기준)
- **연결된 파일**: 82개
- **연결률**: 50.6%
- **저장소**: https://github.com/comage9/obsidian-vault
- **최근 커밋**: `d549ea9` - 인덱스 확장

### 🔧 유지보수 시스템
1. **주간 인덱스 검토**: 매주 월요일 인덱스 점검
2. **신규 파일 자동 인덱싱**: 새 파일 생성 시 즉시 인덱스 연결
3. **연결률 모니터링**: 정기적 연결률 추적 및 보고
4. **옵시디언 그래프 활용**: 시각적 연결 관계 확인

## 📞 문제 해결
- **OpenCoder 연결 문제**: `~/.opencode/bin/opencode --version` 확인
- **보고 시스템 문제**: `./check_opencode_status.sh` 실행
- **빌드 오류**: `npm run build` 로그 확인

## 📝 메모리 시스템 가이드

### 인덱스 파일 활용
1. **MEMORY.md**: 주요 프로젝트 및 작업 기록 (이 파일)
2. **memory/index.md**: 모든 메모리 파일 인덱스
3. **memory/2026-04-*.md**: 일일 세션 기록

### 메모리 관리 원칙
- **일일 기록**: 매일 끝에 요약 기록
- **주요 결정**: MEMORY.md 에 즉시 기록
- **인덱스 업데이트**: 모든 새로운 메모리 추가 시 인덱스 업데이트
- **Git 백업**: 정기적으로 Git 에 푸시

### 메모리 검색 방법
```bash
# MEMORY.md 검색
grep -r "키워드" ~/.openclaw/workspace/MEMORY.md

# 메모리 디렉토리 검색
grep -r "키워드" ~/.openclaw/workspace/memory/

# 옵시디언 검색
Ctrl+P (옵시디언 명령 팔레트)
```

---
*이 문서는 자동 업데이트되며, 주요 변경사항이 있을 때마다 갱신됩니다.*
*최종 업데이트: 2026 년 4 월 19 일 04:45*