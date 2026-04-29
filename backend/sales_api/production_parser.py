# -*- coding: utf-8 -*-
"""
AI 생산계획 자연어 파서

사용 예시:
- "이유 화이트 6개 1파렛트 올려줘"
- "로코스M 아이보리 4개입 3파렛트"
- "데크타일 2파렛트"

파싱 규칙:
1. 품목명 → MasterMold에서 mold_number 자동 매핑
2. 색상명 → MasterColor에서 color_code 매핑 (화이트 → WHITE1 기본)
3. 단위 수량 → 기존 데이터에서 수집하거나 직접 입력
4. 파렛트(P) → 기존 제품 규격 기반 BOX 수 자동 계산
5. 모르는 정보 → 확인 질문
"""
import re
from typing import Optional, Dict, Any, Tuple, List
from datetime import date, timedelta

from .models import MasterColor, MasterMold, ProductUnitSpec, ProductionLog


class ProductionPlanParser:
    """AI 생산계획 자연어 파서"""
    
    # 색상명 → 색상코드 매핑 (기본값)
    COLOR_NAME_MAP = {
        '화이트': 'WHITE1',
        '화이트1': 'WHITE1',
        '화이트2': 'WHITE2',
        '화이트3': 'WHITE3',
        '아이보리': 'IVORY',
        '그레이': 'GRAY',
        '그레이1': 'GRAY9097',
        '그레이2': 'GRAY11215-1',
        '네이비': 'NAVY',
        '네이비1': 'NAVY1',
        '블랙': 'BLACK',
        '레드': 'RED',
        '핑크': 'PINK',
        '블루': 'BLUE',
        '그린': 'GREEN',
        '옐로우': 'YELLOW',
        '오렌지': 'ORANGE',
        '퍼플': 'PURPLE',
        '브라운': 'BROWN',
        '베이지': 'BEIGE',
        '화이트캡': 'WHITE-CAP',
        '화이트 캡': 'WHITE-CAP',
    }
    
    def __init__(self):
        self.today = date.today()
        self._mold_cache = None
        self._color_cache = None
        self._spec_cache = None
    
    def get_mold_map(self) -> Dict[str, str]:
        """품목명 → 금형번호 매핑"""
        if self._mold_cache is None:
            self._mold_cache = {}
            for m in MasterMold.objects.filter(is_active=True):
                self._mold_cache[m.product_name.lower()] = m.mold_number
                if m.product_name_eng:
                    self._mold_cache[m.product_name_eng.lower()] = m.mold_number
        return self._mold_cache
    
    def get_color_map(self) -> Dict[str, str]:
        """색상명 → 색상코드 매핑"""
        if self._color_cache is None:
            self._color_cache = {}
            for c in MasterColor.objects.filter(is_active=True):
                self._color_cache[c.color_name.lower()] = c.color_code
                if c.color_name_eng:
                    self._color_cache[c.color_name_eng.lower()] = c.color_code
        return self._color_cache
    
    def get_product_specs(self, product_name: str) -> List[Dict]:
        """제품별 단위 규격 조회"""
        if self._spec_cache is None:
            self._spec_cache = {}
            for s in ProductUnitSpec.objects.all():
                key = f"{s.product_name}|{s.color_code}"
                if key not in self._spec_cache:
                    self._spec_cache[key] = []
                self._spec_cache[key].append({
                    'unit': s.unit,
                    'unit_quantity': s.unit_quantity,
                    'boxes_per_pallet': s.boxes_per_pallet,
                    'is_default': s.is_default,
                })
        
        # 기존 ProductionLog에서 수집
        log_specs = {}
        for log in ProductionLog.objects.filter(product_name=product_name).exclude(unit_quantity=0):
            key = f"{log.product_name}|{log.color1}"
            if key not in log_specs:
                log_specs[key] = {}
            unit_key = log.unit or 'BOX'
            if unit_key not in log_specs[key]:
                log_specs[key][unit_key] = {
                    'unit_quantity': log.unit_quantity,
                    'count': 0
                }
            log_specs[key][unit_key]['count'] += 1
        
        return log_specs
    
    def find_mold_number(self, product_name: str) -> Optional[str]:
        """품목명에서 금형번호 찾기"""
        mold_map = self.get_mold_map()
        pn_lower = product_name.lower()
        
        # 완전 일치
        if pn_lower in mold_map:
            return mold_map[pn_lower]
        
        # 부분 일치
        for name, mold_num in mold_map.items():
            if pn_lower in name or name in pn_lower:
                return mold_num
        
        return None
    
    def find_color_code(self, color_name: str) -> Optional[str]:
        """색상명에서 색상코드 찾기"""
        color_map = self.get_color_map()
        cn_lower = color_name.lower().strip()
        
        # 완전 일치
        if cn_lower in color_map:
            return color_map[cn_lower]
        
        # 미리 정의된 매핑
        if cn_lower in self.COLOR_NAME_MAP:
            return self.COLOR_NAME_MAP[cn_lower]
        
        # 부분 일치
        for name, code in color_map.items():
            if cn_lower in name or name in cn_lower:
                return code
        
        return None
    
    def parse_pallet_to_boxes(self, product_name: str, pallets: int) -> int:
        """파렛트 수 → 박스 수 변환 (제품별 기존 데이터 기반)"""
        # 제품별 기본 boxes_per_pallet 조회
        specs = ProductUnitSpec.objects.filter(product_name=product_name, is_default=True).first()
        if specs:
            return pallets * specs.boxes_per_pallet
        
        # 기본값: 40박스/파렛트
        return pallets * 40
    
    def parse(self, text: str) -> Tuple[Dict[str, Any], List[str]]:
        """
        자연어 파싱
        
        Returns:
            (parsed_data, questions) - 파싱 결과와 확인 질문
        """
        text = text.strip()
        result = {
            'date': self.today.isoformat(),
            'machine_number': '',
            'mold_number': None,
            'product_name': None,
            'color1': None,
            'unit': 'BOX',
            'quantity': 0,
            'unit_quantity': 0,
            'total': 0,
            'status': 'pending',
            'pallets_requested': None,  # 파렛트 요청 시 원본 값
        }
        questions = []
        
        # 1. 품목명 추출 (첫 번째 단어 또는 "이유", "로코스M" 등)
        product_patterns = [
            r'^([가-힣a-zA-Z0-9]+)\s+',  # 첫 단어가 품목
        ]
        product_match = None
        for pattern in product_patterns:
            match = re.search(pattern, text)
            if match:
                product_name = match.group(1).strip()
                # 금형번호 매핑
                mold_num = self.find_mold_number(product_name)
                if mold_num:
                    product_match = product_name
                    result['product_name'] = product_name
                    result['mold_number'] = mold_num
                    break
                # 품목명 유사 확인 (매핑이 없어도 일단 품목으로 인정)
                product_match = product_name
                result['product_name'] = product_name
                break
        
        # 품목을 못 찾은 경우
        if not product_match:
            questions.append("품목을 알 수 없습니다. 다시 입력해주세요. (예: 이유, 로코스M, 데크타일)")
            return result, questions
        
        # 2. 색상 추출
        color_keywords = ['화이트', '화이트1', '화이트2', '화이트3', '아이보리', '그레이', 
                         '네이비', '블랙', '레드', '핑크', '블루', '그린', '옐로우',
                         '화이트캡', '화이트 캡', '아이보리']
        color_found = None
        for kw in color_keywords:
            if kw in text:
                color_found = kw
                break
        
        if color_found:
            color_code = self.find_color_code(color_found)
            if color_code:
                result['color1'] = color_code
            else:
                result['color1'] = color_found  # 원본 텍스트 저장
                questions.append(f"색상 '{color_found}'에 대한 색상코드를 확인해주세요.")
        else:
            # 색상 없으면 기본 WHITE1
            result['color1'] = 'WHITE1'
        
        # 3. 개수 추출 (X개, X개입)
        # "6개" 패턴
        count_match = re.search(r'(\d+)\s*개', text)
        if count_match:
            result['unit_quantity'] = int(count_match.group(1))
            # "6개입" 패턴 (박스당 개수)
            if '개입' in text or '개 들어있는' in text:
                result['unit_quantity'] = int(count_match.group(1))
        
        # "4개입" 패턴 (박스당 4개)
        unit_q_match = re.search(r'(\d+)\s*개\s*입', text)
        if unit_q_match:
            result['unit_quantity'] = int(unit_q_match.group(1))
        
        # 4. 파렛트(P) 추출
        pallet_match = re.search(r'(\d+)\s*[PpP]', text)
        if pallet_match:
            pallets = int(pallet_match.group(1))
            result['pallets_requested'] = pallets
            # 박스 수로 변환
            boxes = self.parse_pallet_to_boxes(result['product_name'], pallets)
            result['quantity'] = boxes
            result['unit'] = 'BOX'
        else:
            # 박스 수 직접 입력
            box_match = re.search(r'(\d+)\s*박스', text)
            if box_match:
                result['quantity'] = int(box_match.group(1))
        
        # 5. 총 개수 계산
        if result['unit_quantity'] > 0 and result['quantity'] > 0:
            result['total'] = result['quantity'] * result['unit_quantity']
        
        # 6. 확인 질문
        if result['unit_quantity'] == 0:
            # 제품별 기본 unit_quantity 조회
            default_uq = self.get_default_unit_quantity(result['product_name'])
            if default_uq > 0:
                result['unit_quantity'] = default_uq
                result['total'] = result['quantity'] * result['unit_quantity']
            else:
                questions.append(f"{result['product_name']}의 박스당 개수(unit_quantity)를 알려주세요. (예: 4개입, 8개입)")
        
        if result['quantity'] == 0 and result['pallets_requested'] is None:
            questions.append("수량(박스 또는 파렛트)을 알려주세요. (예: 6박스, 2파렛트)")
        
        if not result['mold_number']:
            questions.append(f"{result['product_name']}의 금형번호를 알려주세요.")
        
        return result, questions
    
    def get_default_unit_quantity(self, product_name: str) -> int:
        """제품의 기본 unit_quantity 조회 (ProductionLog 기반)"""
        from django.db.models import Count
        
        result = ProductionLog.objects.filter(
            product_name=product_name,
            unit_quantity__gt=0
        ).values('unit_quantity').annotate(
            cnt=Count('id')
        ).order_by('-cnt').first()
        
        if result:
            return result['unit_quantity']
        return 0
    
    def validate_and_save(self, parsed_data: Dict[str, Any]) -> Tuple[bool, str, Optional[int]]:
        """
        파싱 결과를 검증하고 ProductionLog에 저장
        
        Returns:
            (success, message, log_id)
        """
        if not parsed_data.get('product_name'):
            return False, "품목명이 없습니다.", None
        
        if not parsed_data.get('quantity') or parsed_data['quantity'] <= 0:
            return False, "수량이 없습니다.", None
        
        try:
            log = ProductionLog.objects.create(
                date=parsed_data['date'] if isinstance(parsed_data['date'], date) else date.today(),
                machine_number=parsed_data.get('machine_number', ''),
                mold_number=parsed_data.get('mold_number', ''),
                product_name=parsed_data['product_name'],
                color1=parsed_data.get('color1', ''),
                unit=parsed_data.get('unit', 'BOX'),
                quantity=parsed_data['quantity'],
                unit_quantity=parsed_data.get('unit_quantity', 0),
                total=parsed_data.get('total', 0),
                status=parsed_data.get('status', 'pending'),
            )
            return True, "생산계획이 추가되었습니다.", log.id
        except Exception as e:
            return False, f"저장 실패: {str(e)}", None


def parse_production_plan(text: str) -> Tuple[Dict[str, Any], List[str]]:
    """편의 함수: 생산계획 파싱"""
    parser = ProductionPlanParser()
    return parser.parse(text)


def validate_and_create_plan(parsed_data: Dict[str, Any]) -> Tuple[bool, str, Optional[int]]:
    """편의 함수: 파싱 결과를 저장"""
    parser = ProductionPlanParser()
    return parser.validate_and_save(parsed_data)