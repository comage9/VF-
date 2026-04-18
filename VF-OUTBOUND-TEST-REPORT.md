# VF Outbound 페이지 Playwright 테스트 분석 보고서

## 테스트 개요

**테스트 날짜**: 2026-04-17
**테스트 도구**: Playwright (@playwright/test)
**페이지 URL**: http://localhost:5174/outbound?tab=vf-outbound
**브라우저**: Google Chrome (Headless)

## 테스트 결과 요약

### ✅ 성공 항목
- 페이지 접속 성공 (HTTP 200)
- DOM 구조 정상 로드
- CORS 프록시 서버 정상 작동 (localhost:3001)
- 네트워크 요청 전송 성공
- **ERR_CONNECTION_REFUSED 에러 발생하지 않음**

### ❌ 문제 항목
- 데이터 테이블 미표시
- 로딩 상태 지속
- React JSX 경고 (2개)

## 상세 분석

### 1. 페이지 접속 상태
- **페이지 제목**: "출고 수량 분석 | VF 보노하우스"
- **HTTP 상태**: 200 OK
- **로드 시간**: 정상
- **콘솔 에러**: 2개 (React JSX 경고 1개, favicon 404 1개)

### 2. 네트워크 요청 분석
- **총 요청 수**: 107개
- **총 응답 수**: 106개
- **실패한 응답**: 0개

#### 2.1 CORS 프록시 요청
```
URL: http://localhost:3001/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=1152588885&single=true&output=csv
Method: GET
Resource Type: fetch
```

**직접 테스트 결과**:
```bash
curl "http://localhost:3001/..."
> HTTP/1.1 200 OK
> X-Powered-By: Express
> Access-Control-Allow-Origin: *
> Content-Type: text/csv
```

**결론**: CORS 프록시 서버가 정상 작동하고 있음

### 3. DOM 요소 상태
- **OutboundTabs 컴포넌트**: ✓ 존재
- **제목**: "출고 관리"
- **상태 표시**: "✓ 기본 구글 시트"
- **에러 메시지**: 없음
- **데이터 테이블**: ✗ 없음
- **새로고침 버튼**: 1개 존재
- **로딩 상태**: ✓ 있음

### 4. 콘솔 에러 분석

#### 4.1 React JSX 경고
```
Warning: Received `%s` for a non-boolean attribute `%s`.
If you want to write it to the DOM, pass a string instead: %s="%s" or %s={value.toString()}.%s true jsx jsx true jsx
```

**원인**: `outbound-tabs.tsx`에서 `<style jsx>` 속성 사용으로 인한 경고

**위치**:
- 파일: `/src/components/outbound-tabs.tsx:25:3`
- 컴포넌트: OutboundTabs

#### 4.2 Favicon 404 에러
```
Failed to load resource: server responded with a status of 404 (Not Found)
URL: http://localhost:5174/favicon.ico
```

**중요도**: 낮음 (기능에 영향 없음)

### 5. 연결 관련 에러
- **ERR_CONNECTION_REFUSED 에러**: ❌ 발생하지 않음
- **CORS 에러**: ❌ 발생하지 않음
- **localhost:3001 연결**: ✅ 정상

## 원래 문제 분석

### 기존 문제 상황
사용자가 보고한 문제:
1. Outbound 페이지에서 Google Sheets 동기화 실패
2. 콘솔 에러: "Failed to load resource: net::ERR_CONNECTION_REFUSED"
3. CORS 프록시 서버(포트 3001) 접근 불가

### 테스트 결과와의 비교
| 문제 항목 | 기존 보고 | 테스트 결과 | 상태 |
|----------|----------|------------|------|
| ERR_CONNECTION_REFUSED | 발생 | 발생하지 않음 | ✅ 해결됨 |
| CORS 프록시 접근 불가 | 문제 있음 | 정상 작동 | ✅ 해결됨 |
| Google Sheets 동기화 실패 | 문제 있음 | 데이터 요청 전송됨 | ⚠️ 부분 해결 |

### 현재 문제
1. **데이터 테이블 미표시**: Google Sheets에서 데이터를 가져오지만 파싱/표시 문제
2. **로딩 상태 지속**: 데이터 로딩이 완료되지 않음

## 문제 해결 제안

### 1. React JSX 경고 수정

**파일**: `/home/comage/coding/VF/frontend/client/src/components/outbound-tabs.tsx:322`

**문제**:
```tsx
<style jsx>{`
  .outbound-tabs {
    ...
  }
`}</style>
```

**해결 방법**:
`jsx` 속성을 제거하거나 `styled-jsx` 패키지를 설치해야 함.

**옵션 1**: styled-jsx 패키지 설치
```bash
npm install styled-jsx
```

