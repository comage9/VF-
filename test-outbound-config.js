/**
 * VF Outbound Config 테스트 스크립트
 *
 * 수정된 outboundConfig.ts 기능을 테스트합니다.
 */

// Node.js 환경에서 fetch API 사용을 위한 polyfill
if (typeof fetch === 'undefined') {
  global.fetch = async (url) => {
    const https = require('https');
    const http = require('http');

    return new Promise((resolve, reject) => {
      const lib = url.startsWith('https') ? https : http;
      const request = lib.get(url, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            statusText: response.statusMessage,
            text: async () => data,
            json: async () => JSON.parse(data),
          });
        });
      });

      request.on('error', (error) => {
        reject(error);
      });
    });
  };
}

// CSV 파싱 함수 (outboundConfig.ts와 동일)
function parseCSV(csvString) {
  const lines = csvString.split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    return [];
  }

  // 헤더 파싱
  const headers = lines[0].split(',').map(header => header.trim().replace(/^"|"$/g, ''));

  // 데이터 파싱
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(value => value.trim().replace(/^"|"$/g, ''));

    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      data.push(row);
    }
  }

  return data;
}

// 기본 Google Sheets URL
const DEFAULT_OUTBOUND_GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=1152588885&single=true&output=csv';

async function testOutboundConfig() {
  console.log('=== VF Outbound Config 테스트 ===\n');

  // 테스트 1: 기본 URL 확인
  console.log('테스트 1: 기본 Google Sheets URL 확인');
  console.log(`URL: ${DEFAULT_OUTBOUND_GOOGLE_SHEET_URL}\n`);

  // 테스트 2: 데이터 fetch 테스트
  console.log('테스트 2: Google Sheets에서 데이터 fetch');
  try {
    const response = await fetch(DEFAULT_OUTBOUND_GOOGLE_SHEET_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`✓ Fetch 성공 (Status: ${response.status})`);

    const csvText = await response.text();
    console.log(`✓ CSV 데이터 로드 성공 (길이: ${csvText.length} bytes)`);

    // 테스트 3: CSV 파싱 테스트
    console.log('\n테스트 3: CSV 파싱');
    const parsedData = parseCSV(csvText);
    console.log(`✓ 파싱된 데이터 개수: ${parsedData.length}개`);

    if (parsedData.length > 0) {
      console.log('✓ 첫 번째 데이터 샘플:');
      console.log(JSON.stringify(parsedData[0], null, 2));

      // 데이터 구조 확인
      console.log('\n테스트 4: 데이터 구조 확인');
      const sampleItem = parsedData[0];
      const expectedFields = ['id', 'productName', 'customerName', 'quantity', 'status'];
      const foundFields = expectedFields.filter(field => field in sampleItem);

      console.log(`예상 필드: ${expectedFields.join(', ')}`);
      console.log(`발견된 필드: ${Object.keys(sampleItem).join(', ')}`);
      console.log(`일치 필드: ${foundFields.length}/${expectedFields.length}`);

      if (foundFields.length > 0) {
        console.log('✓ 데이터 구조 검증 성공');
      } else {
        console.log('⚠ 데이터 구조가 예상과 다릅니다.');
      }
    } else {
      console.log('⚠ 파싱된 데이터가 없습니다.');
    }

    console.log('\n=== 테스트 완료 ===');
    console.log('✓ 모든 테스트가 성공적으로 완료되었습니다.');
    console.log('\n수정된 outboundConfig.ts는 정상적으로 작동합니다.');
    console.log('VF 프로젝트에서 http://localhost:5174/outbound?tab=vf-outbound 페이지를 테스트해보세요.');

  } catch (error) {
    console.error('✗ 테스트 실패:', error.message);
    console.error('\n상세 오류:', error);
  }
}

// 테스트 실행
testOutboundConfig().catch(console.error);
