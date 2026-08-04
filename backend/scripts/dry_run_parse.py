# -*- coding: utf-8 -*-
import re

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

lines = [l.strip() for l in RAW_DATA.strip().split('\n') if l.strip()]

print(f"총 {len(lines)}개의 행 파싱 시도")
print("=" * 100)

parsed_rows = []
errors = []

for idx, line in enumerate(lines):
    # 2개 이상의 공백으로 분할
    tokens = re.split(r'\s{2,}', line)
    if len(tokens) != 10:
        errors.append((idx + 1, line, f"토큰 개수 불일치: {len(tokens)}개"))
        continue
    
    dt, machine, mold, kn, en, c1, c2, unit_qty_str, qty_str, unit = tokens
    try:
        unit_qty = int(unit_qty_str)
        qty = int(qty_str)
        total = unit_qty * qty
        parsed_rows.append({
            'date': dt,
            'machine': machine,
            'mold': mold,
            'name_kr': kn,
            'name_en': en,
            'color1': c1,
            'color2': c2,
            'unit_quantity': unit_qty,
            'quantity': qty,
            'total': total,
            'unit': unit
        })
    except ValueError as e:
        errors.append((idx + 1, line, f"숫자 변환 실패: {e}"))

print(f"성공적으로 파싱된 행: {len(parsed_rows)}개")
if errors:
    print(f"파싱 실패 행: {len(errors)}개")
    for err in errors:
        print(f"  [행 {err[0]}] 오류: {err[2]} | 내용: {err[1]}")

print("=" * 100)
print(f"{'날짜':<10} | {'기계':<4} | {'금형':<4} | {'품목명':<20} | {'색상1':<10} | {'색상2':<12} | {'수량':<4} | {'단위':<4} | {'총수량':<6}")
print("-" * 100)
for r in parsed_rows[:5]:
    print(f"{r['date']:<10} | {r['machine']:<4} | {r['mold']:<4} | {r['name_kr']:<20} | {r['color1']:<10} | {r['color2']:<12} | {r['quantity']:<4} | {r['unit']:<4} | {r['total']:<6}")
print("... (이하 생략)")
