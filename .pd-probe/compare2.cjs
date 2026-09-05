const { createRequire } = require("module");
const req = createRequire(__filename);
const oldM = req("./out/old.js");
const newM = req("./out/new.js");

const a = JSON.stringify(oldM.DONG_LAYOUTS);
const b = JSON.stringify(newM.DONG_LAYOUTS);
console.log("DONG_LAYOUTS identical:", a === b);

// 슬롯 1..19 기존 번호 완전 비교
let mismatch = 0;
for (let slot = 1; slot <= 19; slot++)
  for (let line = 1; line <= 6; line++)
    if (oldM.getZigzagLocNo(`A-L${line}-${slot}`) !== newM.getZigzagLocNo(`A-L${line}-${slot}`)) { mismatch++; console.log(`diff L${line}-${slot}`); }
console.log("slot<=19 mismatches:", mismatch);

// 확장 슬롯 20..30: NaN/음수/충돌/연속성 검사
const seen = new Map();
let bad = 0;
for (let slot = 20; slot <= 30; slot++) {
  for (let line = 1; line <= 6; line++) {
    const n = newM.getZigzagLocNo(`A-L${line}-${slot}`);
    if (n === null || !Number.isFinite(n) || n <= 0) { bad++; console.log(`BAD L${line}-${slot}=${n}`); continue; }
    if (seen.has(n)) { bad++; console.log(`COLLISION ${n}: L${line}-${slot} vs ${seen.get(n)}`); }
    else seen.set(n, `L${line}-${slot}`);
  }
}
console.log("ext slots 20..30 bad:", bad, "| unique ext nos:", seen.size, "(expect 66)");
// pair0 확장 패턴 확인
console.log("pair0 ext:", [20,21,22,23].map(s => `L1-${s}=${newM.getZigzagLocNo(`A-L1-${s}`)}/L2-${s}=${newM.getZigzagLocNo(`A-L2-${s}`)}`).join(" "));
