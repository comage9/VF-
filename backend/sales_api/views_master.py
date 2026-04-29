# -*- coding: utf-8 -*-
"""
마스터 데이터 API (색상, 단위, 금형, 제품단위규격)
"""
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.db.models import Count

from .models import MasterColor, MasterUnit, MasterMold, ProductUnitSpec
from .serializers_master import (
    MasterColorSerializer,
    MasterUnitSerializer,
    MasterMoldSerializer,
    ProductUnitSpecSerializer,
)


@api_view(['GET'])
def master_colors(request):
    """색상 마스터 목록 조회"""
    queryset = MasterColor.objects.filter(is_active=True).order_by('sort_order', 'color_code')
    serializer = MasterColorSerializer(queryset, many=True)
    return Response({
        'success': True,
        'data': serializer.data,
        'total': len(serializer.data)
    })


@api_view(['GET'])
def master_units(request):
    """단위 마스터 목록 조회"""
    queryset = MasterUnit.objects.filter(is_active=True).order_by('sort_order', 'unit_code')
    serializer = MasterUnitSerializer(queryset, many=True)
    return Response({
        'success': True,
        'data': serializer.data,
        'total': len(serializer.data)
    })


@api_view(['GET'])
def master_molds(request):
    """금형 마스터 목록 조회"""
    queryset = MasterMold.objects.filter(is_active=True).order_by('sort_order', 'mold_number')
    serializer = MasterMoldSerializer(queryset, many=True)
    return Response({
        'success': True,
        'data': serializer.data,
        'total': len(serializer.data)
    })


@api_view(['GET'])
def master_product_specs(request):
    """제품별 단위 규격 목록 조회"""
    queryset = ProductUnitSpec.objects.all().order_by('product_name', 'color_code', 'unit')
    serializer = ProductUnitSpecSerializer(queryset, many=True)
    return Response({
        'success': True,
        'data': serializer.data,
        'total': len(serializer.data)
    })


@api_view(['GET'])
def master_product_specs_by_product(request, product_name):
    """특정 제품의 단위 규격 조회"""
    queryset = ProductUnitSpec.objects.filter(product_name=product_name).order_by('color_code', 'unit')
    serializer = ProductUnitSpecSerializer(queryset, many=True)
    return Response({
        'success': True,
        'data': serializer.data,
        'total': len(serializer.data)
    })


@api_view(['GET'])
def master_lookup(request):
    """통합 조회 - 색상/금형/단위 규격 조회"""
    lookup_type = request.query_params.get('type', 'color')
    value = request.query_params.get('value', '').strip()
    
    if lookup_type == 'color':
        # 색상명으로 색상코드 조회
        colors = MasterColor.objects.filter(is_active=True)
        if value:
            # 부분 일치 검색
            results = colors.filter(color_name__icontains=value) | colors.filter(color_name_eng__icontains=value)
            results = results[:10]
        else:
            results = colors[:10]
        serializer = MasterColorSerializer(results, many=True)
        return Response({
            'success': True,
            'type': 'color',
            'data': serializer.data,
            'total': len(serializer.data)
        })
    
    elif lookup_type == 'mold':
        # 품목명으로 금형번호 조회
        molds = MasterMold.objects.filter(is_active=True)
        if value:
            results = molds.filter(product_name__icontains=value) | molds.filter(product_name_eng__icontains=value)
            results = results[:10]
        else:
            results = molds[:10]
        serializer = MasterMoldSerializer(results, many=True)
        return Response({
            'success': True,
            'type': 'mold',
            'data': serializer.data,
            'total': len(serializer.data)
        })
    
    elif lookup_type == 'unit_spec':
        # 제품별 단위 규격 조회
        product = request.query_params.get('product', '').strip()
        color = request.query_params.get('color', '').strip()
        
        specs = ProductUnitSpec.objects.all()
        if product:
            specs = specs.filter(product_name__icontains=product)
        if color:
            specs = specs.filter(color_code__icontains=color)
        
        # 대표 규격 먼저
        results = list(specs.filter(is_default=True)[:5]) + list(specs.filter(is_default=False)[:5])
        serializer = ProductUnitSpecSerializer(results, many=True)
        return Response({
            'success': True,
            'type': 'unit_spec',
            'data': serializer.data,
            'total': len(serializer.data)
        })
    
    return Response({
        'success': False,
        'message': 'Invalid type. Use: color, mold, unit_spec'
    }, status=400)


@api_view(['GET'])
def master_summary(request):
    """마스터 데이터 요약"""
    return Response({
        'success': True,
        'data': {
            'colors': MasterColor.objects.filter(is_active=True).count(),
            'units': MasterUnit.objects.filter(is_active=True).count(),
            'molds': MasterMold.objects.filter(is_active=True).count(),
            'product_specs': ProductUnitSpec.objects.count(),
        }
    })