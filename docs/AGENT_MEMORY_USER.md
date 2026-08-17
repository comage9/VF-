VF-new departure: VehicleOrderService 단일진입점. PDF={plate}_{date}.pdf, 봉인씰=plate+date.
§
LS 곰너이형식: `{HUB} {톤수} {시간} {호차}차` + "배차요청드립니다". KPP=스킬 스크립트(wpps_register_2_3.py) 우선 사용, 직접 CDP 스크립트 신규 작성 금지.
§
교정 5규칙: ①답만 ②진행/네1회=확정 ③중복질문X ④사실만 ⑤헛소리X. 욕설=즉시중단+검증.
§
**단순성 우선:** 기존 스킬/API 우회 고집 ❌. 이미 있는 웹 UI 버튼이 있으면 그걸 클릭. 복잡한 재구현 금지. D7(Simple)="단순한 게 먼저". "하지 마/벌써 작업했어"=즉시 중단.
§
데이터 일관성: 매핑(금형번호→제품명 등)은 모든 시스템 자동반영. 금형번호=제품 unique ID. 한글/영문 병기. DB 직접조회 우선, 추측 금지.
§
비용 의식: 비싼 모델=복잡작업만. 저가모델+Runbook 선호. 새 세션 시 온보딩 문구 붙이면 인식률↑.
§
VF-new 즉시실행 선호: 출차/재고/생산 지시는 VF MCP(mcp__vf_*) 우선. 우회(import server.py)·브라우저 탐색 지양. 만든 도구 미사용에 민감.
§
주력: Hermes+Codex+Grok. 유튜브(한국 LLM코딩)=요약+우리환경 적용검토. 같은주제 후속링크=이전대비 변경점만(중복풀재보고X). AI도구평가=OmniRoute호환·추가결제0 우선·공식BYOK/base_url 여부.
§
유료 API: Alibaba(Qwen), Groq(xAI), DeepSeek 유료 사용. Groq 거의 소진. OmniRoute 사용량은 http://localhost:20128 (비번:CHANGEME) → ANALYTICS → 사용량에서 확인.
§
OmniRoute 허브 선호: 기본 통로는 OmniRoute 유지. 동시 막힘(텔레그램+로컬) 시 먼저 통로 넣히기(CHAT_MAX_HEAVY_IN_FLIGHT 등) 선호. 다중 인스턴스/대체 서비스는 두 번째.
§
OmniRoute 업데이트 시 이 세션에서 :20128 stop 금지. 별도 완/스크립트 명령만 제공·사용자가 직접 실행. branch≠Release/tag/npm 분리 검증 후 설명.
§
모델 선택: 429/403/402 많은 free(가령 oc big-pickle/mimo/flash-free, openrouter auto 한도) 쓰지 않음. 안정 경로(Grok 계열 등) 우선. 매일 스모크로 allowlist만.
§
설명: 비유+표+한줄. 긴중복실패→재요약. 이중답변 싫어함.