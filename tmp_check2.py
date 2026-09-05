import re
src = open('frontend/client/src/pages/product-display.tsx', encoding='utf-8').read()
# L5/L6 sequence gap check
print('=== L5/L6 A_LOCNO_MAP sequence (line 727) ===')
raw = src.split('\n')[726]
# extract pairs of (slot, num) for L5 and L6 separately
import re
pairs = re.findall(r'"(L[56])-(\d+)":\s*(\d+)', raw)
pairs.sort(key=lambda x: (x[0], -int(x[1])))  # slot descending
for zone, slot, num in pairs:
    print(f'  {zone}-{slot} -> {num}')
print()
nums = {int(n) for _,_,n in pairs}
print(f'Numbers present: {sorted(nums)}')
print(f'Missing from 77..135: {[n for n in range(77,136) if n not in nums]}')
print(f'Gaps: ', end='')
sn = sorted(nums)
gaps = [sn[i+1]-sn[i] for i in range(len(sn)-1)]
print(f'step sizes: {set(gaps)}')