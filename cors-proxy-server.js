/**
 * 자체 CORS 프록시 서버
 * Google Sheets 403 에러 해결을 위한 로컬 프록시
 */

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// CORS 설정
app.use(cors({
  origin: '*', // 개발 환경에서는 모든 origin 허용
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 요청 로깅
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 프록시 미들웨어 설정
const proxy = createProxyMiddleware({
  target: 'https://docs.google.com',
  changeOrigin: true,
  secure: true, // HTTPS 사용
  followRedirects: true, // 리다이렉트 따라가기
  onProxyReq: (proxyReq, req, res) => {
    // User-Agent 설정으로 Google Sheets 차단 회피
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // 필요한 헤더 설정
    proxyReq.setHeader('Accept', 'text/csv,application/json,*/*');
    proxyReq.setHeader('Accept-Language', 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7');

    console.log(`[PROXY] Requesting: ${proxyReq.path}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`[PROXY] Response: ${proxyRes.statusCode} ${proxyRes.statusMessage}`);

    // 응답 헤더 조정
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
  },
  onError: (err, req, res) => {
    console.error('[PROXY] Error:', err.message);
    res.status(500).json({
      error: 'Proxy Error',
      message: err.message,
      url: req.url
    });
  }
});

// health check 엔드포인트 (프록시보다 먼저 정의)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'CORS Proxy Server'
  });
});

// 프록시 라우트
app.use('/', proxy);

const PORT = process.env.PORT || 3001;

// IPv6과 IPv4 모두에 바인딩 (브라우저 연결 문제 해결)
// '::'에 바인딩하면 IPv4와 IPv6 모두에 바인딩됨
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log(`🚀 CORS Proxy Server started successfully`);
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🌐 Binding: [::] (IPv6 and IPv4)`);
  console.log(`🌐 Also accessible at: http://127.0.0.1:${PORT}`);
  console.log(`🎯 Target: https://docs.google.com`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log('='.repeat(60));
  console.log('✅ Ready to proxy Google Sheets requests');
  console.log('');
  console.log('Example usage:');
  console.log(`  GET http://localhost:${PORT}/spreadsheets/d/e/YOUR_SHEET_ID/pub...`);
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});