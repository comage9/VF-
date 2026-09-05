import re
src = open('frontend/client/src/pages/product-display.tsx', encoding='utf-8').read()

# Show the L1-1 entry in A_LOCNOS_MAP to verify
i = src.index('const A_LOCNOS_MAP')
j = src.index('};', i)
seg = src[i:j]
l1_1 = re.search(r'"L1-1"\s*:\s*\[([^\]]+)\]', seg)
print('A_LOCNOS_MAP L1-1:', l1_1.group() if l1_1 else 'NOT FOUND')

# Check if L1-1 is in any other mapping
print('L1-1 anywhere after A_LOCNO_MAP:', 'L1-1"' in src[src.index('const A_LOCNO_MAP'):])

# Show actual number sequence for L1/L2 pair
print()
print('L1/L2 actual mapped numbers (line 715-717):')
raw = src.split('\n')[714:717]
for r in raw:
    print(' ', r[:300])

# Check 38 boundary: is there a locNo for L1-1 from A_LOCNOS_MAP?
print()
print('L1-1 in A_LOCNOS_MAP value:', l1_1.group(1) if l1_1 else 'NONE')

# Since A_LOCNOS_MAP has L1-1, builder sets locNo = aLocNos[0] for L1-1
# But A_LOCNO_MAP doesn't have L1-1... wait which one wins?
# Builder line 536: 
#   locNo: (aLocNos && aLocNos.length > 0) ? aLocNos[0] : (aLocNo ?? undefined),
# So LOCNOS_MAP wins over LOCNO_MAP
# But what is the value? Let's check
print()
print('From earlier script output: A_LOCNOS_MAP had L1-1 in it (key present)')
print('But we need the actual value')

i2 = src.index('const A_LOCNOS_MAP')
j2 = src.index('};', i2)
seg2 = src[i2:j2]
print(seg2[:100])