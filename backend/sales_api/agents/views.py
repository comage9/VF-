"""
AI Chat endpoint using Agent Orchestrator
"""

import logging
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)


@api_view(["POST"])
def ai_agent_chat(request):
    """
    New AI Chat endpoint using multi-agent orchestration.
    Request: {
        "message": "user question",
        "pageContext": { "type": "...", "name": "..." },
        "filters": { ... }
    }
    """
    try:
        message = (
            request.data.get("message", "").strip()
            if isinstance(request.data, dict)
            else ""
        )
        page_context = (
            request.data.get("pageContext") if isinstance(request.data, dict) else None
        )
        filters = request.data.get("filters") if isinstance(request.data, dict) else {}

        if not message:
            return Response(
                {"answer": "질문을 입력해주세요."}, status=status.HTTP_400_BAD_REQUEST
            )

        from django.utils import timezone
        from datetime import timedelta
        from django.db.models import Sum

        today = timezone.localdate()
        yesterday = today - timedelta(days=1)

        # Build context for all domains
        context = {
            'outbound': {},
            'inbound': {},
            'inventory': {},
            'production': {},
            'delivery': {},
            'action': {},
        }

        # 1. VF Outbound
        try:
            from sales_api.models import OutboundRecord
            context['outbound'] = {
                'total_count': OutboundRecord.objects.count(),
                'total_quantity': int(OutboundRecord.objects.aggregate(total=Sum("quantity"))["total"] or 0),
                'total_sales': float(OutboundRecord.objects.aggregate(total=Sum("sales_amount"))["total"] or 0),
                'today_quantity': int(OutboundRecord.objects.filter(outbound_date=today).aggregate(total=Sum("quantity"))["total"] or 0),
                'yesterday_quantity': int(OutboundRecord.objects.filter(outbound_date=yesterday).aggregate(total=Sum("quantity"))["total"] or 0),
            }
        except Exception as e:
            logger.warning(f"Failed to fetch VF outbound: {e}")

        # 2. FC Inbound
        try:
            from sales_api.models import FCInboundRecord
            context['inbound'] = {
                'total_count': FCInboundRecord.objects.count(),
                'total_quantity': FCInboundRecord.objects.aggregate(total=Sum("quantity"))["total"] or 0,
                'today_quantity': FCInboundRecord.objects.filter(receiving_date__date=today).aggregate(total=Sum("quantity"))["total"] or 0,
            }
        except Exception as e:
            logger.warning(f"Failed to fetch FC inbound: {e}")

        # 3. Inventory
        try:
            from sales_api.models import InventoryItem
            context['inventory'] = {
                'total_items': InventoryItem.objects.count(),
                'low_stock_count': InventoryItem.objects.filter(
                    current_stock__lte=InventoryItem.objects.values('minimum_stock')
                ).count(),
            }
        except Exception as e:
            logger.warning(f"Failed to fetch inventory: {e}")

        # 4. Production
        try:
            from sales_api.models import ProductionLog
            context['production'] = {
                'today_total': ProductionLog.objects.filter(date=today).count(),
                'today_active': ProductionLog.objects.filter(date=today, status='started').count(),
                'today_completed': ProductionLog.objects.filter(date=today, status='ended').count(),
                'today_pending': ProductionLog.objects.filter(date=today, status='pending').count(),
            }
        except Exception as e:
            logger.warning(f"Failed to fetch production: {e}")

        # 5. Delivery
        try:
            from sales_api.models import DeliveryDailyRecord
            context['delivery'] = {
                'today_total': DeliveryDailyRecord.objects.filter(date=today).first() or {},
                'yesterday_total': DeliveryDailyRecord.objects.filter(date=yesterday).first() or {},
            }
        except Exception as e:
            logger.warning(f"Failed to fetch delivery: {e}")

        # Process through agent orchestrator
        try:
            from sales_api.agents.orchestrator import AgentOrchestrator
            orchestrator = AgentOrchestrator()
            result = orchestrator.process_with_fallback(message, context)
            return Response(result)
        except Exception as e:
            logger.error(f"Agent orchestrator failed: {e}")
            return Response(
                {"answer": f"AI 처리 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    except Exception as e:
        logger.error(f"AI agent chat error: {e}")
        return Response(
            {"answer": f"요청 처리 중 오류가 발생했습니다: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(["GET"])
def ai_agent_status(request):
    """Check if AI agent system is available"""
    try:
        from sales_api.agents.orchestrator import AgentOrchestrator
        orchestrator = AgentOrchestrator()
        cfg = orchestrator.get_config()

        return Response({
            "status": "ok",
            "available": cfg is not None,
            "model": orchestrator.router_model,
            "agents": list(orchestrator.agents.keys()),
        })
    except Exception as e:
        return Response({
            "status": "error",
            "error": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)