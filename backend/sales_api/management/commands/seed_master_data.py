# -*- coding: utf-8 -*-
from django.core.management.base import BaseCommand
from sales_api.models import MasterColor, MasterUnit, MasterMold


class Command(BaseCommand):
    help = '마스터 데이터 시딩 (색상, 단위, 금형)'

    def handle(self, *args, **options):
        self.stdout.write('마스터 데이터 시딩 시작...')

        # 1. 단위 마스터 시딩
        self.seed_units()

        # 2. 색상 마스터 시딩
        self.seed_colors()

        # 3. 금형 마스터 시딩
        self.seed_molds()

        self.stdout.write(self.style.SUCCESS('마스터 데이터 시딩 완료!'))

    def seed_units(self):
        """단위 마스터 - 6개"""
        units = [
            {'unit_code': 'P', 'unit_name': '파렛트', 'unit_description': '가장 큰 단위, 1파렛트 = 40박스 (제품별 상이)', 'sort_order': 1},
            {'unit_code': 'BOX', 'unit_name': '박스', 'unit_description': '표준 포장 단위', 'sort_order': 2},
            {'unit_code': 'SET', 'unit_name': '세트', 'unit_description': '세트 구성', 'sort_order': 3},
            {'unit_code': 'EA', 'unit_name': '개', 'unit_description': '낱개 단위', 'sort_order': 4},
            {'unit_code': 'LINE', 'unit_name': '라인', 'unit_description': '생산 라인을 의미', 'sort_order': 5},
            {'unit_code': '-', 'unit_name': '미지정', 'unit_description': '빈 값', 'sort_order': 6},
        ]

        for unit in units:
            obj, created = MasterUnit.objects.get_or_create(
                unit_code=unit['unit_code'],
                defaults={
                    'unit_name': unit['unit_name'],
                    'unit_description': unit['unit_description'],
                    'sort_order': unit['sort_order'],
                }
            )
            if created:
                self.stdout.write(f'  + 단위: {unit["unit_code"]} - {unit["unit_name"]}')
            else:
                self.stdout.write(f'  = 단위 존재: {unit["unit_code"]}')

    def seed_colors(self):
        """색상 마스터 - 30개"""
        colors = [
            # 화이트 계열
            {'color_code': 'WHITE1', 'color_name': '화이트1', 'color_name_eng': 'White1', 'lot_number': 'WHITE 180', 'client': '', 'representative_product': '', 'sort_order': 10},
            {'color_code': 'WHITE2', 'color_name': '화이트2', 'color_name_eng': 'White2', 'lot_number': 'IVORY 1154', 'client': '롯트번호', 'representative_product': '데크 타일 화이트', 'sort_order': 11},
            {'color_code': 'WHITE3', 'color_name': '화이트3', 'color_name_eng': 'White3', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 12},
            {'color_code': 'IVORY', 'color_name': '아이보리', 'color_name_eng': 'Ivory', 'lot_number': 'IVORY 1060', 'client': '', 'representative_product': '로코스, 오픈', 'sort_order': 13},

            # 그레이 계열
            {'color_code': 'GRAY9097', 'color_name': '그레이1', 'color_name_eng': 'Gray1', 'lot_number': 'GRAY 9097', 'client': '경서산업', 'representative_product': '', 'sort_order': 20},
            {'color_code': 'GRAY11215-1', 'color_name': '그레이2', 'color_name_eng': 'Gray2', 'lot_number': '', 'client': '폴리마스터', 'representative_product': '', 'sort_order': 21},
            {'color_code': 'GRAY', 'color_name': '그레이', 'color_name_eng': 'Gray', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 22},

            # 네이비 계열
            {'color_code': 'NAVY1', 'color_name': '네이비1', 'color_name_eng': 'Navy1', 'lot_number': 'GRAY 9091', 'client': '', 'representative_product': '해피, 초대형', 'sort_order': 30},
            {'color_code': 'NAVY', 'color_name': '네이비', 'color_name_eng': 'Navy', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 31},

            # 그린 계열
            {'color_code': 'GREEN3746EQ', 'color_name': '그린(파스텔)', 'color_name_eng': 'Green', 'lot_number': 'GREEN 3746EQ', 'client': '미래화학', 'representative_product': '', 'sort_order': 40},
            {'color_code': 'GREEN', 'color_name': '그린', 'color_name_eng': 'Green', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 41},
            {'color_code': 'MINT', 'color_name': '민트', 'color_name_eng': 'Mint', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 42},

            # 블루 계열
            {'color_code': 'BLUE', 'color_name': '블루', 'color_name_eng': 'Blue', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 50},
            {'color_code': 'SKYBLUE', 'color_name': '스카이블루', 'color_name_eng': 'Sky Blue', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 51},

            # 레드/핑크 계열
            {'color_code': 'RED', 'color_name': '레드', 'color_name_eng': 'Red', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 60},
            {'color_code': 'PINK', 'color_name': '핑크', 'color_name_eng': 'Pink', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 61},
            {'color_code': 'CORAL', 'color_name': '코랄', 'color_name_eng': 'Coral', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 62},

            # 옐로우/오렌지 계열
            {'color_code': 'YELLOW', 'color_name': '옐로우', 'color_name_eng': 'Yellow', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 70},
            {'color_code': 'ORANGE', 'color_name': '오렌지', 'color_name_eng': 'Orange', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 71},
            {'color_code': 'PEACH', 'color_name': '피치', 'color_name_eng': 'Peach', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 72},

            # 퍼플/바이올렛 계열
            {'color_code': 'PURPLE', 'color_name': '퍼플', 'color_name_eng': 'Purple', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 80},
            {'color_code': 'VIOLET', 'color_name': '바이올렛', 'color_name_eng': 'Violet', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 81},
            {'color_code': 'LAVENDER', 'color_name': '라벤더', 'color_name_eng': 'Lavender', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 82},

            # 브라운/베이지 계열
            {'color_code': 'BROWN', 'color_name': '브라운', 'color_name_eng': 'Brown', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 90},
            {'color_code': 'BEIGE', 'color_name': '베이지', 'color_name_eng': 'Beige', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 91},
            {'color_code': 'CREAM', 'color_name': '크림', 'color_name_eng': 'Cream', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 92},
            {'color_code': 'SAND', 'color_name': '샌드', 'color_name_eng': 'Sand', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 93},

            # 기타
            {'color_code': 'BLACK', 'color_name': '블랙', 'color_name_eng': 'Black', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 100},
            {'color_code': 'TRANSPARENT', 'color_name': '투명', 'color_name_eng': 'Transparent', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 101},
            {'color_code': 'NATURAL', 'color_name': '내추럴', 'color_name_eng': 'Natural', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 102},
            {'color_code': 'WALNUT', 'color_name': '월넛', 'color_name_eng': 'Walnut', 'lot_number': '', 'client': '', 'representative_product': '', 'sort_order': 103},
            {'color_code': 'WHITE-CAP', 'color_name': '화이트캡', 'color_name_eng': 'White Cap', 'lot_number': 'WHITE 180', 'client': '', 'representative_product': '로코스 캡', 'sort_order': 104},
        ]

        for color in colors:
            obj, created = MasterColor.objects.get_or_create(
                color_code=color['color_code'],
                defaults={
                    'color_name': color['color_name'],
                    'color_name_eng': color['color_name_eng'],
                    'lot_number': color['lot_number'],
                    'client': color['client'],
                    'representative_product': color['representative_product'],
                    'sort_order': color['sort_order'],
                }
            )
            if created:
                self.stdout.write(f'  + 색상: {color["color_code"]} - {color["color_name"]}')
            else:
                self.stdout.write(f'  = 색상 존재: {color["color_code"]}')

    def seed_molds(self):
        """금형 마스터 - 135개"""
        molds = [
            {'mold_number': '0', 'product_name': '미정', 'sort_order': 0},
            {'mold_number': '1', 'product_name': '모던플러스 프레임', 'product_name_eng': 'Modern Plus Frame', 'weight_grams': 720, 'sort_order': 1},
            {'mold_number': '101', 'product_name': '신규 모던플러스 프레임', 'product_name_eng': 'New Modern Plus Frame', 'weight_grams': 720, 'sort_order': 2},
            {'mold_number': '2', 'product_name': '모던플러스 서랍', 'product_name_eng': 'Modern Plus Drawer', 'weight_grams': 900, 'sort_order': 3},
            {'mold_number': '3', 'product_name': '모던플러스 블랑', 'product_name_eng': 'Modern Plus Blanc', 'weight_grams': 900, 'sort_order': 4},
            {'mold_number': '4', 'product_name': '모던플러스 상판', 'product_name_eng': 'Modern Plus Top Board', 'weight_grams': 700, 'sort_order': 5},
            {'mold_number': '5', 'product_name': '모던플러스 앞판', 'product_name_eng': 'Modern Plus front panel', 'weight_grams': 400, 'sort_order': 6},
            {'mold_number': '6', 'product_name': '데이지 앞판', 'product_name_eng': 'Daisy Front Panel', 'weight_grams': 400, 'sort_order': 7},
            {'mold_number': '7', 'product_name': '모던플러스 발', 'product_name_eng': 'Modern Plus Foot', 'weight_grams': 40, 'sort_order': 8},
            {'mold_number': '8', 'product_name': '슬림 서랍장 서랍', 'product_name_eng': 'Slim Drawer Chest Drawer', 'weight_grams': 490, 'sort_order': 9},
            {'mold_number': '801', 'product_name': '슬림 서랍장 서랍 신규', 'product_name_eng': 'New Slim Drawer Chest Drawer', 'weight_grams': 490, 'sort_order': 10},
            {'mold_number': '9', 'product_name': '슬림 서랍장 프레임', 'product_name_eng': 'slim dresser frame', 'weight_grams': 450, 'sort_order': 11},
            {'mold_number': '901', 'product_name': '슬림 서랍장 프레임 신규', 'product_name_eng': 'New Slim Dresser Frame', 'weight_grams': 450, 'sort_order': 12},
            {'mold_number': '10', 'product_name': '슬립 서랍장 캡', 'product_name_eng': 'slip drawer caps', 'weight_grams': 300, 'sort_order': 13},
            {'mold_number': '11', 'product_name': '슬림서랍장 바퀴', 'product_name_eng': 'slim chest of drawers wheels', 'sort_order': 14},
            {'mold_number': '12', 'product_name': '초대형 바디', 'product_name_eng': 'Extra Large Body', 'weight_grams': 900, 'sort_order': 15},
            {'mold_number': '13', 'product_name': '초대형 캡', 'product_name_eng': 'extra large cap', 'weight_grams': 300, 'sort_order': 16},
            {'mold_number': '14', 'product_name': '해피 바디', 'product_name_eng': 'Happy Body', 'weight_grams': 900, 'sort_order': 17},
            {'mold_number': '15', 'product_name': '해피 캡', 'product_name_eng': 'happy cap', 'weight_grams': 390, 'sort_order': 18},
            {'mold_number': '16', 'product_name': '손잡이(해피,초대형)', 'product_name_eng': 'Handle (happy, extra large)', 'weight_grams': 50, 'sort_order': 19},
            {'mold_number': '17', 'product_name': '토이 바디', 'product_name_eng': 'Toy Body', 'weight_grams': 1500, 'sort_order': 20},
            {'mold_number': '18', 'product_name': '토이 손잡이', 'product_name_eng': 'Toy Handle', 'weight_grams': 160, 'sort_order': 21},
            {'mold_number': '19', 'product_name': '일반 해피 바퀴', 'product_name_eng': 'Regular Happy Wheels', 'weight_grams': 50, 'sort_order': 22},
            {'mold_number': '20', 'product_name': '오픈 바스켓', 'product_name_eng': 'Open Basket', 'weight_grams': 600, 'sort_order': 23},
            {'mold_number': '21', 'product_name': '오픈 바스켓 마개', 'product_name_eng': 'open basket closure', 'sort_order': 24},
            {'mold_number': '22', 'product_name': '에센셜 상판', 'product_name_eng': 'Essential Tops', 'weight_grams': 370, 'sort_order': 25},
            {'mold_number': '23', 'product_name': '에센셜 앞판', 'product_name_eng': 'Essential Front Panel', 'weight_grams': 150, 'sort_order': 26},
            {'mold_number': '232', 'product_name': '데코스 앞판', 'product_name_eng': 'Deco front panel', 'weight_grams': 150, 'sort_order': 27},
            {'mold_number': '24', 'product_name': '라탄 기본형 앞판', 'product_name_eng': 'Rattan Basic Front Panel', 'weight_grams': 125, 'sort_order': 28},
            {'mold_number': '25', 'product_name': '에센셜 프레임', 'product_name_eng': 'essential frame', 'weight_grams': 310, 'sort_order': 29},
            {'mold_number': '26', 'product_name': '에센셜 서랍', 'product_name_eng': 'essential drawer', 'weight_grams': 600, 'sort_order': 30},
            {'mold_number': '27', 'product_name': '에센셜 기둥', 'product_name_eng': 'Essential Pillar', 'weight_grams': 130, 'sort_order': 31},
            {'mold_number': '28', 'product_name': '에센셜 발', 'product_name_eng': 'essential feet', 'weight_grams': 110, 'sort_order': 32},
            {'mold_number': '29', 'product_name': '와이드 상판', 'product_name_eng': 'Wide Top Board', 'weight_grams': 680, 'sort_order': 33},
            {'mold_number': '30', 'product_name': '와이드 앞판', 'product_name_eng': 'Wide Front Panel', 'weight_grams': 280, 'sort_order': 34},
            {'mold_number': '31', 'product_name': '와이드 프레임', 'product_name_eng': 'Wide Frame', 'weight_grams': 410, 'sort_order': 35},
            {'mold_number': '32', 'product_name': '와이드 서랍', 'product_name_eng': 'wide drawer', 'weight_grams': 830, 'sort_order': 36},
            {'mold_number': '33', 'product_name': '슬림형 상판', 'product_name_eng': 'Slim top plate', 'sort_order': 37},
            {'mold_number': '34', 'product_name': '슬림형 앞판', 'product_name_eng': 'slim front plate', 'sort_order': 38},
            {'mold_number': '36', 'product_name': '슬림형 서랍', 'product_name_eng': 'slim drawer', 'sort_order': 39},
            {'mold_number': '37', 'product_name': '어반 옷걸이', 'product_name_eng': 'urban hanger', 'weight_grams': 30, 'sort_order': 40},
            {'mold_number': '35', 'product_name': '슬림형 프레임', 'product_name_eng': 'slim frame', 'sort_order': 41},
            {'mold_number': '38', 'product_name': '러블리 옷걸이', 'product_name_eng': 'Lovely Hanger', 'weight_grams': 40, 'sort_order': 42},
            {'mold_number': '39', 'product_name': '비행기 옷걸이', 'product_name_eng': 'airplane hanger', 'weight_grams': 40, 'sort_order': 43},
            {'mold_number': '40', 'product_name': '로코스 L', 'product_name_eng': 'Locos L', 'weight_grams': 600, 'sort_order': 44},
            {'mold_number': '41', 'product_name': '로코스 M', 'product_name_eng': 'Locos M', 'weight_grams': 500, 'sort_order': 45},
            {'mold_number': '42', 'product_name': '로코스 S', 'product_name_eng': 'Locos S', 'weight_grams': 300, 'sort_order': 46},
            {'mold_number': '43', 'product_name': '로코스 캡 L,M', 'product_name_eng': 'Locos CAP - L', 'weight_grams': 210, 'sort_order': 47},
            {'mold_number': '44', 'product_name': '로코스 캡 S', 'product_name_eng': 'Locos CAP - S', 'weight_grams': 100, 'sort_order': 48},
            {'mold_number': '45', 'product_name': '레브 스토리지 L', 'product_name_eng': 'Rev Storage L', 'weight_grams': 600, 'sort_order': 49},
            {'mold_number': '46', 'product_name': '레브 스토리지 M', 'product_name_eng': 'Rev Storage M', 'weight_grams': 450, 'sort_order': 50},
            {'mold_number': '47', 'product_name': '레브 스토리지 캡', 'product_name_eng': 'rev storage cap', 'weight_grams': 180, 'sort_order': 51},
            {'mold_number': '48', 'product_name': '레브 레일', 'product_name_eng': 'rev rail', 'sort_order': 52},
            {'mold_number': '49', 'product_name': '모니카', 'product_name_eng': 'monica', 'weight_grams': 800, 'sort_order': 53},
            {'mold_number': '50', 'product_name': '모니카 캡', 'product_name_eng': 'monica cap', 'weight_grams': 400, 'sort_order': 54},
            {'mold_number': '51', 'product_name': '모니카 핸들', 'product_name_eng': 'monica handle', 'weight_grams': 160, 'sort_order': 55},
            {'mold_number': '52', 'product_name': '모니카 똑딱이', 'product_name_eng': 'Monica Snap Button', 'sort_order': 56},
            {'mold_number': '53', 'product_name': '오픈 바스켓 파이프', 'product_name_eng': 'open basket pipe', 'weight_grams': 100, 'sort_order': 57},
            {'mold_number': '54', 'product_name': '중간연결봉', 'product_name_eng': 'middle connecting rod', 'weight_grams': 30, 'sort_order': 58},
            {'mold_number': '55', 'product_name': '바퀴 연결봉', 'product_name_eng': 'wheel connecting rod', 'weight_grams': 30, 'sort_order': 59},
            {'mold_number': '56', 'product_name': '바퀴', 'product_name_eng': 'wheel', 'weight_grams': 300, 'sort_order': 60},
            {'mold_number': '57', 'product_name': '리빙카트 바구니 대', 'product_name_eng': 'Living Cart Basket Stand', 'weight_grams': 650, 'sort_order': 61},
            {'mold_number': '58', 'product_name': '리빙카트 바구니 소', 'product_name_eng': 'Living Cart Basket Small', 'weight_grams': 41, 'sort_order': 62},
            {'mold_number': '59', 'product_name': '리빙카트 손잡이', 'product_name_eng': 'Living cart handle', 'weight_grams': 190, 'sort_order': 63},
            {'mold_number': '60', 'product_name': '리빙카트 바퀴대, 연결봉', 'product_name_eng': 'Living cart wheel base, connecting rod', 'weight_grams': 40, 'sort_order': 64},
            {'mold_number': '61', 'product_name': '리빙카트 마개', 'product_name_eng': 'Living Cart Stopper', 'weight_grams': 50, 'sort_order': 65},
            {'mold_number': '62', 'product_name': '리빙카트 바퀴', 'product_name_eng': 'Living Cart Wheels', 'sort_order': 66},
            {'mold_number': '63', 'product_name': '슬림웨건 상판', 'product_name_eng': 'Slim wagon top', 'weight_grams': 270, 'sort_order': 67},
            {'mold_number': '64', 'product_name': '슬림웨건 바구니', 'product_name_eng': 'Slim Wagon Basket', 'weight_grams': 330, 'sort_order': 68},
            {'mold_number': '65', 'product_name': '펭귄 머리', 'product_name_eng': 'penguin head', 'weight_grams': 450, 'sort_order': 69},
            {'mold_number': '66', 'product_name': '펭귄 얼굴', 'product_name_eng': 'Penguin Face', 'weight_grams': 210, 'sort_order': 70},
            {'mold_number': '67', 'product_name': '펭귄 손잡이', 'product_name_eng': 'Penguin Handle', 'weight_grams': 100, 'sort_order': 71},
            {'mold_number': '68', 'product_name': '펭귄 귀, 눈', 'product_name_eng': 'Penguin ears, eyes', 'weight_grams': 50, 'sort_order': 72},
            {'mold_number': '69', 'product_name': '펭귄 바구니', 'product_name_eng': 'penguin basket', 'weight_grams': 500, 'sort_order': 73},
            {'mold_number': '70', 'product_name': '에코빈 바디', 'product_name_eng': 'Ecobin Body', 'sort_order': 74},
            {'mold_number': '71', 'product_name': '에코빈 캡', 'product_name_eng': 'ecobin cap', 'sort_order': 75},
            {'mold_number': '72', 'product_name': '야채 바구니', 'product_name_eng': 'vegetable basket', 'weight_grams': 350, 'sort_order': 76},
            {'mold_number': '73', 'product_name': '후라이펜', 'product_name_eng': 'frying pen', 'sort_order': 77},
            {'mold_number': '74', 'product_name': '메인식기', 'product_name_eng': 'Main Tableware', 'sort_order': 78},
            {'mold_number': '75', 'product_name': '보조 식기', 'product_name_eng': 'secondary tableware', 'sort_order': 79},
            {'mold_number': '76', 'product_name': '수저, 포크', 'product_name_eng': 'spoon, fork', 'sort_order': 80},
            {'mold_number': '77', 'product_name': '토들러 컵', 'product_name_eng': 'Toddler Cup', 'sort_order': 81},
            {'mold_number': '78', 'product_name': '스마트 트레이닝 컵', 'product_name_eng': 'smart training cup', 'weight_grams': 100, 'sort_order': 82},
            {'mold_number': '79', 'product_name': '스마트 트레이닝 컵 캡', 'product_name_eng': 'smart training cup cap', 'weight_grams': 50, 'sort_order': 83},
            {'mold_number': '80', 'product_name': '스마트 트레이닝 컵 마개', 'product_name_eng': 'Smart Training Cup Stopper', 'sort_order': 84},
            {'mold_number': '81', 'product_name': '스마트 트레이닝 컵 손잡이', 'product_name_eng': 'Smart Training Cup Handle', 'sort_order': 85},
            {'mold_number': '82', 'product_name': '오이캡 육각', 'product_name_eng': 'cucumber cap hexagon', 'sort_order': 86},
            {'mold_number': '83', 'product_name': '오이캡', 'product_name_eng': 'cucumber cap', 'sort_order': 87},
            {'mold_number': '84', 'product_name': '슬라이딩 스텝 L', 'product_name_eng': 'sliding step L', 'weight_grams': 250, 'sort_order': 88},
            {'mold_number': '85', 'product_name': '슬라이딩 스텝 S', 'product_name_eng': 'Sliding Step S', 'weight_grams': 150, 'sort_order': 89},
            {'mold_number': '86', 'product_name': '해피 프레임 상판', 'product_name_eng': 'Happy Frame Top Board', 'sort_order': 90},
            {'mold_number': '87', 'product_name': '해피 프레임 프레임', 'product_name_eng': 'Happy Frame Frame', 'sort_order': 91},
            {'mold_number': '88', 'product_name': '해피 프레임 기둥', 'product_name_eng': 'Happy Frame Pillar', 'sort_order': 92},
            {'mold_number': '89', 'product_name': '해피 프레임 앞판', 'product_name_eng': 'Happy Frame Front Panel', 'sort_order': 93},
            {'mold_number': '90', 'product_name': '스마일 손잡이', 'product_name_eng': 'smile handle', 'sort_order': 94},
            {'mold_number': '91', 'product_name': '키즈 손잡이', 'product_name_eng': 'kids handle', 'weight_grams': 60, 'sort_order': 95},
            {'mold_number': '92', 'product_name': '원형 손잡이', 'product_name_eng': 'Round Handle', 'sort_order': 96},
            {'mold_number': '93', 'product_name': '소변기', 'product_name_eng': 'Urinal', 'weight_grams': 300, 'sort_order': 97},
            {'mold_number': '94', 'product_name': '꼬마 변기', 'product_name_eng': 'kid potty', 'weight_grams': 500, 'sort_order': 98},
            {'mold_number': '95', 'product_name': '스틸렉', 'product_name_eng': 'Stilec', 'sort_order': 99},
            {'mold_number': '96', 'product_name': '펭귄발(홀캡 고리)', 'product_name_eng': 'Penguin Foot (Hole Cap Ring)', 'weight_grams': 160, 'sort_order': 100},
            {'mold_number': '97', 'product_name': '젖병건조대', 'product_name_eng': 'baby bottle drying rack', 'sort_order': 101},
            {'mold_number': '98', 'product_name': '젖병건조대 핀', 'product_name_eng': 'Baby Bottle Drying Rack Pin', 'sort_order': 102},
            {'mold_number': '99', 'product_name': '옷정리 트레이', 'product_name_eng': 'Clothes Organizing Tray', 'weight_grams': 30, 'sort_order': 103},
            {'mold_number': '100', 'product_name': '우드 고정대', 'product_name_eng': 'wood fixture', 'sort_order': 104},
            {'mold_number': '101', 'product_name': '미니해피 바디', 'product_name_eng': 'mini happy body', 'weight_grams': 235, 'sort_order': 105},
            {'mold_number': '102', 'product_name': '미니해피 캡', 'product_name_eng': 'Mini Happy Cap', 'weight_grams': 160, 'sort_order': 106},
            {'mold_number': '103', 'product_name': '먼지 커버', 'product_name_eng': 'dust cover', 'sort_order': 107},
            {'mold_number': '104', 'product_name': '핸들러 바스켓 와이드(L)', 'product_name_eng': 'Handler Basket Wide (L)', 'weight_grams': 220, 'sort_order': 108},
            {'mold_number': '105', 'product_name': '핸들러 바스켓 베이직(M)', 'product_name_eng': 'Handler Basket Basic (M)', 'weight_grams': 180, 'sort_order': 109},
            {'mold_number': '106', 'product_name': '핸들러 바스켓 슬림(S)', 'product_name_eng': 'Handler Basket Slim (S)', 'weight_grams': 150, 'sort_order': 110},
            {'mold_number': '107', 'product_name': '로코스 XS', 'product_name_eng': 'Locos XS', 'weight_grams': 160, 'sort_order': 111},
            {'mold_number': '108', 'product_name': '슬림 우드 부속', 'product_name_eng': 'Slim wood attachment', 'sort_order': 112},
            {'mold_number': '109', 'product_name': '템바보드', 'product_name_eng': 'Themba Board', 'sort_order': 113},
            {'mold_number': '110', 'product_name': '바퀴 고정핀', 'product_name_eng': 'Wheel fixing pin', 'sort_order': 114},
            {'mold_number': '111', 'product_name': '어반 옷걸이 신규 금형', 'product_name_eng': 'Urban hanger new mold', 'weight_grams': 30, 'sort_order': 115},
            {'mold_number': '112', 'product_name': '어반 와이드 옷걸이', 'product_name_eng': 'Urban Wide Hanger', 'sort_order': 116},
            {'mold_number': '113', 'product_name': '해피프레임 서랍', 'product_name_eng': 'Happy Frame Drawer', 'sort_order': 117},
            {'mold_number': '114', 'product_name': '데크타일', 'product_name_eng': 'Deck tiles', 'sort_order': 118},
            {'mold_number': '115', 'product_name': '목 늘림 방지 옷걸이(밸런스 옷걸이)', 'product_name_eng': 'Anti-stretch hanger (balance hanger)', 'sort_order': 119},
            {'mold_number': '116', 'product_name': '맥스 서랍장 프레임', 'product_name_eng': 'Max chest of drawers frame', 'sort_order': 120},
            {'mold_number': '117', 'product_name': '맥스 서랍장 상판', 'product_name_eng': 'Max dresser top', 'sort_order': 121},
            {'mold_number': '118', 'product_name': '맥스 서랍장 서랍', 'product_name_eng': 'Max dresser drawers', 'sort_order': 122},
            {'mold_number': '119', 'product_name': '펭귄 고리', 'product_name_eng': 'Penguin ring', 'sort_order': 123},
            {'mold_number': '120', 'product_name': '바퀴핀', 'product_name_eng': 'Wheel pin', 'sort_order': 124},
            {'mold_number': '121', 'product_name': '탑백 72L', 'product_name_eng': 'Top Bag 72L', 'sort_order': 125},
            {'mold_number': '122', 'product_name': '탑백 52L', 'product_name_eng': 'Top Bag 52L', 'sort_order': 126},
            {'mold_number': '123', 'product_name': '탑백 24L', 'product_name_eng': 'Top Bag 24L', 'sort_order': 127},
            {'mold_number': '124', 'product_name': '탑백 72L,52L 캡', 'product_name_eng': 'Top bag 72L/52L cap', 'sort_order': 128},
            {'mold_number': '125', 'product_name': '탑백 24L 캡', 'product_name_eng': 'Top Bag 24L Cap', 'sort_order': 129},
            {'mold_number': '126', 'product_name': '북트롤리 상판(분리)', 'product_name_eng': 'Book trolley top (separated)', 'sort_order': 130},
            {'mold_number': '127', 'product_name': '북트롤리 중간판(삼각)', 'product_name_eng': 'Book trolley middle plate (triangular)', 'sort_order': 131},
            {'mold_number': '128', 'product_name': '북트롤리 하판(사각)', 'product_name_eng': 'Book trolley lower plate (square)', 'sort_order': 132},
            {'mold_number': '129', 'product_name': '북트롤리 연결기둥', 'product_name_eng': 'Book trolley connection pillar', 'sort_order': 133},
            {'mold_number': '130', 'product_name': '북트롤리 바퀴 연결봉(하단받침)', 'product_name_eng': 'Book trolley wheel connecting rod (bottom support)', 'sort_order': 134},
            {'mold_number': '131', 'product_name': '북트롤리 마개', 'product_name_eng': 'Book trolley stopper', 'sort_order': 135},
            {'mold_number': '132', 'product_name': '와이드 우드 프레임', 'product_name_eng': 'Wide wood frame', 'sort_order': 136},
            {'mold_number': '133', 'product_name': '일반형 우드 프레임', 'product_name_eng': 'Standard wood frame', 'sort_order': 137},
            {'mold_number': '134', 'product_name': '모던 플러스 라탄 앞판', 'product_name_eng': 'Modern Plus Rattan Front Panel', 'sort_order': 138},
            {'mold_number': '135', 'product_name': '이유', 'product_name_eng': 'EU', 'sort_order': 139},
            {'mold_number': '136', 'product_name': '이유 기둥', 'product_name_eng': 'EU pillar', 'sort_order': 140},
            {'mold_number': '137', 'product_name': '바지걸이', 'product_name_eng': 'trouser hanger', 'sort_order': 141},
        ]

        for mold in molds:
            obj, created = MasterMold.objects.get_or_create(
                mold_number=mold['mold_number'],
                defaults={
                    'product_name': mold['product_name'],
                    'product_name_eng': mold.get('product_name_eng', ''),
                    'product_name_th': mold.get('product_name_th', ''),
                    'weight_grams': mold.get('weight_grams'),
                    'sort_order': mold['sort_order'],
                }
            )
            if created:
                self.stdout.write(f'  + 금형: {mold["mold_number"]} - {mold["product_name"]}')
            else:
                self.stdout.write(f'  = 금형 존재: {mold["mold_number"]}')