# NotebookLM 분석 보고서 - 노트북 2: Architecting the Harness

> **노트북 ID**: 88499e2b-6efd-4960-b4b2-5d58452bf984
> **노트북명**: Architecting the Harness: Autonomous Agents and Knowledge Systems
> **소스 수**: 34개
> **분석일**: 2026-04-22 21:35

---

## 📊 개요

이 노트북은 AI 에이전트 아키텍처와 지식 시스템에 대한 학습 자료 및 참고 문서를 담고 있습니다. Andrej Karpathy의 LLM Wiki 개념부터 시작하여, 다양한 AI/ML 관련 논문, 도구, 그리고 기술 문서를 포함하고 있습니다.

---

## 📁 주제별 분류

### 1. LLM Wiki 아키텍처 (8개 소스)

| 소스명 | 중요도 | 상태 |
|--------|--------|------|
| llm-wiki (Karpathy Gist) | 매우 높음 | ✅ 참고 완료 |
| sage-wiki (GitHub) | 높음 | ✅ 참고 완료 |
| LLM Wiki 아키텍처 설명 | 높음 | ✅ 참고 완료 |
| LLM Wiki 운영 루프 설계 | 높음 | ✅ 참고 완료 |
| LLM Wiki 3계층 구조 | 높음 | ✅ 참고 완료 |

**핵심 내용:**
- 3계층 구조: Raw Sources → Wiki → Schema
- Ingest/Query/Lint 운영 루프
- 지식 누적 및 자동 업데이트
- Obsidian 연동

---

### 2. RAG (Retrieval-Augmented Generation) (6개 소스)

| 소스명 | 중요도 | 상태 |
|--------|--------|------|
| RAG - Wikipedia | 중간 | ✅ 참고 완료 |
| RAG key stages | 중간 | ✅ 참고 완료 |
| RAG 개선 방법론 | 중간 | ✅ 참고 완료 |
| WikiChat (GitHub) | 중간 | ✅ 참고 완료 |

**핵심 내용:**
- 외부 문서 검색 + LLM 생성 결합
- Vector DB, Embedding, Chunking
- 환각 감소 효과

---

### 3. AI 에이전트/도구 (10개 소스)

| 소스명 | 중요도 | 상태 |
|--------|--------|------|
| MCP Tools (LLM Wiki) | 높음 | ✅ 참고 완료 |
| LangChain/Create Agent | 중간 | ⚠️ 구버전 (LangChain Classic 2026년 12월 지원 종료) |
| Large Language Models 개론 | 중간 | ✅ 참고 완료 |
| Transformer/Decoding | 중간 | ✅ 참고 완료 |

**핵심 내용:**
- MCP (Model Context Protocol): AI 에이전트 도구 통합 표준
- LangChain Classic → LangGraph 전환 권장
- LLM 기본 원리: 다음 토큰 예측, 자동 회귀 생성

---

### 4. 기술 문서/논문 (10개 소스)

| 소스명 | 중요도 | 상태 |
|--------|--------|------|
| Semantic Wiki + LLM 논문 | 중간 | ✅ 참고 완료 |
| Fine-Tuning OpenAI Models | 낮음 | ✅ 참고 완료 |
| 에드워드 Y. 창 (위키백과) | 낮음 | ✅ 참고 완료 |
| WikiChat 논문 | 중간 | ✅ 참고 완료 |

---

## 🗑️ 중복/구버전 소스 식별

### 구버전 소스

| 파일명 | 설명 |
|--------|------|
| LangChain Create React Agent | LangChain Classic 기반, 2026년 12월 지원 종료 예정 |
| RAG - Wikipedia (영어/한국어) | 내용 중복, 한국어 버전으로 충분 |

### 노이즈 소스

| 파일명 | 설명 |
|--------|------|
| Cloudflare 보안 확인 페이지 | 실제 콘텐츠 없음 (403/보안 차단) |
| Vercel Security Checkpoint | 실제 콘텐츠 없음 |
| ChemRxiv 로그인 페이지 | 실제 콘텐츠 없음 |
| Hindi 영상 자막 | 관련성 낮음, 노이즈 |

---

## 🚨 다음 단계 추천

1. **즉시**: 노이즈 소스 4개 삭제 (Cloudflare, Vercel, ChemRxiv, Hindi)
2. **이번 주**: LangChain 구버전 소스 아카이브 처리
3. **차주**: RAG 중복 소스 정리 (영어/한국어 중 하나만 유지)

---

## 💡 학습 포인트

1. **LLM Wiki 패턴**: 현재 옵시디언 시스템에 성공적으로 적용 중
2. **MCP 통합**: NotebookLM MCP CLI가 OpenCode에 설정됨
3. **RAG 한계**: 환각 감소에도 불구하고, 지식 한계 인식 문제 존재
4. **미래 전망**: LangChain Classic → LangGraph 전환 필요

---

*분석 완료: 2026-04-22 21:35*
