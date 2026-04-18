#!/usr/bin/env node

/**
 * VF 출고탭 연결 테스트 스크립트
 *
 * 환경변수, 로컬 데이터, 구글 시트 연결 테스트
 * 모든 데이터 소스와 에러 처리를 검증합니다.
 */

const fs = require('fs');
const path = require('path');
const http = require('https');
const url = require('url');

// 색상 출력 (터미널 호환성)
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// 로그 함수
const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bright}${colors.blue}${msg}${colors.reset}`),
  divider: () => console.log(`${colors.gray}${'─'.repeat(50)}${colors.reset}`)
};

// 테스트 결과 저장
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

// 테스트 결과 기록
const recordTest = (name, passed, message) => {
  results.tests.push({ name, passed, message });
  if (passed) {
    results.passed++;
    log.success(`${name}: ${message}`);
  } else {
    results.failed++;
    log.error(`${name}: ${message}`);
  }
};

// 경고 기록
const recordWarning = (name, message) => {
  results.warnings++;
  results.tests.push({ name, passed: false, message, warning: true });
  log.warning(`${name}: ${message}`);
};

// 1. 환경변수 및 구성 테스트
const testEnvironmentVariables = () => {
  log.header('[1/6] 환경변수 및 구성 테스트');

  // .env 파일 존재 확인
  const envPath = path.join(__dirname, '.env');
  const envExists = fs.existsSync(envPath);

  if (envExists) {
    recordTest('.env 파일 존재', true, '파일 발견됨');

    // 환경변수 로드
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      recordTest('.env 파일 읽기', true, 'UTF-8 인코딩으로 성공');

      // .env 내용 파싱
      envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          process.env[match[1].trim()] = match[2].trim();
        }
      });
    } catch (error) {
      recordTest('.env 파일 읽기', false, error.message);
    }
  } else {
    recordWarning('.env 파일 존재', '.env 파일이 없습니다. 기본값을 사용합니다.');
  }

  // OUTBOUND_GOOGLE_SHEET_URL 확인
  const googleSheetUrl = process.env.OUTBOUND_GOOGLE_SHEET_URL;
  if (googleSheetUrl && googleSheetUrl.trim()) {
    recordTest('OUTBOUND_GOOGLE_SHEET_URL', true, '구글 시트 URL 설정됨');
  } else {
    recordWarning('OUTBOUND_GOOGLE_SHEET_URL', '구글 시트 URL이 설정되지 않음. 로컬 데이터 사용.');
  }

  // Next.js 환경 변수 확인
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    recordTest('NEXT_PUBLIC_API_URL', true, apiUrl);
  } else {
    recordWarning('NEXT_PUBLIC_API_URL', 'API URL 설정되지 않음. 기본값 사용.');
  }

  return googleSheetUrl;
};

// 2. 로컬 JSON 데이터 파일 테스트
const testLocalDataFiles = () => {
  log.header('[2/6] 로컬 JSON 데이터 파일 테스트');

  const possiblePaths = [
    'outbound-data.json',
    'vf_production_data.json'
  ];

  let dataFound = false;

  for (const dataPath of possiblePaths) {
    const resolvedPath = path.join(__dirname, dataPath);

    if (fs.existsSync(resolvedPath)) {
      dataFound = true;
      recordTest(`${dataPath} 존재`, true, '파일 발견됨');

      try {
        const content = fs.readFileSync(resolvedPath, 'utf8');
        const jsonData = JSON.parse(content);
        recordTest(`${dataPath} JSON 파싱`, true, '유효한 JSON 형식');

        // 데이터 구조 확인
        if (Array.isArray(jsonData.data)) {
          recordTest(`${dataPath} 데이터 구조`, true, `${jsonData.data.length}개 항목`);

          // 데이터 유효성 검증
          const validItems = jsonData.data.filter(item => {
            return item && typeof item === 'object' &&
                   item.id && item.productName && item.customerName && item.quantity;
          });

          if (validItems.length > 0) {
            recordTest(`${dataPath} 데이터 유효성`, true, `${validItems.length}개 유효 항목`);
          } else {
            recordWarning(`${dataPath} 데이터 유효성`, '유효한 데이터 항목 없음');
          }

          return jsonData;
        } else if (Array.isArray(jsonData)) {
          // vf_production_data.json 형식
          recordTest(`${dataPath} 데이터 구조`, true, `${jsonData.length}개 항목`);
          return jsonData;
        } else {
          recordWarning(`${dataPath} 데이터 구조`, '예상된 데이터 구조가 아님');
        }
      } catch (error) {
        recordTest(`${dataPath} JSON 파싱`, false, error.message);
      }
    }
  }

  if (!dataFound) {
    recordWarning('로컬 데이터 파일', 'outbound-data.json 또는 vf_production_data.json 없음');
  }

  return null;
};

// 3. outbound-tabs.tsx 컴포넌트 테스트
const testComponentFile = () => {
  log.header('[3/6] 컴포넌트 파일 테스트');

  const componentPath = path.join(__dirname, 'outbound-tabs.tsx');

  if (!fs.existsSync(componentPath)) {
    recordTest('outbound-tabs.tsx 존재', false, '파일을 찾을 수 없습니다');
    return false;
  }

  recordTest('outbound-tabs.tsx 존재', true, '파일 발견됨');

  // 파일 크기 확인
  const stats = fs.statSync(componentPath);
  const fileSizeKB = (stats.size / 1024).toFixed(2);
  recordTest('파일 크기', true, `${fileSizeKB} KB`);

  // 컴포넌트 구조 확인
  const content = fs.readFileSync(componentPath, 'utf8');

  const checks = {
    'React import': content.includes('import React'),
    'TypeScript 타입 정의': content.includes('interface') || content.includes('type'),
    'handleSync 함수': content.includes('handleSync'),
    'useState hook': content.includes('useState'),
    'useEffect hook': content.includes('useEffect'),
    'export default': content.includes('export default'),
    '에러 처리': content.includes('try') && content.includes('catch'),
    '로딩 상태': content.includes('loading'),
    '데이터 폴백': content.includes('outbound-data.json') || content.includes('vf_production_data.json'),
  };

  for (const [checkName, result] of Object.entries(checks)) {
    if (result) {
      recordTest(`컴포넌트 ${checkName}`, true, '발견됨');
    } else {
      recordWarning(`컴포넌트 ${checkName}`, '발견되지 않음');
    }
  }

  return true;
};

// 4. outboundConfig.ts 모듈 테스트
const testConfigModule = () => {
  log.header('[4/6] 설정 모듈 테스트');

  const configPath = path.join(__dirname, 'outboundConfig.ts');

  if (!fs.existsSync(configPath)) {
    recordTest('outboundConfig.ts 존재', false, '파일을 찾을 수 없습니다');
    return false;
  }

  recordTest('outboundConfig.ts 존재', true, '파일 발견됨');

  // 설정 모듈 구조 확인
  const content = fs.readFileSync(configPath, 'utf8');

  const functions = [
    'getOutboundGoogleSheetUrl',
    'getOutboundConfig',
    'fetchOutboundData',
    'checkOutboundConfigStatus'
  ];

  for (const funcName of functions) {
    if (content.includes(`export function ${funcName}`)) {
      recordTest(`함수 ${funcName}`, true, 'export 발견됨');
    } else {
      recordWarning(`함수 ${funcName}`, 'export 발견되지 않음');
    }
  }

  // 환경변수 처리 확인
  if (content.includes('process.env.OUTBOUND_GOOGLE_SHEET_URL')) {
    recordTest('환경변수 처리', true, 'OUTBOUND_GOOGLE_SHEET_URL 처리 발견');
  } else {
    recordWarning('환경변수 처리', '환경변수 처리 발견되지 않음');
  }

  // 로컬 JSON 폴백 확인
  if (content.includes('outbound-data.json') || content.includes('vf_production_data.json')) {
    recordTest('로컬 JSON 폴백', true, '폴백 로직 발견');
  } else {
    recordWarning('로컬 JSON 폴백', '폴백 로직 발견되지 않음');
  }

  return true;
};

// 5. 구글 시트 연결 테스트 (선택사항)
const testGoogleSheetConnection = async (googleSheetUrl) => {
  log.header('[5/6] 구글 시트 연결 테스트 (선택사항)');

  if (!googleSheetUrl) {
    recordWarning('구글 시트 연결', 'URL 설정되지 않음, 테스트 건너뜀');
    return null;
  }

  try {
    const parsedUrl = url.parse(googleSheetUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const hostname = parsedUrl.hostname;

    if (!hostname) {
      recordTest('URL 파싱', false, '유효하지 않은 URL');
      return null;
    }

    recordTest('URL 파싱', true, `${hostname}`);

    // HTTPS 요청 시도
    if (isHttps) {
      await new Promise((resolve, reject) => {
        const options = {
          hostname,
          path: parsedUrl.path,
          method: 'GET',
          timeout: 10000,
          headers: {
            'Accept': 'application/json'
          }
        };

        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              if (res.statusCode === 200) {
                const jsonData = JSON.parse(data);
                recordTest('HTTPS 연결', true, `${res.statusCode} OK`);
                recordTest('JSON 응답', true, '유효한 JSON');
                resolve(jsonData);
              } else {
                recordTest('HTTPS 연결', false, `${res.statusCode} ${res.statusMessage}`);
                resolve(null);
              }
            } catch (error) {
              recordTest('JSON 응답', false, error.message);
              resolve(null);
            }
          });
        });

        req.on('error', (error) => {
          recordTest('HTTPS 연결', false, error.message);
          resolve(null);
        });

        req.on('timeout', () => {
          req.destroy();
          recordTest('HTTPS 연결', false, '요청 시간 초과 (10초)');
          resolve(null);
        });

        req.end();
      });
    }
  } catch (error) {
    recordTest('구글 시트 연결', false, error.message);
  }

  return null;
};

// 6. HTTP 서버 연결 테스트
const testHttpConnection = async () => {
  log.header('[6/6] HTTP 서버 연결 테스트');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const parsedUrl = url.parse(apiUrl);

  return new Promise((resolve) => {
    const options = {
      hostname: parsedUrl.hostname || 'localhost',
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 3000),
      path: '/api/outbound',
      method: 'GET',
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const httpModule = parsedUrl.protocol === 'https:' ? https : http;

    const req = httpModule.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const jsonData = JSON.parse(data);
            recordTest('HTTP 연결', true, `${res.statusCode} OK`);
            recordTest('API 응답', true, '유효한 JSON');
            resolve(jsonData);
          } else {
            recordTest('HTTP 연결', false, `${res.statusCode} ${res.statusMessage}`);
            log.info('서버가 실행 중인지 확인하세요');
            resolve(null);
          }
        } catch (error) {
          recordTest('API 응답', false, `JSON 파싱 실패: ${error.message}`);
          resolve(null);
        }
      });
    });

    req.on('error', (error) => {
      recordTest('HTTP 연결', false, error.message);
      log.info('서버가 실행 중인지 확인하세요: npm start 또는 npm run dev');
      resolve(null);
    });

    req.on('timeout', () => {
      req.destroy();
      recordTest('HTTP 연결', false, '요청 시간 초과 (5초)');
      resolve(null);
    });

    req.end();
  });
};

// 최종 결과 보고서
const printSummary = () => {
  log.header('최종 결과 보고서');
  log.divider();

  const totalTests = results.tests.length;
  const passRate = totalTests > 0 ? ((results.passed / totalTests) * 100).toFixed(1) : 0;

  console.log(`${colors.bright}테스트 요약:${colors.reset}`);
  console.log(`  총 테스트: ${totalTests}`);
  console.log(`  ${colors.green}성공:${colors.reset} ${results.passed}`);
  console.log(`  ${colors.red}실패:${colors.reset} ${results.failed}`);
  console.log(`  ${colors.yellow}경고:${colors.reset} ${results.warnings}`);
  console.log('');
  console.log(`${colors.bright}성공률:${colors.reset} ${passRate}%`);
  console.log('');

  if (results.failed === 0 && results.warnings === 0) {
    console.log(`${colors.green}${colors.bright}🎉 모든 테스트 통과!${colors.reset}`);
    console.log('');
    console.log('다음 단계:');
    console.log('  1. 앱에 OutboundTabs 컴포넌트 통합');
    console.log('  2. 브라우저에서 /outbound 페이지 접속');
    console.log('  3. 데이터 로드 확인');
    console.log('  4. 기능 테스트 (새로고침, 데이터 표시)');
  } else if (results.failed === 0) {
    console.log(`${colors.yellow}⚠ 일부 경고가 있지만 기본 기능은 작동합니다.${colors.reset}`);
    console.log('');
    console.log('권장 사항:');
    results.tests
      .filter(t => t.warning)
      .forEach(t => console.log(`  - ${t.name}: ${t.message}`));
    console.log('');
    console.log('구글 시트를 사용하려면:');
    console.log('  1. OUTBOUND_GOOGLE_SHEET_URL 환경변수 설정');
    console.log('  2. 구글 Apps Script 배포');
    console.log('  3. CORS 설정 확인');
  } else {
    console.log(`${colors.red}⚠ 몇 가지 문제가 발견되었습니다.${colors.reset}`);
    console.log('');
    console.log('해결 필요:');
    results.tests
      .filter(t => !t.passed && !t.warning)
      .forEach(t => console.log(`  - ${t.name}: ${t.message}`));
    console.log('');
    console.log('도움말:');
    console.log('  - 필수 파일들이 모두 있는지 확인');
    console.log('  - package.json 확인 및 npm install 실행');
    console.log('  - .env 파일 설정 확인');
    console.log('  - TypeScript 설정 확인 (tsconfig.json)');
  }

  console.log('');
  log.divider();
  console.log(`${colors.bright}상세 테스트 결과:${colors.reset}`);

  results.tests.forEach((test, index) => {
    const icon = test.passed ? '✓' : (test.warning ? '⚠' : '✗');
    const color = test.passed ? colors.green : (test.warning ? colors.yellow : colors.red);
    console.log(`  ${color}${icon}${colors.reset} ${index + 1}. ${test.name}`);
    if (test.message) {
      console.log(`      ${colors.gray}${test.message}${colors.reset}`);
    }
  });

  console.log('');
  log.divider();
  console.log(`${colors.bright}환경 정보:${colors.reset}`);
  console.log(`  Node.js: ${process.version}`);
  console.log(`  Platform: ${process.platform}`);
  console.log(`  Current Directory: ${process.cwd()}`);
  console.log(`  OUTBOUND_GOOGLE_SHEET_URL: ${process.env.OUTBOUND_GOOGLE_SHEET_URL || 'not set'}`);
  console.log(`  NEXT_PUBLIC_API_URL: ${process.env.NEXT_PUBLIC_API_URL || 'not set'}`);
  console.log(`  VF_DATA_SOURCE: ${process.env.VF_DATA_SOURCE || 'not set'}`);
  console.log(`  VF_DATA_PATH: ${process.env.VF_DATA_PATH || 'not set'}`);
  log.divider();
  console.log('');
};

// 메인 실행
async function main() {
  console.log('');
  console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}VF 출고탭 연결 테스트${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}`);
  console.log('');

  try {
    // 1. 환경변수 테스트
    const googleSheetUrl = testEnvironmentVariables();

    // 2. 로컬 데이터 파일 테스트
    testLocalDataFiles();

    // 3. 컴포넌트 파일 테스트
    testComponentFile();

    // 4. 설정 모듈 테스트
    testConfigModule();

    // 5. 구글 시트 연결 테스트
    await testGoogleSheetConnection(googleSheetUrl);

    // 6. HTTP 서버 연결 테스트
    await testHttpConnection();

    // 최종 결과 보고서
    printSummary();

    // 테스트 결과 코드
    const exitCode = results.failed > 0 ? 1 : 0;

    console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}`);
    console.log('');

    process.exit(exitCode);

  } catch (error) {
    log.error(`치명적 오류: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// 실행
main();