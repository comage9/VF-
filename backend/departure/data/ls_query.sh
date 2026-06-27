#!/bin/bash
# LS VF67 차량 조회 + PDF 기사정보 파싱 + VF 출차관리 자동 동기화
# 사용법: bash ls_query.sh [날짜(YYYY-MM-DD)]
# 예: bash ls_query.sh 2026-06-22
# 쿠키 만료 시 ls_cookies.txt 교체 필요

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COOKIE_FILE="$SCRIPT_DIR/ls_cookies.txt"
DATE="${1:-$(date +%Y-%m-%d)}"
VF_API="http://localhost:5176/departure/api/ls-data"
PYTHON="C:/Users/kis/AppData/Local/Programs/Python/Python313/python.exe"

if [ ! -f "$COOKIE_FILE" ]; then
  echo "❌ 쿠키 파일 없음: $COOKIE_FILE"
  exit 1
fi

echo "[1/3] LS VF67 차량 조회: $DATE"
RAW=$(curl -s -b "$COOKIE_FILE" \
  "https://ls.coupang.com/truckOrderTracking?page=0&pageSize=100&orderStartDate=${DATE}&orderEndDate=${DATE}&locationStart=VF67_H" \
  -H "Accept: application/json" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  --max-time 15)

if echo "$RAW" | grep -q "Access Denied\|login\|403\|401"; then
  echo "❌ 쿠키 만료 또는 접근 거부. ls_cookies.txt 교체 필요."
  echo "   응답: $(echo "$RAW" | head -c 200)"
  exit 1
fi

TOTAL=$(echo "$RAW" | "$PYTHON" -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('totalElements',0))" 2>/dev/null)
echo "✅ 조회 성공: ${TOTAL}대"

if [ -z "$TOTAL" ] || [ "$TOTAL" = "0" ]; then
  echo "⚠️ 등록된 차량 없음"
  echo '[]' | curl -s -X POST "$VF_API" -H "Content-Type: application/json" -d '[]' > /dev/null
  exit 0
fi

echo "[2/3] PDF 다운로드 및 기사정보 파싱..."
echo "$RAW" | "$PYTHON" -c "
import sys, json, os, re, urllib.request, fitz

data = json.load(sys.stdin)
content = data['data']['content']
content.sort(key=lambda x: x.get('requestTime', 0))

# 쿠키 로드
cookie_path = r'$SCRIPT_DIR/ls_cookies.txt'
cookies = {}
with open(cookie_path, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'): continue
        parts = line.split('\t')
        if len(parts) >= 7:
            cookies[parts[5]] = parts[6]
cookie_str = '; '.join(f'{k}={v}' for k,v in cookies.items())

pdf_dir = os.path.join(r'$SCRIPT_DIR', 'ls_pdfs', '$DATE')
os.makedirs(pdf_dir, exist_ok=True)

hoche_map = {90626:1, 90628:2, 90269:3}
vehicles = []

for v in content:
    tid = v['truckRequestId']
    template_id = v.get('truckOrderTemplateId', 0)
    hoche = hoche_map.get(template_id, 99)
    plate = v.get('truckInfo', {}).get('plateNumber', '')
    ton = v.get('truckType', {}).get('name', '5T')

    from datetime import datetime
    ts = v.get('requestTime', 0)
    time_str = datetime.fromtimestamp(ts/1000).strftime('%H:%M') if ts else ''

    # PDF 다운로드
    pdf_url = f'https://ls.coupang.com/linehaul/slip/generate?truckRequestId={tid}&locale=ko_KR'
    pdf_req = urllib.request.Request(pdf_url)
    pdf_req.add_header('Cookie', cookie_str)
    pdf_req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

    pdf_path = os.path.join(pdf_dir, f'{hoche}_slip.pdf')
    driver, phone = '', ''

    try:
        with urllib.request.urlopen(pdf_req, timeout=15) as response:
            pdf_data = response.read()
        with open(pdf_path, 'wb') as f:
            f.write(pdf_data)
        doc = fitz.open(pdf_path)
        text = '\n'.join([page.get_text() for page in doc])
        doc.close()
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        for idx, line in enumerate(lines):
            if line == '성함' and idx+1 < len(lines):
                driver = lines[idx+1]
            elif line == '연락처' and idx+2 < len(lines):
                p1 = lines[idx+1]; p2 = lines[idx+2]
                if p1.startswith('010'):
                    phone = p1+p2 if (p2.isdigit() or '-' in p2) else p1
                else:
                    phone = p1
        driver = driver.replace('\xa0','').strip()
        phone = phone.replace('\xa0','').replace(' ','').strip()
    except Exception as e:
        print(f'  ⚠️ {hoche}호차 PDF 파싱 실패: {e}')

    print(f'  {hoche}호차: {plate} / {driver} / {phone} / {ton} / {time_str}')
    vehicles.append({
        'hoche': hoche, 'plate': plate, 'driver': driver, 'name': driver,
        'phone': phone, 'ton': ton, 'time': time_str,
        'hub': '부천1 HUB', 'original_ton': ton,
    })

# VF 출차관리 POST
import urllib.request as ur2
req = ur2.Request('http://localhost:5176/departure/api/ls-data',
    data=json.dumps(vehicles).encode(),
    headers={'Content-Type': 'application/json'}, method='POST')
with ur2.urlopen(req, timeout=10) as resp:
    result = json.loads(resp.read())
print(f'[3/3] VF 출차관리 동기화 완료: {result.get(\"count\")}대')
"

echo "[완료] $DATE"
