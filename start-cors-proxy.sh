#!/bin/bash

# CORS 프록시 서버 시작 스크립트

echo "🚀 CORS 프록시 서버 시작 중..."
echo ""

# Node.js 설치 확인
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되지 않았습니다."
    exit 1
fi

# 의존성 확인
if [ ! -d "node_modules" ]; then
    echo "📦 의존성 설치 중..."
    npm install express cors http-proxy-middleware
fi

# 프록시 서버 시작
echo "✅ CORS 프록시 서버 시작..."
node cors-proxy-server.js