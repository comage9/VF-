#!/bin/bash
# ============================================================================
# 옵시디언 빈 파일 정리 스크립트
# 날짜만 있는 파일, 내용 없는 파일 정리
# ============================================================================

WORKSPACE="/home/comage/.openclaw/workspace/memory"
LOG_FILE="/tmp/obsidian_clean_log.txt"

echo " 옵시디언 파일 정리 시작 - $(date)" > "$LOG_FILE"

# 1. 날짜 파일 확인 및 정리
echo "" >> "$LOG_FILE"
echo "=== 날짜 파일 정리 ===" >> "$LOG_FILE"

for file in $WORKSPACE/2026-*.md; do
  if [ -f "$file" ]; then
    filename=$(basename "$file")
    # 날짜 추출 (예: 2026-04-06)
    date_part=$(echo "$filename" | cut -d'-' -f1-3)
    
    # 내용 확인
    content_lines=$(grep -v "^# " "$file" | grep -v "^$" | wc -l)
    
    if [ "$content_lines" -eq 0 ]; then
      echo "빈 파일 발견: $filename (내용: 0 줄)" >> "$LOG_FILE"
      
      # 날짜 기반 제목 생성
      new_title="$date_part 메모"
      if grep -q "세션로그" "$filename"; then
        new_title="$date_part 세션로그"
      elif grep -q "코드" "$filename" || grep -q "리뷰" "$filename"; then
        new_title="$date_part 코드/리뷰"
      elif grep -q "API" "$filename"; then
        new_title="$date_part API"
      elif grep -q "에이전트" "$filename"; then
        new_title="$date_part 에이전트"
      fi
      
      # 새 파일 이름 생성
      new_name="${date_part}-${new_title}".md
      
      # 기존 파일 내용 확인 후 정리
      echo "" >> "$LOG_FILE"
      echo "  - 원본: $filename" >> "$LOG_FILE"
      echo "  - 변경: $new_name" >> "$LOG_FILE"
      
      # 파일명 변경 (내용이 있으면 정리)
      if [ "$content_lines" -gt 0 ]; then
        mv "$file" "$WORKSPACE/$new_name" 2>/dev/null
        echo "  ✓ 파일명 변경 완료" >> "$LOG_FILE"
      else
        # 내용이 없으면 삭제하거나 템플릿으로 교체
        cat > "$WORKSPACE/$new_name" << EOF
# $new_title

## 개요
- 날짜: $date_part
- 상태: 빈 파일 (내용 필요)

## TODO
- [ ] 내용 추가 필요

---
*이 파일은 정리 대상이었으며, 템플릿으로 재생성되었습니다.*
*재생성: $(date "+%Y-%m-%d %H:%M:%S")*
EOF
        rm -f "$file"
        echo "  ✓ 빈 파일 삭제 및 재생성" >> "$LOG_FILE"
      fi
      echo "" >> "$LOG_FILE"
    fi
  fi
done

# 2. 날짜 파일 정리가 끝났음을 알리는 로그
echo "" >> "$LOG_FILE"
echo "=== 정리 완료 ===" >> "$LOG_FILE"
date >> "$LOG_FILE"

echo "파일 정리 완료! 로그 확인: $LOG_FILE"
cat "$LOG_FILE"
