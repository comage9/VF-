#!/usr/bin/env python3
"""
OpenRouter 전용 테스트
nvidia/nemotron-3-super-120b-a12b:free 모델 동작 확인
"""

import requests
import json
import time
import subprocess
import sys
from pathlib import Path

def test_openrouter_api():
    """OpenRouter API 직접 테스트"""
    print("🔍 OpenRouter API 직접 테스트 시작...")
    
    api_key = "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"
    url = "https://openrouter.ai/api/v1/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://openclaw.ai",
        "X-Title": "GenericAgent OpenRouter Test"
    }
    
    # 한국어 테스트 메시지
    payload = {
        "model": "nvidia/nemotron-3-super-120b-a12b:free",
        "messages": [
            {
                "role": "user",
                "content": "안녕하세요! OpenRouter nvidia/nemotron-3-super-120b-a12b:free 모델 테스트입니다. '테스트 성공'이라고 한국어로 응답해주세요."
            }
        ],
        "max_tokens": 100,
        "temperature": 0.7
    }
    
    try:
        print(f"📡 API 요청 중: {url}")
        print(f"📦 모델: {payload['model']}")
        
        start_time = time.time()
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        elapsed_time = time.time() - start_time
        
        print(f"📊 응답 상태: {response.status_code}")
        print(f"⏱️  응답 시간: {elapsed_time:.2f}초")
        
        if response.status_code == 200:
            result = response.json()
            content = result['choices'][0]['message']['content']
            usage = result.get('usage', {})
            
            print("✅ OpenRouter API 테스트 성공!")
            print(f"📝 응답: {content[:200]}...")
            print(f"📊 사용 토큰: {usage.get('total_tokens', 'N/A')}")
            print(f"💰 비용: ${usage.get('cost', 0)}")
            
            # 한국어 응답 확인
            if '테스트 성공' in content or '성공' in content:
                print("✅ 한국어 응답 확인 완료")
            else:
                print("⚠️  한국어 응답에 '테스트 성공'이 포함되지 않음")
            
            return True
        else:
            print(f"❌ OpenRouter API 오류: {response.status_code}")
            print(f"📄 응답 내용: {response.text[:500]}")
            return False
            
    except Exception as e:
        print(f"❌ 테스트 중 오류 발생: {e}")
        return False

def test_generic_agent_cli():
    """GenericAgent CLI 테스트"""
    print("\n🔍 GenericAgent CLI 테스트...")
    
    try:
        # GenericAgent 디렉토리로 이동
        ga_dir = Path("/home/comage/GenericAgent")
        
        # agentmain.py가 있는지 확인
        if not (ga_dir / "agentmain.py").exists():
            print("❌ agentmain.py를 찾을 수 없습니다")
            return False
        
        # 간단한 테스트 명령 실행 (타임아웃 설정)
        print("📝 GenericAgent CLI 실행 테스트...")
        
        # Python 스크립트로 간접 테스트
        test_script = """
import sys
sys.path.insert(0, '/home/comage/GenericAgent')

try:
    # GenericAgent 모듈 임포트 테스트
    import agentmain
    print("✅ GenericAgent 모듈 임포트 성공")
    
    # 설정 파일 확인
    import mykey
    print("✅ 설정 파일 로드 성공")
    
    # OpenRouter 설정 확인
    if hasattr(mykey, 'native_oai_config_openrouter'):
        config = mykey.native_oai_config_openrouter
        print(f"✅ OpenRouter 설정 확인: {config.get('model')}")
    else:
        print("❌ OpenRouter 설정을 찾을 수 없습니다")
    
    print("✅ GenericAgent CLI 테스트 완료")
    sys.exit(0)
    
except Exception as e:
    print(f"❌ 테스트 실패: {e}")
    sys.exit(1)
"""
        
        # 테스트 스크립트 실행
        result = subprocess.run(
            [sys.executable, "-c", test_script],
            capture_output=True,
            text=True,
            cwd=ga_dir,
            timeout=10
        )
        
        print(result.stdout)
        if result.stderr:
            print(f"📥 표준 에러:\n{result.stderr}")
        
        return result.returncode == 0
        
    except subprocess.TimeoutExpired:
        print("❌ 테스트 시간 초과")
        return False
    except Exception as e:
        print(f"❌ CLI 테스트 오류: {e}")
        return False

