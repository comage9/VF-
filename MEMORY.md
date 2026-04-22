# VF 프로젝트 - 생산 계획 페이지 모바일 UI 개선 프로젝트

## 📅 프로젝트 타임라인
- **시작일**: 2026-04-15
- **최근 업데이트**: 2026-04-22
- **상태**: 일시 중단 (사용자 지시)

## 🤖 AI 모델 상태
- **기본 모델**: `openrouter/nvidia/nemotron-3-super-120b-a12b:free`
- **폴백**: Kimi K2.5 Free, Qwen Flash Free, MiniMax M2.5 Free, DeepSeek Chat
- **API 키**: `sk-or-v1-c28ac0...f1` (무료 모델만 사용)
- **모든 에이전트 무료 전환 완료** (2026-04-21)

## 🔗 코딩 에이전트
- **OpenCoder**: v1.4.7, 무료 모델만 사용
- **oh-my-openagent.json**: 모든 에이전트 `:free` 적용 완료

## 📋 완료된 작업

### VF 프로젝트 ✅
1. 출고 페이지 오류 수정 (`configStatus is not defined`)
2. CORS 프록시 문제 해결
3. React 속성 오류 수정
4. 빌드 오류 수정
5. 출고 페이지 Google Sheets 연동 복원
6. Windows 서버 배포 준비

### 키 프로젝트 ✅
1. 자동 완료 체크 시스템 구현
2. 보고 시스템 구축
3. AI 매매 시스템 기반 구축

### 옵시디언 llm-wiki ✅
1. **3차 정리 완료** (2026-04-21/22): 340 → 106개 파일
2. **GitHub 브랜치 통일**: `master` 단일 브랜치
3. **폴더 구조 정리**: 루트 파일 28개 → index.md 1개만
4. **Windows-Linux 동기화**: Obsidian Git 플러그인 연동 완료
5. **NotebookLM 연동**: 106개 파일 업로드, 일일/주간 분석 체계 구축

### 시스템 ✅
1. OpenCoder 무료 모델 전환
2. NotebookLM MCP CLI 설치 및 인증
3. TOOLS.md에 NotebookLM 활용 규칙 추가
4. 모든 에이전트 무료 모델 확인 완료

## 📊 데이터 소스
- **Windows 서버**: bonohouse.p-e.kr:5174
- **API 엔드포인트**: /api/production, /api/master/specs
- **Google Sheets**: 출고 데이터 연동

## 🔗 주요 저장소
- **VF 프로젝트**: https://github.com/comage9/VF-.git
- **옵시디언 Vault**: https://github.com/comage9/obsidian-vault (master)

## 📓 NotebookLM
- **노트북**: 옵시디언-지식베이스-2026-v2
- **ID**: `461665a7-ed90-4307-8649-650fc6ac3e34`
- **소스**: 106개
- **활용 규칙**: TOOLS.md 참조

## 📞 문제 해결
- **OpenCoder**: `~/.opencode/bin/opencode --version`
- **VF 빌드**: `cd /home/comage/coding/VF/frontend/client && npm run build`
- **NotebookLM**: `nlm notebook query <ID> "<질문>"`

---
*최종 업데이트: 2026-04-22 03:45*
