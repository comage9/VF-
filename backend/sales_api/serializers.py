from rest_framework import serializers
from .models import (
    OutboundRecord, InventoryItem, DataSource, DeliveryDailyRecord,
    BarcodeTransferRecord, DeliverySpecialNote, InboundOrderUpload,
    InboundOrderLine, InboundPolicy, FCInboundRecord, FCInboundFileUpload
)

class OutboundRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = OutboundRecord
        fields = '__all__'

class InventoryItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryItem
        fields = '__all__'

class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = '__all__'


class DeliveryDailyRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryDailyRecord
        fields = '__all__'


class BarcodeTransferRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = BarcodeTransferRecord
        fields = '__all__'


class DeliverySpecialNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliverySpecialNote
        fields = '__all__'


class InboundOrderUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = InboundOrderUpload
        fields = '__all__'


class InboundOrderLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InboundOrderLine
        fields = '__all__'


class InboundPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = InboundPolicy
        fields = '__all__'


class FCInboundRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = FCInboundRecord
        fields = '__all__'


class FCInboundFileUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = FCInboundFileUpload
        fields = '__all__'
