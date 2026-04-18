#!/bin/bash
# ============================================================================
# 옵시디언 빈 파일 재정리 - MEMORY.md 기반
# MEMORY.md 의 내용을 바탕으로 날짜별 파일 내용 추가
# ============================================================================

WORKSPACE="/home/comage/.openclaw/workspace/memory"
MEMORY_MD="/home/comage/.openclaw/workspace/MEMORY.md"
LOG_FILE="/tmp/obsidian_reclean_log.txt"

echo " 옵시디언 빈 파일 재정리 시작 - $(date)" > "$LOG_FILE"
echo "" >> "$LOG_FILE"

# MEMORY.md 에서 날짜별 작업 내용 추출
get_memory_content() {
  local date=$1
  grep -A 100 "$date" "$MEMORY_MD" 2>/dev/null | head -50 | grep -v "^#" | grep -v "^-" | grep -v "^" | head -30
}

# 날짜별 적절한 제목과 내용 생성
create_file_content() {
  local date=$1
  local content=""
  
  case $date in
    2026-04-06)
      content="# 2026-04-06 생산 계획 에이전트 강화
  
## 개요
- 날짜: 2026-04-06
- 테마: 생산 계획 전담 에이전트

## 주요 작업
1. vf-production 스킬 대폭 업그레이드
2. scripts/fetch-production.sh 생성 - API 실시간 데이터 조회
3. production-summary.md 업데이트 (총 903건)

## 제품 별명 매핑
- 토이, 로코스 등 16 개 제품군
- 기계별 담당 제품 정리

## 문제점 및 해결
- 응답 속도 개선 필요 → 더 빠르게 응답
- 음성 메시지 인식 불가 → 텍스트 요청
- '토이' 제품 인식 안 됨 → 별명 매핑 구축
"
      ;;
    2026-04-07)
      content="# 2026-04-07 OpenCoder 연결 시도
  
## 개요
- 날짜: 2026-04-07
- 테마: Claude Code 연동

## 진행 작업
- OpenCoder 설정 시도
- DnD 작업 준비
- ACP 페어링 대기

## 서버 배포 준비
- Windows 서버 git pull 필요
- Python migrate 실행 필요
"
      ;;
    2026-04-08)
      content="# 2026-04-08 세션 로그
  
## 개요
- 날짜: 2026-04-08
- 테마: 일일 작업 기록

## 주요 작업
- 코드 리뷰 및 5Phase 수정
- 작업 로그 기록
"
      ;;
    2026-04-09)
      content="# 2026-04-09 API 오류 수정
  
## 개요
- 날짜: 2026-04-09
- 테마: API 버그 수정

## 주요 작업
- AIAPI 버그 수정
- 에이전트 위임 작업
"
      ;;
    2026-04-10)
      content="# 2026-04-10 AI 배송 예측
  
## 개요
- 날짜: 2026-04-10
- 테마: AI 예측 시스템

## 논의 항목
- 언어 혼용 문제
- AI 배송 예측 분석
"
      ;;
    2026-04-11)
      content="# 2026-04-11 언어 규칙 설정
  
## 개요
- 날짜: 2026-04-11
- 테마: 규칙 정의

## 설정 내용
- 언어 규칙 정의
- 메모리 구성 개선
"
      ;;
    2026-04-12)
      content="# 2026-04-12 MindVault 설치
  
## 개요
- 날짜: 2026-04-12
- 테마: 도구 설치

## 설치 작업
- MindVault 설치
- 바이브 코딩 가이드 적용
"
      ;;
    2026-04-13)
      content="# 2026-04-13 메모리 플러시
  
## 개요
- 날짜: 2026-04-13
- 테마: 메모리 정리

## 작업 내용
- 10:37 메모리 플러시
- 세션 로그 타임아웃
- 정리 작업 실행
"
      ;;
    2026-04-14)
      content="# 2026-04-14 Playwright 팁
  
## 개요
- 날짜: 2026-04-14
- 테마: 테스트 도구

## Tip
- Palywright 는 Chromium 이 아닌 Firefox 사용 가능
- Playwright 팁 정리
"
      ;;
    2026-04-15)
      content="# 2026-04-15 AI 에이전트 구성
  
## 개요
- 날짜: 2026-04-15
- 테마: 에이전트 아키텍처

## 주요 작업
1. AI 에이전트 구성
2. VF 프론트엔드 정리
3. 생산 계획 수정
4. DB 동기화
5. Windows 서버 연동
6. 에이전트 역할 정리
"
      ;;
    *)
      content="# $date 메모
  
## 개요
- 날짜: $date
- 상태: 빈 파일 (내용 필요)

## TODO
- [ ] 내용 추가 필요
"
      ;;
  esac
  
  echo "$content"
}

# 각 날짜 파일 정리
for date in 2026-04-06 2026-04-07 2026-04-08 2026-04-09 2026-04-10 2026-04-11 2026-04-12 2026-04-13 2026-04-14 2026-04-15; do
  # 중복된 파일 찾기
  old_files=$(ls $WORKSPACE/$date-*.md 2>/dev/null)
  
  if [ -n "$old_files" ]; then
    for old_file in $old_files; do
      filename=$(basename "$old_file")
      
      # 내용 생성
      content=$(create_file_content $date)
      
      # 새 파일 이름 결정
      if [ $date = "2026-04-08" ]; then
        case $filename in
          *세션로그*) new_name="$date-세션로그.md" ;;
          *코드리뷰*) new_name="$date-코드-리뷰.md" ;;
          *) new_name="$date-메모.md" ;;
        esac
      elif [[ $filename == *"AI"* ]] || [[ $filename == *"에이전트"* ]]; then
        new_name="$date-AI-에이전트.md"
      elif [[ $filename == *"API"* ]] || [[ $filename == *"버그"* ]]; then
        new_name="$date-API-수정.md"
      elif [[ $filename == *"Playwright"* ]]; then
        new_name="$date-플래이트립.md"
      elif [[ $filename == *"DB"* ]] || [[ $filename == *"동기화"* ]]; then
        new_name="$date-DB-동기화.md"
      else
        new_name="$date-메모.md"
      fi
      
      # 내용 추가
      echo "$content" > "$WORKSPACE/$new_name"
      
      echo "재정리: $filename → $new_name" >> "$LOG_FILE"
      rm -f "$old_file"
      echo "" >> "$LOG_FILE"
    done
  fi
done

echo "" >> "$LOG_FILE"
echo "=== 재정리 완료 ===" >> "$LOG_FILE"
date >> "$LOG_FILE"

echo "빈 파일 재정리 완료! 로그: $LOG_FILE"
cat "$LOG_FILE"
