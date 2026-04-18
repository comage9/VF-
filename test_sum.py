# 1부터 10까지 합계 계산

total = sum(range(1, 11))
print(f"1부터 10까지의 합: {total}")

# 또는 for 루프 버전
total_loop = 0
for i in range(1, 11):
    total_loop += i

print(f"for 루프로 계산한 합: {total_loop}")
