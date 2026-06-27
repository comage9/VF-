"""2026-06-25 생산계획 일괄 업로드 — 46건 (마지막 2행 기계0/금형0/수량0 스킵)"""
import os, django
os.chdir(r"E:\coding\VF-new - 복사본\backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from sales_api.models import ProductionLog
from datetime import date

# (날짜, 기계, 금형, 한글명, 영문명, 색상1, 색상2(코드), 단위, 수량, 생산단위)
ROWS = [
    (date(2026, 6, 25), 1, 56, "바퀴", "wheel", "Ivory2", "IVORY 5516-2", 200, 6, "BOX"),
    (date(2026, 6, 25), 3, 122, "탑백 52L", "Top Bag 52L", "Gray2", "GRAY 11215-1", 125, 1, "P"),
    (date(2026, 6, 25), 4, 2, "모던플러스 서랍", "Modern Plus Drawer", "WHITE1", "WHITE 180", 8, 1, "P"),
    (date(2026, 6, 25), 5, 101, "신규 모던플러스 프레임", "New Modern Plus Frame", "WHITE1", "WHITE 180", 8, 1, "P"),
    (date(2026, 6, 25), 6, 5, "모던플러스 앞판", "Modern Plus front panel", "WHITE1", "WHITE 180", 1, 1, "P"),
    (date(2026, 6, 25), 7, 901, "슬림 서랍장 프레임 신규", "New Slim Dresser Frame", "WHITE1", "WHITE 180", 1132, 1, "EA"),
    (date(2026, 6, 25), 8, 801, "슬림 서랍장 서랍 신규", "New Slim Drawer Chest Drawer", "WHITE1", "WHITE 180", 56, 30, "BOX"),
    (date(2026, 6, 25), 9, 35, "슬림형 프레임", "slim frame", "WHITE1", "WHITE 180", 22, 2, "P"),
    (date(2026, 6, 25), 9, 30, "와이드 앞판", "Wide Front Panel", "Ratan Brown", "BROWN 11-573", 70, 15, "BOX"),
    (date(2026, 6, 25), 9, 117, "맥스 서랍장 상판", "Max dresser top", "WHITE1", "WHITE 180", 30, 40, "BOX"),
    (date(2026, 6, 25), 9, 84, "슬라이딩 스텝 L", "sliding step L", "WHITE1", "WHITE 180", 120, 10, "BOX"),
    (date(2026, 6, 25), 10, 114, "데크타일", "Deck tiles", "WHITE2", "IVORY 1154", 72, 9, "BOX"),
    (date(2026, 6, 25), 10, 114, "데크타일", "Deck tiles", "Dark Brown", "Brown 4142", 72, 9, "BOX"),
    (date(2026, 6, 25), 10, 105, "핸들러 바스켓 베이직(M)", "Handler Basket Basic (M)", "Mint2", "GREEN 30072", 5, 30, "LINE"),
    (date(2026, 6, 25), 10, 105, "핸들러 바스켓 베이직(M)", "Handler Basket Basic (M)", "Ivory", "IVORY 1060", 24, 8, "BOX"),
    (date(2026, 6, 25), 10, 105, "핸들러 바스켓 베이직(M)", "Handler Basket Basic (M)", "WHITE2", "IVORY 1154", 16, 8, "BOX"),
    (date(2026, 6, 25), 10, 85, "슬라이딩 스텝 S", "Sliding Step S", "WHITE1", "WHITE 180", 40, 15, "BOX"),
    (date(2026, 6, 25), 10, 85, "슬라이딩 스텝 S", "Sliding Step S", "WHITE1", "WHITE 180", 40, 10, "BOX"),
    (date(2026, 6, 25), 11, 111, "어반 옷걸이 신규 금형", "Urban hanger new mold", "Gray2", "GRAY 11215-1", 112, 30, "BOX"),
    (date(2026, 6, 25), 11, 111, "어반 옷걸이 신규 금형", "Urban hanger new mold", "Gray2", "GRAY 11215-1", 40, 50, "BOX"),
    (date(2026, 6, 25), 11, 111, "어반 옷걸이 신규 금형", "Urban hanger new mold", "Black", "-", 112, 30, "BOX"),
    (date(2026, 6, 25), 11, 111, "어반 옷걸이 신규 금형", "Urban hanger new mold", "Black", "-", 80, 50, "BOX"),
    (date(2026, 6, 25), 12, 31, "와이드 프레임", "Wide Frame", "Brown", "BROWN 11-573", 10, 19, "BOX"),
    (date(2026, 6, 25), 12, 127, "북트롤리 중간판(삼각)", "Book trolley middle plate (triangular)", "Ivory2", "IVORY 5516-2", 40, 20, "BOX"),
    (date(2026, 6, 25), 12, 127, "북트롤리 중간판(삼각)", "Book trolley middle plate (triangular)", "Butter", "YELLO - 3093", 20, 20, "BOX"),
    (date(2026, 6, 25), 12, 127, "북트롤리 중간판(삼각)", "Book trolley middle plate (triangular)", "Modern Blue(B3)", "BLUE 2083", 20, 20, "BOX"),
    (date(2026, 6, 25), 12, 13, "초대형 캡", "extra large cap", "Violet", "VIOLET 8176", 10, 66, "BOX"),
    (date(2026, 6, 25), 12, 13, "초대형 캡", "extra large cap", "Ivory", "IVORY 1060", 10, 66, "BOX"),
    (date(2026, 6, 25), 12, 13, "초대형 캡", "extra large cap", "Modern Blue(B3)", "BLUE 2083", 5, 66, "BOX"),
    (date(2026, 6, 25), 12, 13, "초대형 캡", "extra large cap", "BLUE(B2)", "-", 5, 66, "BOX"),
    (date(2026, 6, 25), 13, 41, "로코스 M", "Locos M", "WHITE1", "WHITE 180", 96, 8, "BOX"),
    (date(2026, 6, 25), 13, 116, "맥스 서랍장 프레임", "Max chest of drawers frame", "WHITE1", "WHITE 180", 6, 30, "LINE"),
    (date(2026, 6, 25), 14, 99, "옷정리 트레이", "Clothes Organizing Tray", "WHITE1", "WHITE 180", 112, 30, "BOX"),
    (date(2026, 6, 25), 14, 99, "옷정리 트레이", "Clothes Organizing Tray", "WHITE1", "WHITE 180", 40, 50, "BOX"),
    (date(2026, 6, 25), 14, 104, "핸들러 바스켓 와이드(L)", "Handler Basket Wide (L)", "WHITE1", "WHITE 180", 112, 4, "BOX"),
    (date(2026, 6, 25), 14, 104, "핸들러 바스켓 와이드(L)", "Handler Basket Wide (L)", "WHITE1", "WHITE 180", 24, 8, "BOX"),
    (date(2026, 6, 25), 14, 104, "핸들러 바스켓 와이드(L)", "Handler Basket Wide (L)", "Ivory", "IVORY 1060", 24, 8, "BOX"),
    (date(2026, 6, 25), 14, 104, "핸들러 바스켓 와이드(L)", "Handler Basket Wide (L)", "Ivory", "IVORY 1060", 112, 4, "BOX"),
    (date(2026, 6, 25), 14, 118, "맥스 서랍장 서랍", "Max dresser drawers", "WHITE1", "WHITE 180", 60, 9, "BOX"),
    (date(2026, 6, 25), 14, 118, "맥스 서랍장 서랍", "Max dresser drawers", "Dark O", "DARK 9022", 60, 9, "BOX"),
    (date(2026, 6, 25), 14, 118, "맥스 서랍장 서랍", "Max dresser drawers", "Dark O", "DARK 9022", 60, 9, "BOX"),
    (date(2026, 6, 25), 14, 40, "로코스 L", "Locos L", "WHITE1", "WHITE 180", 72, 8, "BOX"),
    (date(2026, 6, 25), 14, 40, "로코스 L", "Locos L", "WHITE-CAP(WHITE)", "WHITE 180", 64, 4, "BOX"),
    (date(2026, 6, 25), 14, 40, "로코스 L", "Locos L", "WHITE1", "WHITE 180", 64, 4, "BOX"),
    (date(2026, 6, 25), 14, 40, "로코스 L", "Locos L", "WHITE1", "WHITE 180", 64, 6, "BOX"),
    (date(2026, 6, 25), 14, 40, "로코스 L", "Locos L", "WHITE-CAP(O)", "WHITE 180", 24, 4, "BOX"),
    (date(2026, 6, 25), 14, 40, "로코스 L", "Locos L", "WHITE-CAP(O)", "WHITE 180", 24, 2, "BOX"),
    (date(2026, 6, 25), 14, 40, "로코스 L", "Locos L", "IVORY-CAP(O)", "IVORY 1060", 24, 4, "BOX"),
    (date(2026, 6, 25), 14, 40, "로코스 L", "Locos L", "Ivory", "IVORY 1060", 32, 4, "BOX"),
    (date(2026, 6, 25), 14, 40, "로코스 L", "Locos L", "Ivory", "IVORY 1060", 96, 6, "BOX"),
    (date(2026, 6, 25), 14, 40, "로코스 L", "Locos L", "Ivory", "IVORY 1060", 64, 3, "BOX"),
]

# INSERT 실행
inserted = 0
errors = []
for row in ROWS:
    d, machine, mold, kn, en, c1, c2, unit_qty, qty, unit = row
    try:
        log = ProductionLog.objects.create(
            date=d,
            machine_number=str(machine),
            mold_number=str(mold),
            product_name=kn,
            product_name_eng=en,
            color1=c1,
            color2=c2,
            unit_quantity=unit_qty,
            quantity=qty,
            unit=unit,
            status='pending',
        )
        inserted += 1
    except Exception as e:
        errors.append(f"  ❌ 기계{machine} 금형{mold} {kn[:15]}: {e}")

print(f"\n=== INSERT 결과 ===")
print(f"성공: {inserted}건 / {len(ROWS)}건")
if errors:
    print(f"실패: {len(errors)}건")
    for e in errors:
        print(e)

# 최종 검증
final_count = ProductionLog.objects.filter(date=date(2026, 6, 25)).count()
print(f"\n=== DB 검증: 2026-06-25 전체 = {final_count}건 ===")
