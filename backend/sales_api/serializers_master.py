# -*- coding: utf-8 -*-
from rest_framework import serializers
from .models import MasterColor, MasterUnit, MasterMold, ProductUnitSpec


class MasterColorSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterColor
        fields = [
            'color_code', 'color_name', 'color_name_eng', 'lot_number',
            'client', 'representative_product', 'sort_order', 'is_active'
        ]


class MasterUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterUnit
        fields = [
            'unit_code', 'unit_name', 'unit_description', 'sort_order', 'is_active'
        ]


class MasterMoldSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterMold
        fields = [
            'mold_number', 'product_name', 'product_name_eng', 'product_name_th',
            'weight_grams', 'sort_order', 'is_active'
        ]


class ProductUnitSpecSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductUnitSpec
        fields = [
            'product_name', 'color_code', 'unit', 'unit_quantity',
            'boxes_per_pallet', 'is_default'
        ]