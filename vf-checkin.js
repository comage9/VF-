const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const FORM_URL = 'https://forms.office.com/pages/responsepage.aspx?id=vnSfnWt49kiOGIPPei7vfAL8tnw3ZhhAu6sqpd-f1oNUMjFZM1MzNEZZNE0wNURFVUhLOUg3OTVaNCQlQCN0PWcu';
const SESSION = 'vf-checkin';
const SCREENSHOT_DIR = '.playwright-cli/checkin';

const DATA = {
    name: '김주현',
    phone: '010-4725-2242',
    workTime: '14:00~01:00',
    workerCount: '3',
    facilityDamage: '없음'
};

function timestamp() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '').slice(0, 15);
}

async function run(cmd, args = []) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
        let output = '';
        proc.stdout.on('data', d => output += d.toString());
        proc.stderr.on('data', d => output += d.toString());
        proc.on('close', code => resolve({ code, output }));
    });
}

async function randomDelay(minHour, maxHour) {
    const now = new Date();
    const baseMinute = minHour * 60;
    const rangeMinute = (maxHour - minHour) * 60;
    const delayMs = Math.floor(Math.random() * rangeMinute) * 60 * 1000;
    const targetTime = new Date(now.getTime() + delayMs);
    console.log(`랜덤 대기: ${Math.floor(delayMs / 60000)}분 (${targetTime.toLocaleTimeString()}에 실행 예정)`);
    await new Promise(r => setTimeout(r, delayMs));
}

async function main() {
    await randomDelay(13, 14);
    const ts = timestamp();
    const screenshotBefore = path.join(SCREENSHOT_DIR, `before_${ts}.png`);
    const screenshotAfter = path.join(SCREENSHOT_DIR, `after_${ts}.png`);

    if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    console.log(`=== VF 체크인 시작: ${new Date().toLocaleString()} ===`);

    await run('playwright-cli', ['-s=' + SESSION, 'close']);

    console.log('[1/7] 브라우저 열기...');
    await run('playwright-cli', ['-s=' + SESSION, 'open', FORM_URL]);
    await new Promise(r => setTimeout(r, 2000));

    console.log('[2/7] 근무자 성함:', DATA.name);
    await run('playwright-cli', ['-s=' + SESSION, 'fill', 'e84', DATA.name]);

    console.log('[3/7] 연락처:', DATA.phone);
    await run('playwright-cli', ['-s=' + SESSION, 'fill', 'e98', DATA.phone]);

    console.log('[4/7] 출고 운영 시간:', DATA.workTime);
    await run('playwright-cli', ['-s=' + SESSION, 'fill', 'e112', DATA.workTime]);

    console.log('[5/7] 근무 인원:', DATA.workerCount);
    await run('playwright-cli', ['-s=' + SESSION, 'fill', 'e127', DATA.workerCount]);

    console.log('[6/7] 시설 피해 유무:', DATA.facilityDamage);
    if (DATA.facilityDamage === '없음') {
        await run('playwright-cli', ['-s=' + SESSION, 'click', 'e156']);
    } else {
        await run('playwright-cli', ['-s=' + SESSION, 'click', 'e147']);
    }

    console.log('제출 전 스크린샷...');
    await run('playwright-cli', ['-s=' + SESSION, 'screenshot', '--filename=' + screenshotBefore]);

    console.log('[7/7] 제출...');
    await run('playwright-cli', ['-s=' + SESSION, 'click', 'e163']);
    await new Promise(r => setTimeout(r, 3000));

    console.log('제출 후 스크린샷...');
    await run('playwright-cli', ['-s=' + SESSION, 'screenshot', '--filename=' + screenshotAfter]);

    await run('playwright-cli', ['-s=' + SESSION, 'close']);

    console.log('=== 완료 ===');
    console.log('스크린샷 저장 위치:', SCREENSHOT_DIR);
    console.log('- before:', screenshotBefore);
    console.log('- after:', screenshotAfter);
}

main().catch(console.error);
