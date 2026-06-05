"""
Agent Orchestrator - Routes queries to appropriate agents
"""

import os
import json
import re
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class AgentOrchestrator:
    """Routes user queries to appropriate domain agents"""

    # Domain keywords for routing
    ROUTING_KEYWORDS = {
        'outbound': ['출고', '판매', '매출', '하루', '주간', '월간', '트렌드', '품목', '카테고리'],
        'inbound': ['입고', '수령', '입력', 'fc', 'received'],
        'inventory': ['재고', '재고량', '보충', '안전', 'stock', 'inven'],
        'production': ['생산', '기계', '계획', '대기', '완료', '진행', 'product'],
        'delivery': ['배송', '배달', '오늘', ' delivery'],
        'action': ['삭제', '지워', '추가', '생성', '수정', '变了', 'delete', 'create', 'update'],
    }

    def __init__(self):
        from .base_agent import (
            OutboundAgent, InboundAgent, InventoryAgent,
            ProductionAgent, DeliveryAgent, ActionAgent
        )

        self.agents = {
            'outbound': OutboundAgent(),
            'inbound': InboundAgent(),
            'inventory': InventoryAgent(),
            'production': ProductionAgent(),
            'delivery': DeliveryAgent(),
            'action': ActionAgent(),
        }

        # Default router model - use free openrouter model
        self.router_model = os.getenv('ROUTER_MODEL', 'openrouter/free')

    def get_config(self) -> Optional[Dict[str, Any]]:
        """Get OpenRouter configuration"""
        base_url = (os.getenv("ANTHROPIC_BASE_URL") or "https://openrouter.ai").strip().rstrip("/")
        api_key = (os.getenv("ANTHROPIC_AUTH_TOKEN") or "").strip()

        if not base_url or not api_key:
            return None

        return {
            "base_url": base_url,
            "api_key": api_key,
            "model": self.router_model,
            "timeout_s": 30,
        }

    def route_query(self, query: str) -> str:
        """Route query to appropriate agent using LLM-based intent detection"""
        cfg = self.get_config()
        if not cfg:
            return self._rule_based_route(query)

        url = f"{cfg['base_url']}/api/v1/chat/completions"
        prompt = f"""다음 질문을 분석하여 적절한 도메인 에이전트中选择一个:

질문: {query}

도메인选项:
- outbound: VF 출고, 판매, 매출 관련
- inbound: FC 입고, 수령 관련
- inventory: 재고, 안전재고 관련
- production: 생산, 기계, 계획 관련
- delivery: 배송, 배달 관련
- action: 삭제, 추가, 수정, 변경 요청

回答只需提供 도메인 이름 (outbound/inbound/inventory/production/delivery/action)中的一个。"""

        system = "당신은 질문 유형을 분류하는 전문가입니다. 도메인 이름만返回一个单词。"
        payload = {
            "model": cfg["model"],
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 20,
            "temperature": 0.1,
        }
        headers = {
            "Authorization": f"Bearer {cfg['api_key']}",
            "Content-Type": "application/json",
        }

        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST",
            )

            with urllib.request.urlopen(req, timeout=cfg["timeout_s"]) as resp:
                raw = resp.read().decode("utf-8")

            data = json.loads(raw) if raw else {}
            choices = data.get("choices", [])
            if choices and len(choices) > 0:
                message = choices[0].get("message", {})
                content = message.get("content", "").strip().lower()
                for domain in ['outbound', 'inbound', 'inventory', 'production', 'delivery', 'action']:
                    if domain in content:
                        return domain
        except Exception as e:
            logger.warning(f"Router call failed, falling back to rule-based: {e}")

        return self._rule_based_route(query)

    def _rule_based_route(self, query: str) -> str:
        """Fallback rule-based routing"""
        query_lower = query.lower()

        scores = {}
        for domain, keywords in self.ROUTING_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw.lower() in query_lower)
            scores[domain] = score

        if scores:
            return max(scores, key=scores.get)

        return 'outbound'  # Default

    def process(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process query through appropriate agent"""
        # Route to agent
        agent_type = self.route_query(query)
        logger.info(f"[AgentOrchestrator] Routed to: {agent_type} for query: {query[:50]}...")

        # Get agent
        agent = self.agents.get(agent_type)
        if not agent:
            return {'answer': '적절한 에이전트를 찾을 수 없습니다.', 'agent': 'unknown'}

        # Build agent context
        agent_context = {}
        if agent_type == 'outbound':
            agent_context = context.get('outbound', {})
        elif agent_type == 'inbound':
            agent_context = context.get('inbound', {})
        elif agent_type == 'inventory':
            agent_context = context.get('inventory', {})
        elif agent_type == 'production':
            agent_context = context.get('production', {})
        elif agent_type == 'delivery':
            agent_context = context.get('delivery', {})
        elif agent_type == 'action':
            agent_context = context.get('action', {})

        # Process through agent
        try:
            result = agent.process(query, {'data': agent_context})
            result['agent'] = agent_type
            return result
        except Exception as e:
            logger.error(f"Agent processing failed: {e}")
            return {'answer': '처리 중 오류가 발생했습니다.', 'agent': agent_type, 'error': str(e)}

    def process_with_fallback(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process with multi-agent synthesis if needed"""
        # First try single agent
        result = self.process(query, context)

        # Check if response indicates need for multi-domain analysis
        response = result.get('answer', '')
        if any(word in response for word in ['복합', '종합', '전체', '전부']):
            # Synthesize from all domains
            all_results = {}
            for domain in ['outbound', 'inbound', 'inventory', 'production', 'delivery']:
                try:
                    agent = self.agents.get(domain)
                    if agent:
                        domain_context = context.get(domain, {})
                        r = agent.process(query, {'data': domain_context})
                        all_results[domain] = r.get('answer', '')
                except Exception as e:
                    logger.warning(f"Multi-domain failed for {domain}: {e}")

            # Synthesize response
            synthesis = f"## {query} 분석 결과\n\n"
            for domain, answer in all_results.items():
                if answer:
                    synthesis += f"### {domain.upper()}:\n{answer}\n\n"

            return {'answer': synthesis, 'agent': 'synthesized', 'multi_agent': True}

        return result