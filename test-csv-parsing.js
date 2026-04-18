const fs = require('fs');
const https = require('https');

/**
 * CSV 문자열을 JSON 객체 배열로 파싱합니다.
 *
 * @param csvString CSV 형식의 문자열
 * @returns 파싱된 JSON 객체 배열
 */
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

/**
 * URL에서 데이터를 가져옵니다.
 */
function fetchFromUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // 리다이렉트 처리
      if (res.statusCode === 302 || res.statusCode === 301 || res.statusCode === 307 || res.statusCode === 308) {
        const redirectUrl = res.headers.location;
        console.log(`리다이렉트: ${res.statusCode} -> ${redirectUrl}`);
        resolve(fetchFromUrl(redirectUrl));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

async function testGoogleSheets() {
  console.log('=== Google Sheets 테스트 시작 ===');
  console.log('시간:', new Date().toLocaleString('ko-KR'));

  const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=1152588885&single=true&output=csv';

  try {
    console.log('\n=== 데이터 가져오기 ===');
    console.log('URL:', url);

    const csvData = await fetchFromUrl(url);
    console.log(`CSV 데이터 길이: ${csvData.length} 바이트`);

    // 데이터 파싱
    console.log('\n=== CSV 파싱 ===');
    const parsedData = parseCSV(csvData);
    console.log(`파싱된 데이터 개수: ${parsedData.length}개`);

    if (parsedData.length > 0) {
      console.log('\n=== 첫 번째 데이터 ===');
      console.log(JSON.stringify(parsedData[0], null, 2));

      // 유효한 데이터만 필터링
      console.log('\n=== 데이터 유효성 검사 ===');
      const validData = parsedData.filter(item => {
        if (!item || typeof item !== 'object') return false;
        return !!(item.id && item.품목 && item.분류);
      });

      console.log(`유효한 데이터 개수: ${validData.length}개`);
      console.log(`필터링된 데이터 개수: ${parsedData.length - validData.length}개`);

      if (validData.length > 0) {
        console.log('\n=== 마지막 유효 데이터 ===');
        console.log(JSON.stringify(validData[validData.length - 1], null, 2));

        // 분류별 통계
        console.log('\n=== 분류별 통계 ===');
        const categoryCount = {};
        validData.forEach(item => {
          const category = item.분류 || '기타';
          categoryCount[category] = (categoryCount[category] || 0) + 1;
        });

        Object.entries(categoryCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .forEach(([category, count]) => {
            console.log(`${category}: ${count}개`);
          });

        // 날짜 범위
        console.log('\n=== 날짜 범위 ===');
        const dates = validData
          .map(item => item.일자)
          .filter(date => date && date.match(/^\d{4}-\d{2}-\d{2}$/))
          .sort();

        if (dates.length > 0) {
          console.log(`가장 빠른 날짜: ${dates[0]}`);
          console.log(`가장 늦은 날짜: ${dates[dates.length - 1]}`);
          console.log(`총 기간: ${dates.length}개 날짜`);
        }

        // 결과 저장
        const logsDir = 'test-logs';
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const results = {
          timestamp: new Date().toLocaleString('ko-KR'),
          url: url,
          success: true,
          data: {
            totalRows: parsedData.length,
            validRows: validData.length,
            filteredRows: parsedData.length - validData.length,
            categories: categoryCount,
            dateRange: {
              earliest: dates[0] || null,
              latest: dates[dates.length - 1] || null,
              totalDates: dates.length
            }
          },
          sampleData: {
            first: validData[0],
            last: validData[validData.length - 1]
          }
        };

        const resultsPath = `${logsDir}/google-sheets-test-${timestamp}.json`;
        fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
        console.log(`\n=== 결과 저장 완료: ${resultsPath} ===`);
      }
    }

    console.log('\n=== 테스트 성공 ===');
    return {
      success: true,
      totalRows: parsedData.length,
      message: 'Google Sheets 데이터를 성공적으로 가져왔습니다.'
    };

  } catch (error) {
    console.error('\n=== 테스트 실패 ===');
    console.error('에러:', error.message);
    console.error('스택:', error.stack);

    // 에러 결과 저장
    const logsDir = 'test-logs';
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const errorResults = {
      timestamp: new Date().toLocaleString('ko-KR'),
      url: url,
      success: false,
      error: {
        message: error.message,
        stack: error.stack
      }
    };

    const errorPath = `${logsDir}/google-sheets-error-${timestamp}.json`;
    fs.writeFileSync(errorPath, JSON.stringify(errorResults, null, 2));
    console.log(`=== 에러 결과 저장 완료: ${errorPath} ===`);

    throw error;
  }
}

// 테스트 실행
testGoogleSheets()
  .then(result => {
    console.log('\n=== 최종 결과 ===');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('치명적 오류:', error.message);
    process.exit(1);
  });