# VF 프로젝트 Google Sheets 403 에러 근본 원인 분석 보고서

## 📋 문제 개요
- **에러 메시지**: "Google Sheet 데이터 fetch 실패: 403"
- **발생 시점**: Outbound 탭에서 Google Sheets 데이터를 가져올 때
- **현재 환경**: 프론트엔드 서버 localhost:5174, CORS 프록시 사용

## 🔍 근본 원인 분석

### 테스트 결과 요약

| 테스트 항목 | URL | 결과 | 상태 코드 |
|-----------|-----|------|----------|
| Google Sheets 직접 접속 | `https://docs.google.com/spreadsheets/...` | ✅ 성공 | 200 OK |
| corsproxy.io + Google Sheets | `https://corsproxy.io/?...` | ❌ 실패 | 403 Forbidden |
| corsproxy.io + example.com | `https://corsproxy.io/?example.com` | ❌ 실패 | 403 Forbidden |
| allorigins.win + Google Sheets | `https://api.allorigins.win/...` | ❌ 실패 | 522 Timeout |

### 핵심 발견

**✅ Google Sheets URL 자체는 정상 작동**
- 직접 접근 시 정상적으로 CSV 데이터 반환
- 제품 정보, 바코드, 수량 등 모든 데이터 포함
- 접근 권한 문제 없음
- URL 형식 문제 없음

**❌ corsproxy.io 서비스 장애**
- **모든 요청**에 403 Forbidden 반환
- Google Sheets뿐만 아니라 example.com 같은 단순한 URL도 차단
- Cloudflare 보호로 인한 서비스 제한으로 추정
- 이는 **일시적 또는 영구적 서비스 장애**

**❌ 대체 CORS 프록시도 불안정**
- allorigins.win은 522 타임아웃 에러
- 공개 CORS 프록시 서비스 전반의 신뢰성 문제

## 🎯 결론: 근본 원인

**403 에러의 근본 원인은 corsproxy.io 서비스의 장애/제한**

이것이 **아닙니다:**
- ❌ Google Sheets API 키 문제 (Published URL은 API 키 불필요)
- ❌ Google Sheets 접근 권한 문제 (공개 published URL)
- ❌ URL 형식 문제 (올바른 형식)
- ❌ Google Sheets 서비스 장애 (직접 접근 시 정상)

**이것입니다:**
- ✅ **corsproxy.io 서비스가 모든 요청을 403으로 차단**
- ✅ 공개 CORS 프록시 서비스의 신뢰성 문제

## 💡 해결책 제안

### 1️⃣ 자체 CORS 프록시 서버 구축 (추천 ⭐⭐⭐⭐⭐)

**장점:**
- 완전한 제어권과 신뢰성
- 무료로 사용 가능
- Google Sheets와 완벽 호환
- 캐싱 및 성능 최적화 가능

**구현 방법:**

```javascript
// simple-cors-proxy.js
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(cors());

app.get('/proxy/sheets', createProxyMiddleware({
  target: 'https://docs.google.com',
  changeOrigin: true,
  pathRewrite: {
    '^/proxy/sheets': ''
  }
}));

app.listen(3001, () => {
  console.log('CORS Proxy Server running on port 3001');
});
```

**설치 및 실행:**
```bash
npm install express cors http-proxy-middleware
node simple-cors-proxy.js
```

**프론트엔드 수정:**
```typescript
// outboundConfig.ts
const CORS_PROXY_URL = 'http://localhost:3001/proxy/sheets';
```

### 2️⃣ Google Sheets API 사용 (안정적 ⭐⭐⭐⭐)

**장점:**
- 공식 API로 안정적
- 풍부한 기능
- 공식 문서 지원

**단점:**
- Google Cloud 프로젝트 설정 필요
- API 키 관리 필요
- 약간의 복잡성 증가

**구현 방법:**

```bash
# Google Sheets API 설치
npm install @googleapis/sheets
```

