"""
Base Agent Class for VF AI System
"""

import os
import json
import urllib.request
import logging
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """Base class for all VF agents"""

    # Default free models from OpenRouter (verified working)
    DEFAULT_MODELS = {
        'router': 'auto',
        'outbound': 'auto',
        'inbound': 'auto',
        'inventory': 'auto',
        'production': 'auto',
        'delivery': 'auto',
        'action': 'auto',
    }

    def __init__(self, agent_type: str, model: Optional[str] = None):
        self.agent_type = agent_type
        self.model = model or self.DEFAULT_MODELS.get(agent_type, 'minimax/MiniMax-M2.7')

    def get_config(self) -> Optional[Dict[str, Any]]:
        """Get OmniRoute / OpenRouter configuration"""
        base_url = (
            (os.getenv("OMNIROUTE_BASE_URL") or "").strip().rstrip("/")
            or (os.getenv("ANTHROPIC_BASE_URL") or "").strip().rstrip("/")
            or "http://localhost:20128"
        )
        api_key = (
            (os.getenv("OMNIROUTE_API_KEY") or "").strip()
            or (os.getenv("ANTHROPIC_AUTH_TOKEN") or "").strip()
            or "omniroute-local"
        )

        return {
            "base_url": base_url,
            "api_key": api_key,
            "model": self.model,
            "timeout_s": 30,
        }

    def call_llm(self, system: str, user: str, max_tokens: int = 2048, temperature: float = 0.3) -> Optional[str]:
        """Make a call to OpenRouter API"""
        cfg = self.get_config()
        if not cfg:
            return None

        url = f"{cfg['base_url']}/api/v1/chat/completions"
        payload = {
            "model": cfg["model"],
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
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
                content = message.get("content", "")
                if not content:
                    content = message.get("reasoning", "")
                if content:
                    return content.strip()
        except Exception as e:
            logger.error(f"AI call failed ({self.model}): {e}")

        return None

    @abstractmethod
    def process(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process a query with the given context"""
        pass

    def get_system_prompt(self) -> str:
        """Get the system prompt for this agent"""
        return f"""당신은 VF/FC 통합 데이터 분석 전문가 AI 어시스턴트입니다.
당신은 {self.agent_type} 도메인의 데이터를 분석하고 답변하는 전문가입니다.
한국어로 명확하게 답변하세요."""


class OutboundAgent(BaseAgent):
    """Agent for VF Outbound data analysis"""

    def __init__(self):
        super().__init__('outbound', 'deepseek/deepseek-v4-flash:free')

    def process(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process VF outbound related queries"""
        outbound_data = context.get('data', {})

        prompt = f"""VF 출고 데이터 분석 전문가として:

データ:
{json.dumps(outbound_data, ensure_ascii=False, indent=2)}

질문: {query}

다음 지침에 따라 답변하세요:
1. 출고량, 매출, 트렌드 등 구체적인数据进行分析
2. 증감/감소율을 포함해 설명
3. 상위 3개 품목을 언급
4. 데이터가 없으면 솔직하게 고지"""

        answer = self.call_llm(self.get_system_prompt(), prompt)
        return {'answer': answer or '데이터를 분석할 수 없습니다.', 'agent': 'outbound'}


class InboundAgent(BaseAgent):
    """Agent for FC Inbound data analysis"""

    def __init__(self):
        super().__init__('inbound', 'deepseek/deepseek-v4-flash:free')

    def process(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process FC inbound related queries"""
        inbound_data = context.get('inbound', {})

        prompt = f"""FC 입고 데이터 분석 전문가として:

데이터:
{json.dumps(inbound_data, ensure_ascii=False, indent=2)}

질문: {query}

다음 지침에 따라 답변하세요:
1. 입고량, 품목별 분석 실시
2. 재고와의 관계 고려
3. 이상 패턴 발견 시 경고"""

        answer = self.call_llm(self.get_system_prompt(), prompt)
        return {'answer': answer or '데이터를 분석할 수 없습니다.', 'agent': 'inbound'}


class InventoryAgent(BaseAgent):
    """Agent for Inventory data analysis"""

    def __init__(self):
        super().__init__('inventory', 'deepseek/deepseek-v4-flash:free')

    def process(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process inventory related queries"""
        inventory_data = context.get('inventory', {})

        prompt = f"""재고 데이터 분석 전문가として:

데이터:
{json.dumps(inventory_data, ensure_ascii=False, indent=2)}

질문: {query}

다음 지침에 따라 답변하세요:
1. 안전재고 미달 품목 강조
2. 재고 보충 필요 품목 추천
3. 창고별 현황 분석"""

        answer = self.call_llm(self.get_system_prompt(), prompt)
        return {'answer': answer or '데이터를 분석할 수 없습니다.', 'agent': 'inventory'}


class ProductionAgent(BaseAgent):
    """Agent for Production data analysis"""

    def __init__(self):
        super().__init__('production', 'deepseek/deepseek-v4-flash:free')

    def process(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process production related queries"""
        production_data = context.get('production', {})

        prompt = f"""생산 데이터 분석 전문가として:

데이터:
{json.dumps(production_data, ensure_ascii=False, indent=2)}

질문: {query}

다음 지침에 따라 답변하세요:
1. 생산 현황 (대기/진행/완료) 명확히 설명
2. 기계별 효율성 분석
3. 생산 계획 최적화 제안"""

        answer = self.call_llm(self.get_system_prompt(), prompt)
        return {'answer': answer or '데이터를 분석할 수 없습니다.', 'agent': 'production'}


class DeliveryAgent(BaseAgent):
    """Agent for Delivery data analysis"""

    def __init__(self):
        super().__init__('delivery', 'deepseek/deepseek-v4-flash:free')

    def process(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process delivery related queries"""
        delivery_data = context.get('delivery', {})

        prompt = f"""배송 데이터 분석 전문가として:

데이터:
{json.dumps(delivery_data, ensure_ascii=False, indent=2)}

질문: {query}

다음 지침에 따라 답변하세요:
1. 오늘/어제 배송량 비교
2. 시간대별 현황 분석
3. 특이사항 발생 시 경고"""

        answer = self.call_llm(self.get_system_prompt(), prompt)
        return {'answer': answer or '데이터를 분석할 수 없습니다.', 'agent': 'delivery'}


class ActionAgent(BaseAgent):
    """Agent for executing actions (CRUD operations)"""

    def __init__(self):
        super().__init__('action', 'deepseek/deepseek-v4-flash:free')

    def process(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process action requests like delete, create, update"""
        action_data = context.get('action', {})

        prompt = f"""액션 실행 전문가として:

가능한 액션:
- 삭제: ID 기반 생산 로그 삭제
- 생성: 새로운 생산 계획 추가
- 수정: 기존 생산 계획 상태 변경

데이터:
{json.dumps(action_data, ensure_ascii=False, indent=2)}

요청: {query}

실행할 액션을 결정하고 결과를 보고하세요.
삭제 요청 시 반드시 확인 후 실행."""

        answer = self.call_llm(self.get_system_prompt(), prompt)
        return {'answer': answer or '액션을 처리할 수 없습니다.', 'agent': 'action'}