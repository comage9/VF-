# -*- coding: utf-8 -*-
import os
import sys

# Django 환경 설정
os.chdir(r"E:\coding\VF-new\backend")
sys.path.append(r"E:\coding\VF-new\backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import connection

def main():
    with connection.cursor() as cursor:
        cursor.execute("SELECT MAX(id) FROM production_logs")
        max_id = cursor.fetchone()[0]
        print(f"Max ID in production_logs: {max_id}")
        
        if max_id is not None:
            # 시퀀스 리셋
            cursor.execute(f"SELECT setval('production_logs_id_seq', {max_id})")
            new_val = cursor.fetchone()[0]
            print(f"Sequence production_logs_id_seq reset to: {new_val}")
        else:
            print("No records in production_logs, sequence reset skipped.")

if __name__ == "__main__":
    main()
