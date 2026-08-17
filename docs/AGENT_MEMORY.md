VF: E:/coding/VF-new→VF-go. 1세션=1Task. DB=vf_go_dev. skill:vf-go-migration.
§
OmniRoute: :20128 세션의존→kill/재설치 금지(외부 PS만). branch≠tag≠npm. 소스 설치 가능=github:#release/v3.8.50. EBUSY=node 전부종료. 다중 Hermes=OR 1대; 503 admission=heavy슬롯(기본1)→~/.omniroute/.env OMNIROUTE_CHAT_MAX_HEAVY_IN_FLIGHT=2~3 후 재시작(사용자 선호: OmniRoute 유지·통로확장). 폴백 전부 omniroute=모델명만 변경. skill:omniroute-gateway.
§
MCP: VF=py3.11 venv 9tools. KPP=py3.11 venv (2026-08-11 전환) 4tools. 둘 다 python.exe직접. skill:hermes-local-mcp-ops.
§
현재고(제품 조회 SoT)=GET /api/master/specs의 current_stock. 조회 스크립트: backend/scripts/vf_product_lookup.py. ⚠️20XX번(=320-A1-2-XX) 입력 시 스크립트 미지원→/api/master/specs location=320-A1-2-XX 직접 조회. 2034번=2-34(≠234번). ORM 직접탐사 금지
§
코딩=Claude Code(claude -p). OR:20128=settings.json만(셸ANTHROPIC_*금지). 위임후 Hermes build+curl—exit0≠✅. 문서2+리뷰후LOCK. delegation-template=user-owned(adopt필요).
§
VF 권역입력: G=GMH, M=MIDDLE, 합산=기존값 덧셈. 저장=POST /api/vehicle-extras (NOT ls-data). payload:{date,extras:{호차:{plt,regions,departTime,pltTime}}}. departTime/pltTime=현재HH:MM 필수. POST전 GET으로 기존값 읽어서 덮기. fact_store #62,#66,#67
§
VF 제품배치도 A동: 1111 첫열 slot ASC dense pack L1→L4 only, L5 last/empty. slot≠cell(구멍금지). rank-a-v4. skill refs: ranking-rules-override.md + a-dong-rank-dense-pack.md (SKILL.md 옛 slot표 폐기).
§
MCP args=YAML list. crash→skill:hermes-local-mcp-ops.
§
KPP PBM140 다중센터 공용 — VF외 타센터 전표 존재 가능. 1호차=호차순 강제 아님, 기존행 보존+맨끝 신규행. 등록 시 호차만 보지 말고 차량번호도 같이 확인(by_both 로직, kpp_session.py 2026-08-11).
§
Verify: console+API+snapshot. HMR≠dist. 가능여부만=노실행. 하지마=중단.
§
Wiki vault=E:\hermes-backup\obsidian\06-Wiki-시스템\Wiki-okf (vault_gate.py). Wiki/≠Wiki-okf.
§
VF-new: Django+React 5174/5176. 메뉴SoT=dashboard NAV_ITEMS. 맨아래=트럭운송비다음 제품배치도(/product-display). 출차≠끝. 새탭=lazy+NAV+META+activeKey+render+pages. ref:product-display-sidebar-nav-20260816. VehicleOrderService. PDF={plate}_{date}.pdf.
§
워크박스EU시리즈(320-A1-1-6XX): 650=엘로우2,689=블루4,690=엘로우9,691=레드2,692=블루2,693=엘로우4,694=레드4,695=엘로우6,696=레드6,697=블루6,698=레드9,699=블루9. color1="EU - RED/BLUE/YELLO". "EU 옐로우4개"=693,"EU 블루6개"=697,"EU 블루4개"=689.
§
pywin32(win32print/printto): python(3.13)에만 있음, python3(3.14)엔 없음 → 권역지·KPP·LS 인쇄는 python으로. print_region.py는 scripts폴더로 cd 후 실행.
§
VF입고제한: 기본=default_inbound_limit_qty(04:00;90d+추이×4). min2=출고없을때만. 수동=limit_qty. 실시간평균금지. Master안내/채우기X.