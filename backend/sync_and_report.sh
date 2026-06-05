#!/bin/bash
cd /home/comage/coding/VF-/backend
/home/comage/coding/VF-/backend/.venv/bin/python sync_all.py >> /tmp/vf-sync.log 2>&1

# 옵시디언 생산계획 업데이트
curl -s "http://bonohouse.p-e.kr:5176/api/production" | python3 -c "
import json,sys
from collections import defaultdict
d=json.load(sys.stdin)
items=d.get('results',{}).get('latestData',[])
by_date=defaultdict(list)
for i in items:
    by_date[i.get('date','')].append(i)
lines=['# 생산계획 최신 데이터\n']
lines.append(f'> 총 {len(items)}건 | 최근 업데이트: 자동 동기화\n')
for date in sorted(by_date.keys(), reverse=True):
    lines.append(f'## {date}')
    for r in by_date[date]:
        status = r.get('status','')
        icon = {'pending':'⏳','in_progress':'🔄','completed':'✅','cancelled':'❌'}.get(status,'')
        lines.append(f'- {icon} 기계{r.get(\"machine_number\",\"?\")} | 금형{r.get(\"mold_number\",\"?\")} | {r.get(\"product_name\",\"\")} ({r.get(\"color1\",\"\")}) | {r.get(\"quantity\",0)}개')
with open('/home/comage/obsidian-vault/02-금형정보/생산계획-최신.md','w') as f:
    f.write('\n'.join(lines))
" >> /tmp/vf-sync.log 2>&1

# 옵시디언 git push
cd /home/comage/obsidian-vault && git add -A && git commit -m "자동: 생산계획 업데이트" && git push origin main >> /tmp/vf-sync.log 2>&1
