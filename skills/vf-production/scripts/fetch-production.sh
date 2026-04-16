#!/bin/bash
# VF 보노하우스 생산 계획 데이터 조회 스크립트
# Usage: fetch-production.sh [command] [args]
# Commands:
#   today          - 오늘 생산 계획
#   date YYYY-MM-DD - 특정 날짜 생산 계획
#   product <name>  - 제품명 검색 (토이, 로코스, 모던플러스 등)
#   machine <num>   - 기계번호별 조회
#   specs           - 전체 마스터 스펙
#   summary         - 전체 요약

API="http://bonohouse.p-e.kr:5174/api"
TMP="/tmp/vf-production-data.json"

fetch_production() {
  curl -s "$API/production" -o "$TMP"
  echo "$TMP"
}

case "${1:-summary}" in
  today)
    TODAY=$(date +%Y-%m-%d)
    fetch_production >/dev/null
    echo "=== $TODAY 생산 계획 ==="
    jq --arg d "$TODAY" '[.data[] | select(.date == $d)]' "$TMP" 2>/dev/null || cat "$TMP"
    ;;
  date)
    fetch_production >/dev/null
    echo "=== $2 생산 계획 ==="
    jq --arg d "$2" '[.data[] | select(.date == $d)]' "$TMP" 2>/dev/null || cat "$TMP"
    ;;
  product)
    fetch_production >/dev/null
    echo "=== 제품 검색: $2 ==="
    jq --arg p "$2" '[.data[] | select((.productName // "") | test($p; "i"))]' "$TMP" 2>/dev/null || cat "$TMP"
    ;;
  machine)
    fetch_production >/dev/null
    echo "=== 기계 $2번 생산 계획 ==="
    jq --arg m "$2" '[.data[] | select(.machineNumber == $m)]' "$TMP" 2>/dev/null || cat "$TMP"
    ;;
  specs)
    curl -s "$API/master/specs" | jq . 2>/dev/null || curl -s "$API/master/specs"
    ;;
  latest)
    fetch_production >/dev/null
    LATEST=$(jq -r '.latestDate' "$TMP" 2>/dev/null)
    echo "=== 최신($LATEST) 생산 계획 ==="
    jq --arg d "$LATEST" '[.data[] | select(.date == $d)]' "$TMP" 2>/dev/null || cat "$TMP"
    ;;
  summary|*)
    fetch_production >/dev/null
    echo "=== 생산 계획 요약 ==="
    echo "최신 날짜: $(jq -r '.latestDate' "$TMP" 2>/dev/null)"
    echo "총 레코드: $(jq '.data | length' "$TMP" 2>/dev/null)"
    echo "날짜 범위: $(jq -r '[.data[].date] | sort | first' "$TMP" 2>/dev/null) ~ $(jq -r '[.data[].date] | sort | last' "$TMP" 2>/dev/null)"
    echo ""
    echo "=== 기계별 제품 ==="
    jq '[.data | group_by(.machineNumber) | .[] | {machine: .[0].machineNumber, products: [.[].productName] | unique}] | sort_by(.machine | tonumber? // 99)' "$TMP" 2>/dev/null
    ;;
esac