```typescript
// sheets-api.ts
import { sheets } from '@googleapis/sheets';

const auth = new GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const sheetsClient = sheets({ version: 'v4', auth });

export async function fetchSheetData() {
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: 'YOUR_SPREADSHEET_ID',
    range: 'Sheet1!A1:Z1000'
  });
  return response.data.values;
}
```

### 3️⃣ 정적 JSON 파일로 변환 (간단 ⭐⭐⭐)

**장점:**
- 구현이 가장 간단
- CORS 문제 없음
- 빠른 로딩

**단점:**
- 수동 업데이트 필요
- 실시간 데이터 반영 불가

**구현 방법:**

```bash
# Google Sheets 데이터 다운로드
curl -o outbound-data.json "https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=1152588885&single=true&output=csv"

# JSON으로 변환 (Node.js 스크립트 활용)
```

### 4️⃣ 다른 공개 CORS 프록시 시도 (임시 ⭐⭐)

**장점:**
- 빠른 구현
- 추가 인프라 불필요

**단점:**
- 신뢰성 낮음
- 속도 느림
- 서비스 중단 가능성

**예시:**
```typescript
const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://cors-anywhere.herokuapp.com/'
];
```

## 🚀 즉시 적용 가능한 해결책

### 추천: 자체 CORS 프록시 (10분 내 구현 가능)

1. **프로젝트에 프록시 서버 추가:**
```bash
cd /home/comage/.openclaw/workspace
npm install express cors http-proxy-middleware
```

2. **프록시 서버 파일 생성:**
```javascript
// cors-proxy.js
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(cors());

app.use('/', createProxyMiddleware({
  target: 'https://docs.google.com',
  changeOrigin: true,
  onProxyReq: (proxyReq) => {
    // User-Agent 설정으로 Google Sheets 차단 회피
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  }
}));

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ CORS Proxy Server running on http://localhost:${PORT}`);
});
```

3. **프론트엔드 설정 수정:**
```typescript
// outboundConfig.ts
const CORS_PROXY_URL = 'http://localhost:3001/';
```

4. **실행:**
```bash
# 터미널 1: 프록시 서버
node cors-proxy.js

# 터미널 2: 프론트엔드 서버
npm run dev
```

## 📊 비교 분석

| 해결책 | 구현 난이도 | 신뢰성 | 유지보수 | 비용 | 추천도 |
|--------|-----------|--------|----------|------|--------|
| 자체 CORS 프록시 | 쉬움 | 높음 | 낮음 | 무료 | ⭐⭐⭐⭐⭐ |
| Google Sheets API | 중간 | 매우 높음 | 중간 | 무료 | ⭐⭐⭐⭐ |
| 정적 JSON 파일 | 매우 쉬움 | 매우 높음 | 높음 | 무료 | ⭐⭐⭐ |
| 공개 CORS 프록시 | 매우 쉬움 | 낮음 | 낮음 | 무료 | ⭐⭐ |

## 🎯 최종 권장 사항

1. **단기 (당장 적용):** 자체 CORS 프록시 구축
   - 10분 내 구현 가능
   - 현재 코드 변경 최소화
   - 즉시 문제 해결

2. **장기 (안정성 확보):** Google Sheets API로 마이그레이션
   - 더 안정적이고 확장 가능
   - Google 생태계 통합
   - 추가 기능 활용 가능

3. **대안 (간단한 해결):** 정적 JSON 파일
   - 데이터 변경이 드문 경우 적합
   - 가장 간단한 구현

## 📝 참고

- **Google Sheets URL**: 현재 사용 중인 Published URL은 정상 작동
- **데이터 접근성**: 문서는 공개되어 있어 접근 권한 문제 없음
- **테스트 환경**: curl, node.js 등 다양한 방법으로 검증 완료
- **서비스 상태**: corsproxy.io는 현재 장애 상태로 추정

---

**분석 일자**: 2026-04-16
**분석자**: Claude Code
**검증 상태**: ✅ 완료