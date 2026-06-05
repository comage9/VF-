#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GoClaw Vault 자동 업로드 스크립트 v2
VF 데이터를 GoClaw Vault에 자동 업로드

Usage:
  python upload_to_vault.py --file /path/to/file.csv --title "파일 제목"
  python upload_to_vault.py --all --vault-dir ~/goclaw_workspace/vault
"""
import os
import sys
import json
import argparse
import requests
from pathlib import Path

# GoClaw Gateway 설정
GOCLAW_HOST = os.environ.get('GOCLAW_HOST', 'http://localhost:18790')
VAULT_ENDPOINT = f'{GOCLAW_HOST}/v1/vault/upload'


def get_goclaw_token():
    """GoClaw config에서 token 가져오기"""
    return os.environ.get('GOCLAW_TOKEN', '')


def upload_file(filepath, title=None):
    """단일 파일을 GoClaw Vault에 업로드"""
    if not os.path.exists(filepath):
        print(f'❌ 파일 없음: {filepath}')
        return False
    
    token = get_goclaw_token()
    if not token:
        print('❌ GoClaw token이 설정되지 않음 (GOCLAW_TOKEN 환경변수)')
        return False
    
    filename = os.path.basename(filepath)
    if title is None:
        title = filename
    
    # MIME 타입 결정
    ext = os.path.splitext(filepath)[1].lower()
    mime_types = {
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.pdf': 'application/pdf',
        '.txt': 'text/plain',
    }
    mime_type = mime_types.get(ext, 'application/octet-stream')
    
    try:
        with open(filepath, 'rb') as f:
            file_content = f.read()
        
        # FormData 형식으로 여러 파일 전송
        # files 파라미터가 배열로 여러 번 올 수 있음
        form_data = []
        form_data.append(('files', (filename, file_content, mime_type)))
        
        headers = {'Authorization': f'Bearer {token}'}
        
        response = requests.post(
            VAULT_ENDPOINT,
            files=form_data,
            headers=headers,
            timeout=120
        )
        
        if response.status_code == 200:
            print(f'✅ 업로드 완료: {filename}')
            result = response.json()
            if isinstance(result, dict):
                count = result.get('count', 0)
                print(f'   {count}개 문서 업로드됨')
            return True
        else:
            print(f'❌ 업로드 실패: {response.status_code}')
            print(f'   응답: {response.text[:300]}')
            return False
            
    except Exception as e:
        print(f'❌ 업로드 오류: {str(e)}')
        return False


def upload_directory(vault_dir, prefix=''):
    """디렉토리 내 모든 파일 업로드"""
    if not os.path.exists(vault_dir):
        print(f'❌ 디렉토리 없음: {vault_dir}')
        return
    
    files = sorted(Path(vault_dir).glob('*'))
    if not files:
        print('⚠️ 업로드할 파일 없음')
        return
    
    print(f'📁 {len(files)}개 파일 발견')
    
    success = 0
    for f in files:
        if f.is_file():
            title = f'{prefix} {f.stem}' if prefix else f.stem
            if upload_file(str(f), title):
                success += 1
    
    print(f'\n📊 결과: {success}/{len(files)}개 성공')


def main():
    parser = argparse.ArgumentParser(description='GoClaw Vault 자동 업로드 v2')
    parser.add_argument('--file', '-f', help='업로드할 파일 경로')
    parser.add_argument('--title', '-t', help='Vault에서의 제목')
    parser.add_argument('--all', '-a', action='store_true', help='디렉토리 내 모든 파일')
    parser.add_argument('--vault-dir', '-d', default='~/goclaw_workspace/vault', help='Vault 디렉토리')
    parser.add_argument('--prefix', '-p', default='VF', help='파일 제목 접두사')
    parser.add_argument('--token', help='GoClaw token')
    
    args = parser.parse_args()
    
    # token 설정
    if args.token:
        os.environ['GOCLAW_TOKEN'] = args.token
    
    token = get_goclaw_token()
    if not token:
        print('❌ GOCLAW_TOKEN 환경변수가 필요합니다')
        print('   export GOCLAW_TOKEN="your-token"')
        return
    
    if args.file:
        upload_file(args.file, args.title)
    elif args.all:
        vault_dir = os.path.expanduser(args.vault_dir)
        upload_directory(vault_dir, args.prefix)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()