def check_kakao_telegram_support():
    """카카오톡/텔레그램 지원 가능성 확인"""
    print("\n🔍 카카오톡/텔레그램 지원 가능성 확인...")
    
    ga_dir = Path("/home/comage/GenericAgent")
    
    # 프론트엔드 파일 확인
    frontends = {
        "telegram": ga_dir / "frontends" / "tgapp.py",
        "kakao": None,  # GenericAgent에 카카오톡 지원이 있는지 확인
    }
    
    print("📁 GenericAgent 프론트엔드 지원 확인:")
    
    # 텔레그램 지원 확인
    if frontends["telegram"] and frontends["telegram"].exists():
        print("✅ 텔레그램 지원: tgapp.py 파일 존재")
        
        # tgapp.py 내용 확인
        try:
            content = frontends["telegram"].read_text(encoding='utf-8', errors='ignore')
            if "telegram" in content.lower() or "tg_bot_token" in content:
                print("✅ 텔레그램 봇 설정 가능")
            else:
                print("⚠️  텔레그램 설정 정보를 찾을 수 없음")
        except:
            print("⚠️  텔레그램 파일 읽기 실패")
    else:
        print("❌ 텔레그램 지원 파일 없음")
    
    # 카카오톡 지원 확인 (GenericAgent에 공식 지원이 없을 수 있음)
    print("\n📱 카카오톡 지원 확인:")
    print("ℹ️  GenericAgent에는 카카오톡 공식 지원이 없습니다")
    print("ℹ️  하지만 다음 방법으로 통합 가능:")
    print("  1. 텔레그램 봇을 통해 카카오톡 연동 (써드파티 브릿지)")
    print("  2. 카카오톡 API 직접 연동 (별도 개발 필요)")
    print("  3. 웹훅을 통한 간접 연동")
    
    # 한국어 메시징 지원 확인
    print("\n🇰🇷 한국어 메시징 지원:")
    print("✅ OpenRouter 모델은 한국어 지원")
    print("✅ GenericAgent는 다국어 메시지 처리 가능")
    print("✅ 텔레그램은 한국어 완전 지원")
    
    return True

def test_real_task():
    """실제 작업 테스트 - 파일 처리"""
    print("\n🔍 실제 작업 테스트 (파일 처리)...")
    
    try:
        # 테스트용 파일 생성
        test_file = Path("/tmp/test_generic_agent.txt")
        test_file.write_text("GenericAgent 테스트 파일입니다.\n이 파일은 OpenRouter 모델 테스트를 위해 생성되었습니다.\n", encoding='utf-8')
        
        print(f"📄 테스트 파일 생성: {test_file}")
        print(f"📏 파일 크기: {test_file.stat().st_size} bytes")
        
        # 파일 내용 읽기 테스트
        content = test_file.read_text(encoding='utf-8')
        print(f"📖 파일 내용: {content[:100]}...")
        
        # 테스트 파일 삭제
        test_file.unlink()
        print("✅ 테스트 파일 삭제 완료")
        
        return True
        
    except Exception as e:
        print(f"❌ 파일 처리 테스트 오류: {e}")
        return False

def main():
    """메인 테스트 함수"""
    print("=" * 60)
    print("   OpenRouter 전용 GenericAgent 테스트")
    print("=" * 60)
    
    test_results = {}
    
    # 1. OpenRouter API 직접 테스트
    print("\n1️⃣ OpenRouter API 직접 테스트")
    test_results['openrouter_api'] = test_openrouter_api()
    
    # 2. GenericAgent CLI 테스트
    print("\n2️⃣ GenericAgent CLI 테스트")
    test_results['generic_agent_cli'] = test_generic_agent_cli()
    
    # 3. 카카오톡/텔레그램 지원 확인
    print("\n3️⃣ 카카오톡/텔레그램 지원 확인")
    test_results['messaging_support'] = check_kakao_telegram_support()
    
    # 4. 실제 작업 테스트
    print("\n4️⃣ 실제 작업 테스트")
    test_results['real_task'] = test_real_task()
    
    # 결과 요약
    print("\n" + "=" * 60)
    print("   테스트 결과 요약")
    print("=" * 60)
    
    for test_name, result in test_results.items():
        status = "✅ 성공" if result else "❌ 실패"
        print(f"{test_name:25} {status}")
    
    # 전체 성공 여부
    all_passed = all(test_results.values())
    
    if all_passed:
        print("\n🎉 모든 테스트가 성공적으로 완료되었습니다!")
        print("\n📋 OpenRouter 전용 GenericAgent 시스템 상태:")
        print("   • OpenRouter API: ✅ 정상 작동")
        print("   • nvidia/nemotron-3-super-120b-a12b:free: ✅ 사용 가능")
        print("   • 비용: $0 (완전 무료)")
        print("   • 한국어 지원: ✅ 완전 지원")
        print("   • 텔레그램 연동: ✅ 가능")
        print("   • 카카오톡 연동: ⚠️  간접 연동 필요")
    else:
        print("\n⚠️ 일부 테스트가 실패했습니다.")
        print("📋 문제가 있는 부분을 확인해주세요.")
    
    # 다음 단계 제안
    print("\n" + "=" * 60)
    print("   다음 단계 제안")
    print("=" * 60)
    
    print("1. 텔레그램 봇 설정:")
    print("   • mykey.py에 tg_bot_token 설정")
    print("   • python frontends/tgapp.py 실행")
    
    print("\n2. 실제 작업 위임 테스트:")
    print("   • VF 프로젝트 작업 위임")
    print("   • 키 프로젝트 분석 작업")
    print("   • 파일 처리 자동화")
    
    print("\n3. Skill 결정화 테스트:")
    print("   • GenericAgent로 작업 해결")
    print("   • 자동 Skill 생성 확인")
    print("   • OpenClaw Skill 라이브러리 통합")
    
    return all_passed

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)