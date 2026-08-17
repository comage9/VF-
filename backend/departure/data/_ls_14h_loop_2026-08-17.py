# -*- coding: utf-8 -*-
import json, os, sys, time, urllib.request
from pathlib import Path

sys.path.insert(0, r'E:/coding/VF-new/backend')
import ls_automation as la

TODAY = '2026-08-17'
DATA = Path(r'E:/coding/VF-new/backend/departure/data')
TEMPLATES = [90626, 90628, 90269]

env = la.load_env()
ls_id = env.get('LS_ID') or env.get('LS_USERNAME')
ls_pw = env.get('LS_PASSWORD')
print('date', TODAY, 'user', ls_id)

JS_Q = "async () => { const today = '%s'; const url = 'https://ls.coupang.com/data/truckOrderTracking?page=0&pageSize=50&orderStartDate='+today+'&orderEndDate='+today+'&locationStart=VF67_H&statuses=SUBMITTED,CONFIRMED,CANCELED,BACK'; const r = await fetch(url, {credentials:'include', headers:{'Accept':'application/json'}}); const t = await r.text(); let j=null; try{j=JSON.parse(t);}catch(e){} return {status:r.status, snip:t.slice(0,200), total:(j&&j.data&&j.data.totalElements), count:(j&&j.data&&j.data.content&&j.data.content.length), items:(j&&j.data&&j.data.content)||[]};}" % TODAY

JS_C = "async () => { const today = '%s'; const urls = [ 'https://ls.coupang.com/truckOrder/templates/batch/creation/'+today, 'https://ls.coupang.com/data/truckOrder/templates/batch/creation/'+today ]; const out=[]; for (const url of urls) {  try {   const r = await fetch(url, {method:'POST', credentials:'include',     headers:{'Accept':'application/json','Content-Type':'application/json'},     body: JSON.stringify([90626,90628,90269])});   const t = await r.text();   out.push({url, status:r.status, snip:t.slice(0,250)});   if (r.status>=200 && r.status<300 && !t.startsWith('<!')) break;  } catch(e) { out.push({url, error:String(e)}); } } return out;}" % TODAY

result = {'date': TODAY, 'ok': False, 'templates': TEMPLATES}

from patchright.sync_api import sync_playwright

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
    ok_login = False
    for attempt in range(5):
        u = page.url
        names = [c['name'] for c in context.cookies()]
        print(attempt, u[:80], 'WEB' if 'WEB-GATEWAY-SESSION' in names else '-', len(names))
        if 'ls.coupang.com' in u and 'xauth' not in u and 'WEB-GATEWAY-SESSION' in names:
            ok_login = True
            break
        if page.locator('#username').count() > 0:
            try:
                page.fill('#username', ls_id)
                page.fill('#password', ls_pw)
                page.click('#kc-login')
            except Exception as e:
                print('login fill err', e)
        try:
            page.wait_for_url('**/ls.coupang.com/**', timeout=20000)
        except Exception:
            pass
        time.sleep(2)
        if 'xauth' in page.url and attempt >= 2:
            try:
                page.goto('https://ls.coupang.com/', timeout=30000)
                page.wait_for_load_state('networkidle', timeout=15000)
            except Exception as e:
                print('reload err', e)
    print('ok_login', ok_login, page.url[:120])
    result['login_url'] = page.url
    result['ok_login'] = ok_login
    q = page.evaluate(JS_Q) if ok_login else {'error': 'no login'}
    print('query', {k: q.get(k) for k in ('status','total','count','snip')} if isinstance(q, dict) else q)
    result['query'] = q
    cnt = (q or {}).get('count') or 0
    if cnt >= 3:
        result['ok'] = True
        result['message'] = 'already registered %s templates' % cnt
        result['action'] = 'skip_create_already_%s' % cnt
        result['orders'] = q.get('items', [])[:10]
    elif ok_login:
        c = page.evaluate(JS_C)
        print('create', c)
        result['create'] = c
        result['action'] = 'batch_create'
        time.sleep(3)
        q2 = page.evaluate(JS_Q)
        print('query2', {k: q2.get(k) for k in ('status','total','count','snip')} if isinstance(q2, dict) else q2)
        result['query2'] = q2
        cnt2 = (q2 or {}).get('count') or 0
        result['ok'] = cnt2 >= 1
        result['message'] = 'after create count=%s' % cnt2
        if cnt2 >= 1:
            result['orders'] = q2.get('items', [])[:10]
            norm = []
            for o in q2.get('items', []):
                ti = o.get('truckInfo') or {}
                norm.append({
                    'truckRequestId': o.get('truckRequestId'),
                    'templateId': o.get('truckOrderTemplateId'),
                    'plateNumber': ti.get('plateNumber') if isinstance(ti, dict) else None,
                    'driverName': ti.get('driverName') if isinstance(ti, dict) else None,
                    'driverPhone': ti.get('driverPhone') if isinstance(ti, dict) else None,
                    'requestTimeEpoch': o.get('requestTimeEpoch'),
                    'orderDate': o.get('orderDate') or TODAY,
                    'status': o.get('status'),
                })
            (DATA / ('ls_orders_%s.json' % TODAY)).write_text(json.dumps(norm, ensure_ascii=False, indent=2), encoding='utf-8')
    else:
        result['message'] = 'login failed'
    browser.close()

try:
    with urllib.request.urlopen('http://localhost:5176/departure/api/ls-data', timeout=5) as resp:
        vd = json.loads(resp.read())
        result['vf_api'] = 'up'
        result['vf_ls_data'] = '%s data=%s' % (vd.get('date'), len(vd.get('data') or []))
except Exception as e:
    result['vf_api'] = 'down %s' % e

out = DATA / ('ls_14h_loop_%s.json' % TODAY)
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print('FINAL', json.dumps(result, ensure_ascii=False)[:2000])
sys.exit(0 if result.get('ok') else 1)
