import os
import json
import requests
import django
from datetime import datetime

# Setup Django Environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from sales_api.models import DeliveryDailyRecord

def sync_delivery_data():
    url = "http://bonohouse.p-e.kr:5176/api/delivery/hourly?days=30"
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json().get('data', [])
        
        for entry in data:
            date_str = entry.get('date')
            # hourly json fields are prefixed with 'hour_'
            hourly_data = {k: v for k, v in entry.items() if k.startswith('hour_')}
            
            # Upsert
            record, created = DeliveryDailyRecord.objects.update_or_create(
                date=date_str,
                defaults={
                    'day_of_week': entry.get('dayOfWeek', ''),
                    'total': entry.get('total', 0),
                    'hourly': hourly_data
                }
            )
            action = "Created" if created else "Updated"
            print(f"{action} record for {date_str}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    sync_delivery_data()
