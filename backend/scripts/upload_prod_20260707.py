# -*- coding: utf-8 -*-
import os
import sys
import re
from datetime import date

# Django 환경 설정
os.chdir(r"E:\coding\VF-new\backend")
sys.path.append(r"E:\coding\VF-new\backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from sales_api.models import ProductionLog

RAW_DATA = """
2026-07-07  생산대기  111   어반 옷걸이 신규 금형  Urban hanger new mold(แม่พิมพ์ใหม่ไม้แขวนเสื้อเมือง)  WHITE1  WHITE 180  50  80  BOX
2026-07-07  생산대기  111   어반 옷걸이 신규 금형  Urban hanger new mold(แม่พิมพ์ใหม่ไม้แขวนเสื้อเมือง)  WHITE1  WHITE 180  70  24  BOX
2026-07-07  생산대기  111   어반 옷걸이 신규 금형  Urban hanger new mold(แม่พิมพ์ใหม่ไม้แขวนเสื้อเมือง)  Gray2  GRAY 11215-1  70  32  BOX
2026-07-07  생산대기  111   어반 옷걸이 신규 금형  Urban hanger new mold(แม่พิมพ์ใหม่ไม้แขวนเสื้อเมือง)  Gray2  GRAY 11215-1  50  40  BOX
2026-07-07  1  56   바퀴  wheel(ล้อ)  Black  -  200  4  BOX
2026-07-07  1  56   바퀴  wheel(ล้อ)  Ivory2  IVORY 5516-2  200  4  BOX
2026-07-07  3  17   토이 바디  Toy Body(ตัวของเล่น)  WHITE1  WHITE 180  125  1  P
2026-07-07  4  2   모던플러스 서랍  Modern Plus Drawer(ลิ้นชักโมเดิร์นพลัส)  WHITE1  WHITE 180  8  1  P
2026-07-07  5  101   신규 모던플러스 프레임  New Modern Plus Frame(ใหม่ โมเดิร์นพลัสเฟรม)  WHITE1  WHITE 180  8  1  P
2026-07-07  6  5   모던플러스 앞판  Modern Plus front panel(แผงด้านหน้าโมเดิร์นพลัส)  WHITE1  WHITE 180  1  1  P
2026-07-07  7  901   슬림 서랍장 프레임 신규  New Slim Dresser Frame(กรอบโต๊ะเครื่องแป้งเพรียวบางใหม่)  WHITE1  WHITE 180  1  1132  EA
2026-07-07  8  801   슬림 서랍장 서랍 신규  New Slim Drawer Chest Drawer(ลิ้นชักตู้ลิ้นชักแบบบางใหม่)  WHITE1  WHITE 180  30  56  BOX
2026-07-07  9  32   와이드 서랍  wide drawer(ลิ้นชักกว้าง)  WHITE1  WHITE 180  180  3  P
2026-07-07  9  84   슬라이딩 스텝 L  sliding step L(เลื่อนขั้นตอน L)  WHITE1  WHITE 180  5  40  BOX
2026-07-07  9  84   슬라이딩 스텝 L  sliding step L(เลื่อนขั้นตอน L)  WHITE1  WHITE 180  10  80  BOX
2026-07-07  10  112   어반 와이드 옷걸이  Urban Wide Hanger(ไม้แขวนเสื้อกว้างแบบเมือง)  Butter  YELLO - 3093  200  8  BOX
2026-07-07  10  112   어반 와이드 옷걸이  Urban Wide Hanger(ไม้แขวนเสื้อกว้างแบบเมือง)  WHITE1  WHITE 180  50  32  BOX
2026-07-07  10  112   어반 와이드 옷걸이  Urban Wide Hanger(ไม้แขวนเสื้อกว้างแบบเมือง)  WHITE1  WHITE 180  30  40  BOX
2026-07-07  10  112   어반 와이드 옷걸이  Urban Wide Hanger(ไม้แขวนเสื้อกว้างแบบเมือง)  Gray2  GRAY 11215-1  30  40  BOX
2026-07-07  10  115   목 늘림 방지 옷걸이(밸런스 옷걸이)  Anti-stretch hanger (balance hanger)(ไม้แขวนเสื้อกันยืด (ไม้แขวนเสื้อสมดุล))  WHITE1  WHITE 180  30  56  BOX
2026-07-07  10  115   목 늘림 방지 옷걸이(밸런스 옷걸이)  Anti-stretch hanger (balance hanger)(ไม้แขวนเสื้อกันยืด (ไม้แขวนเสื้อสมดุล))  Ivory  IVORY 1060  50  32  BOX
2026-07-07  11  135   이유  EU()  EU RED  RED 2259  2  224  BOX
2026-07-07  11  135   이유  EU()  EU BLUE  BLUE 3847  2  72  BOX
2026-07-07  12  99   옷정리 트레이  Clothes Organizing Tray(ถาดจัดระเบียบเสื้อผ้า)  WHITE1  WHITE 180  50  40  BOX
2026-07-07  12  46   레브 스토리지 M  Rev Storage M(ที่เก็บของ Rev ขนาด M)  WHITE1  WHITE 180  30  6  LINE
2026-07-07  12  46   레브 스토리지 M  Rev Storage M(ที่เก็บของ Rev ขนาด M)  Yello  YELLOW 4414PQ  30  4  LINE
2026-07-07  12  46   레브 스토리지 M  Rev Storage M(ที่เก็บของ Rev ขนาด M)  Violet  VIOLET 8176  30  4  LINE
2026-07-07  12  46   레브 스토리지 M  Rev Storage M(ที่เก็บของ Rev ขนาด M)  Ivory  IVORY 1060  30  6  LINE
2026-07-07  12  46   레브 스토리지 M  Rev Storage M(ที่เก็บของ Rev ขนาด M)  O  R601  30  6  LINE
2026-07-07  12  45   레브 스토리지 L  Rev Storage L(ที่เก็บของ Rev ขนาด L)  O  R601  30  6  LINE
2026-07-07  12  45   레브 스토리지 L  Rev Storage L(ที่เก็บของ Rev ขนาด L)  Gray1  GRAY 9097  30  6  LINE
2026-07-07  12  45   레브 스토리지 L  Rev Storage L(ที่เก็บของ Rev ขนาด L)  Ivory  IVORY 1060  30  4  LINE
2026-07-07  13  12   초대형 바디  Extra Large Body(ตัวใหญ่พิเศษ)  Ivory  IVORY 1060  270  1  P
2026-07-07  13  12   초대형 바디  Extra Large Body(ตัวใหญ่พิเศษ)  Violet  VIOLET 8176  30  6  LINE
2026-07-07  13  12   초대형 바디  Extra Large Body(ตัวใหญ่พิเศษ)  Modern Blue(B3)  BLUE 2083  30  6  LINE
2026-07-07  13  12   초대형 바디  Extra Large Body(ตัวใหญ่พิเศษ)  NAVY1  GRAY 9091  30  4  LINE
2026-07-07  13  12   초대형 바디  Extra Large Body(ตัวใหญ่พิเศษ)  WHITE-YELLO  WHITE 180  30  3  LINE
2026-07-07  13  12   초대형 바디  Extra Large Body(ตัวใหญ่พิเศษ)  WHITE-PINK2  WHITE 180  30  2  LINE
2026-07-07  13  116   맥스 서랍장 프레임  Max chest of drawers frame(โครงตู้ลิ้นชักแม็กซ์)  WHITE1  WHITE 180  90  8  P
2026-07-07  14  118   맥스 서랍장 서랍  Max dresser drawers(ลิ้นชักตู้เสื้อผ้าแม็กซ์)  Dark O  DARK 9022  9  50  BOX
2026-07-07  14  33   슬림형 상판  Slim top plate(แผ่นด้านบนบางเฉียบ)  Brown  BROWN 11-573  14  10  BOX
2026-07-07  14  33   슬림형 상판  Slim top plate(แผ่นด้านบนบางเฉียบ)  WHITE1  WHITE 180  14  20  BOX
2026-07-07  생산대기  111   어반 옷걸이 신규 금형  Urban hanger new mold(แม่พิมพ์ใหม่ไม้แขวนเสื้อเมือง)  Ivory  IVORY 1060  30  112  BOX
2026-07-07  생산대기  111   어반 옷걸이 신규 금형  Urban hanger new mold(แม่พิมพ์ใหม่ไม้แขวนเสื้อเมือง)  Ivory  IVORY 1060  50  80  BOX
"""

def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass
    lines = [l.strip() for l in RAW_DATA.strip().split('\n') if l.strip()]
    
    print(f"=== 2026-07-07 생산계획 데이터 업로드 시작 (총 {len(lines)}건) ===")
    
    inserted_count = 0
    duplicate_count = 0
    error_count = 0
    
    for idx, line in enumerate(lines):
        tokens = re.split(r'\s{2,}', line)
        if len(tokens) != 10:
            print(f"  [행 {idx+1}] ❌ 파싱 실패 (토큰 개수 {len(tokens)} != 10)")
            error_count += 1
            continue
            
        dt_str, machine, mold, kn, en, c1, c2, unit_qty_str, qty_str, unit = tokens
        
        try:
            # 날짜 파싱
            y, m, d = map(int, dt_str.split('-'))
            target_date = date(y, m, d)
            
            unit_qty = int(unit_qty_str)
            qty = int(qty_str)
            total = unit_qty * qty
            
            # 중복 체크
            exists = ProductionLog.objects.filter(
                date=target_date,
                machine_number=str(machine),
                mold_number=str(mold),
                product_name=kn,
                color1=c1,
                color2=c2,
                unit=unit,
                quantity=qty,
                unit_quantity=unit_qty
            ).exists()
            
            if exists:
                print(f"  [행 {idx+1}] ⏭️ 중복 스킵: {kn} ({c1} / 기계 {machine} 금형 {mold})")
                duplicate_count += 1
                continue
                
            # 데이터 삽입
            ProductionLog.objects.create(
                date=target_date,
                machine_number=str(machine),
                mold_number=str(mold),
                product_name=kn,
                product_name_eng=en,
                color1=c1,
                color2=c2,
                unit_quantity=unit_qty,
                quantity=qty,
                unit=unit,
                total=total,
                status='pending'
            )
            print(f"  [행 {idx+1}] ✅ 삽입 성공: {kn} ({c1} / {qty} {unit} -> 총 {total}개)")
            inserted_count += 1
            
        except Exception as e:
            print(f"  [행 {idx+1}] ❌ 오류 발생: {e}")
            error_count += 1
            
    print("\n" + "="*50)
    print("=== 업로드 완료 요약 ===")
    print(f"총 라인: {len(lines)}개")
    print(f"삽입 성공: {inserted_count}개")
    print(f"중복 스킵: {duplicate_count}개")
    print(f"실패/오류: {error_count}개")
    print("="*50 + "\n")
    
    # DB 최종 건수 검증
    final_count = ProductionLog.objects.filter(date=date(2026, 7, 7)).count()
    print(f"📊 DB 최종 검증: 2026-07-07 일자 총 데이터 건수: {final_count}건")

if __name__ == "__main__":
    main()
