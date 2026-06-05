#!/usr/bin/env python3
"""
NotebookLM 분석 결과를 VF 백엔드에 저장
사용법: python save_notebooklm_analysis.py --date 2026-04-24 --period daily
"""

import sys
import os
import argparse
import subprocess
import json
import requests

# VF API 설정
VF_API_BASE = "http://localhost:5176/api"

NOTEBOOK_ID = "bcbdf7fa-7931-447f-87c6-33a2050ed48c"

def query_notebooklm(prompt: str) -> str:
    """NotebookLM에 분석 질의"""
    result = subprocess.run([
        'nlm', 'notebook', 'query', NOTEBOOK_ID, prompt
    ], capture_output=True, text=True, timeout=300)
    
    if result.returncode != 0:
        raise Exception(f"NotebookLM query failed: {result.stderr}")
    
    return result.stdout

def parse_analysis(text: str) -> dict:
    """NotebookLM 응답을 분석 데이터로 파싱"""
    # 간단한 JSON 파싱 시도
    try:
        # Markdown 형식에서 JSON 추출
        import re
        json_match = re.search(r'\{[\s\S]+\}', text)
        if json_match:
            return json.loads(json_match.group())
    except:
        pass
    
    # 실패 시 텍스트 그대로 반환
    return {
        "raw_text": text[:5000],  # 처음 5000자만
        "summary": extract_summary(text),
        "insights": extract_insights(text),
    }

def extract_summary(text: str) -> dict:
    """요약 추출"""
    return {"total_text_length": len(text)}

def extract_insights(text: str) -> list:
    """인사이트 추출"""
    insights = []
    lines = text.split('\n')
    for line in lines:
        if '💡' in line or '인사이트' in line or 'Insight' in line:
            insights.append(line.strip()[:500])
    return insights[:5]  # 최대 5개

def save_to_vf(data: dict) -> bool:
    """VF 백엔드에 저장"""
    url = f"{VF_API_BASE}/analytics/list"
    try:
        response = requests.post(url, json=data, timeout=10)
        result = response.json()
        return result.get('success', False)
    except Exception as e:
        print(f"VF API save failed: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='NotebookLM 분석 결과를 VF에 저장')
    parser.add_argument('--date', default='2026-04-24', help='분석 기준일')
    parser.add_argument('--period', default='daily', choices=['daily', 'weekly', 'monthly'])
    parser.add_argument('--prompt', help='사용자 정의 프롬프트')
    
    args = parser.parse_args()
    
    # 기본 프롬프트
    default_prompt = f"""
2026년 {args.date} 출고 데이터를 분석해줘:
1. 일별 출고량 합계
2. 전일 대비 증감
3. 급증/급감 품목 3개
4. 재고 부족 예상 품목
5. 주요 인사이트 3~5개
6. 권장 액션 2~3개

JSON 형식으로 반환해줘.
"""
    
    prompt = args.prompt or default_prompt
    
    print(f"1. NotebookLM 분석 질의 중... (date={args.date}, period={args.period})")
    result_text = query_notebooklm(prompt)
    
    print(f"2. 분석 결과 파싱 중...")
    analysis_data = parse_analysis(result_text)
    
    print(f"3. VF 백엔드에 저장 중...")
    data = {
        'date': args.date,
        'period': args.period,
        'summary': analysis_data.get('summary', {}),
        'chart_data': analysis_data.get('chart_data', {}),
        'table_data': analysis_data.get('table_data', {}),
        'insights': analysis_data.get('insights', []),
        'recommendations': analysis_data.get('recommendations', []),
        'source_ids': [],
    }
    
    success = save_to_vf(data)
    
    if success:
        print("✅ VF 백엔드에 저장 완료!")
    else:
        print("❌ 저장 실패")
        sys.exit(1)

if __name__ == "__main__":
    main()
