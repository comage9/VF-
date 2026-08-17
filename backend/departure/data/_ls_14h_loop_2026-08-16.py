# -*- coding: utf-8 -*-
import json, os, sys, time
from pathlib import Path
sys.path.insert(0, r'E:/coding/VF-new/backend')
import ls_automation as la
TODAY = '2026-08-16'
DATA = Path(r'E:/coding/VF-new/backend/departure/data')
la.load_env()
ls_id = os.environ.get('LS_USERNAME') or os.environ.get('LS_ID')
ls_pw = os.environ.get('LS_PASSWORD')
print('date', TODAY, 'user', ls_id)
from patchright.sync_api import sync_playwright
result = {'date': TODAY, 'ok': False}
JS_Q = "async () => { const today = '2026-08-16'; const url = 'https://ls.coupang.com/data/truckOrderTracking?page=0&pageSize=50&orderStartDate='+today+'&orderEndDate='+today+'&locationStart=VF67_H&statuses=SUBMITTED,CONFIRMED,CANCELED,BACK'; const r = await fetch(url, {credentials:'include', headers:{'Accept':'application/json'}}); const t = await r.text(); let j=null; try{j=JSON.parse(t);}catch(e){} return {status:r.status, snip:t.slice(0,200), total:(j&&j.data&&j.data.totalElements), count:(j&&j.data&&j.data.content&&j.data.content.length)};}"
JS_C = "async () => { const today = '2026-08-16'; const urls = [ 'https://ls.coupang.com/truckOrder/templates/batch/creation/'+today, 'https://ls.coupang.com/data/truckOrder/templates/batch/creation/'+today ]; const out=[]; for (const url of urls) {  try {   const r = await fetch(url, {method:'POST', credentials:'include',     headers:{'Accept':'application/json','Content-Type':'application/json'},     body: JSON.stringify([90626,90628,90269])});   const t = await r.text();   out.push({url, status:r.status, snip:t.slice(0,250)});   if (r.status>=200 && r.status<300 && !t.startsWith('<!')) break;  } catch(e) { out.push({url, error:String(e)}); } } return out;}"
with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, args=['--disable-blink-features=AutomationControlled', '--no-sandbox'])
    context = browser.new_context(viewport={'width': 1366, 'height': 900})
    page = context.new_page()
    page.goto('https://ls.coupang.com/', timeout=45000)
    page.wait_for_load_state('networkidle', timeout=25000)
    try:
        page.wait_for_selector('#username', timeout=15000)
    except Exception:
        pass
    if page.locator('#username').count() > 0:
        page.fill('#username', ls_id)
        page.fill('#password', ls_pw)
        page.click('#kc-login')
    ok_login = False
    for i in range(45):
        time.sleep(1)
        u = page.url
        names = [c['name'] for c in context.cookies()]
        print(i, u[:90], 'WEB' if 'WEB-GATEWAY-SESSION' in names else '-', len(names))
        if 'ls.coupang.com' in u and 'xauth' not in u and 'WEB-GATEWAY-SESSION' in names:
            ok_login = True
            break
        if page.locator('#username').count() > 0 and i in (8, 16, 24):
            page.fill('#username', ls_id)
            page.fill('#password', ls_pw)
            page.click('#kc-login')
    print('ok_login', ok_login, page.url[:120])
    result['login_url'] = page.url
    result['ok_login'] = ok_login
    q = page.evaluate(JS_Q) if ok_login else {'error': 'no login'}
    print('query', q)
    result['query'] = q
    cnt = (q or {}).get('count') or 0
    if cnt >= 3:
        result['ok'] = True
        result['message'] = 'already %s' % cnt
    elif ok_login:
        c = page.evaluate(JS_C)
        print('create', c)
        result['create'] = c
        time.sleep(2)
        q2 = page.evaluate(JS_Q)
        print('query2', q2)
        result['query2'] = q2
        cnt2 = (q2 or {}).get('count') or 0
        result['ok'] = cnt2 >= 1
        result['message'] = 'after create count=%s' % cnt2
    else:
        result['message'] = 'login failed'
    browser.close()
out = DATA / ('ls_14h_loop_%s.json' % TODAY)
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print('FINAL', json.dumps(result, ensure_ascii=False)[:2000])
sys.exit(0 if result.get('ok') else 1)