**옵션 2**: 일반 CSS 파일로 분리
```css
/* outbound-tabs.css */
.outbound-tabs {
  background-color: #FFFFFF;
  /* ... */
}
```

```tsx
import './outbound.css';
```

**옵션 3**: CSS-in-JS 라이브러리 사용 (emotion, styled-components 등)

### 2. 데이터 테이블 미표시 문제 해결

**가능한 원인**:
1. CSV 파싱 오류
2. 데이터 형식 불일치
3. 응답 처리 지연
4. 에러 핸들링 미흡

**해결 방법 1**: 로깅 강화
```tsx
export async function fetchOutboundData(): Promise<unknown> {
  try {
    const config = getOutboundConfig();
    console.log('🔍 Fetching data from:', config.googleSheetUrl);

    const response = await fetch(config.googleSheetUrl);
    console.log('📡 Response status:', response.status);

    if (!response.ok) {
      throw new Error(`Google Sheet 데이터 fetch 실패: ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    console.log('📄 CSV length:', csvText.length);
    console.log('📄 CSV preview:', csvText.substring(0, 200));

    const parsedData = parseCSV(csvText);
    console.log('📊 Parsed data count:', parsedData.length);

    return parsedData;
  } catch (error) {
    console.error('❌ Outbound 데이터 fetch 오류:', error);
    throw error;
  }
}
```

**해결 방법 2**: CORS 프록시 응답 타임아웃 확인
```tsx
export async function fetchOutboundData(): Promise<unknown> {
  try {
    const config = getOutboundConfig();

    // 타임아웃 설정
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃

    const response = await fetch(config.googleSheetUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('요청 시간 초과 (30초)');
      }
      throw new Error(`데이터 가져오기 실패: ${error.message}`);
    }
    throw error;
  }
}
```

**해결 방법 3**: 에러 UI 개선
```tsx
{error && (
  <div className="error-message">
    <strong>오류:</strong> {error}
    <div className="error-details">
      <p>데이터를 가져오는 중 문제가 발생했습니다.</p>
      <p>해결 방법:</p>
      <ul>
        <li>인터넷 연결 확인</li>
        <li>CORS 프록시 서버(localhost:3001) 실행 확인</li>
        <li>Google Sheets URL 확인</li>
      </ul>
    </div>
    <button onClick={handleRefresh} className="retry-button">
      다시 시도
    </button>
  </div>
)}
```

### 3. CORS 프록시 모니터링

**상태 확인 스크립트**:
```bash
# CORS 프록시 서버 상태 확인
curl -v http://localhost:3001/

# CORS 프록시 재시작
cd /home/comage/coding/VF
node cors-proxy-server.js
```

### 4. 개발자 도구 사용법

**브라우저 콘솔에서 확인**:
```javascript
// 데이터 요청 확인
fetch('http://localhost:3001/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=1152588885&single=true&output=csv')
  .then(r => r.text())
  .then(text => console.log(text.substring(0, 500)))
  .catch(err => console.error(err));
```

## 결론

### 주요 발견
1. **CORS 프록시 서버 정상 작동**: localhost:3001에서 HTTP 200 응답
2. **연결 에러 해결됨**: ERR_CONNECTION_REFUSED 에러 현재 발생하지 않음
3. **데이터 요청 전송됨**: Google Sheets URL로 프록시 요청 성공
4. **새로운 문제 발견**: 데이터 테이블 미표시, 로딩 상태 지속

### 우선순위별 조치 항목

**높음 (즉시 조치 필요)**:
1. 데이터 테이블 미표시 문제 해결
2. CSV 파싱 로직 디버깅
3. 에러 핸들링 개선

**중간 (단계적 조치)**:
1. React JSX 경고 수정
2. 로딩 상태 관리 개선
3. 사용자 피드백 UI 추가

**낮음 (선택적 조치)**:
1. Favicon 404 에러 해결
2. 성능 최적화
3. 코드 리팩토링

### 추가 제언
1. **상태 모니터링**: CORS 프록시 서버 상태를 주기적으로 확인하는 스크립트 작성
2. **에러 추적**: 사용자 경험 개선을 위해 에러 추적 시스템 도입
3. **테스트 자동화**: Playwright 테스트를 CI/CD 파이프라인에 통합

## 참고 문서
- [Playwright Documentation](https://playwright.dev/)
- [CORS Proxy Server](cors-proxy-server.js)
- [Outbound Configuration](frontend/client/src/components/outboundConfig.ts)
- [Outbound Tabs Component](frontend/client/src/components/outbound-tabs.tsx)

---

**테스트 도구**: Playwright
**테스트 환경**: Google Chrome (Headless)
**테스트 실행자**: Claude Code
**보고서 생성**: 2026-04-17
