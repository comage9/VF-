import re
src = open('frontend/client/src/pages/product-display.tsx', encoding='utf-8').read()
lines = src.split('\n')
print('L1-1 in A_LOCNO_MAP:', 'L1-1"' in src[src.index('const A_LOCNO_MAP'):src.index('const A_LOCNOS_MAP')])
print('L1-1 in A_LOCNOS_MAP:', 'L1-1"' in src[src.index('const A_LOCNOS_MAP'):])
print('L2-1=38 at line 716:', lines[715][:200])
print()

# Rule 1: 38 boundary
print('=== Rule 1 (38 boundary) ===')
print('L2-1 = 38 (correct), L1-1 missing -> 37 gap')
print()
# Rule 2: multi-item numbers
print('=== Rule 2 (multi-item individual numbers) ===')
print('A_LOCNOS_MAP has 30 multi-entries defined (line 735):')
print('  L4-16: [72,73] -> 111,115 -> 111 gets 73? No, order is 72,73 so first=72')
print('  L3-16: [74,75] -> 241,246 -> first=241 gets 74')
print('  But lower pnum=lower locNo: 111<115 so 111 should get lower number.')
print('  A_LOCNOS_MAP L4-16 = [72,73] means 72 assigned first (115), 73 second (111)')
print('  This depends on data order: if storage says "115,111" then 115 gets 72')
print('  RULE: lower pnum gets lower locNo. Check live data order.')
print()

# Rule 3: increment by 1
print('=== Rule 3 (increment by 1 across/neighbor) ===')
print('L5 series in A_LOCNO_MAP (line 727):')
s = src[src.index('L5-19'):]
s = s[:200]
print(s)
seqs = re.findall(r'L5-(\d+):\s*(\d+)', src[src.index('"L5-19"'):src.index('"L7-1"')])
for k,v in seqs:
    print(f'  L5-slot{k} -> {v}')