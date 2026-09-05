const { createRequire } = require("module");
const req = createRequire(__filename);
const oldM = req("./out/old.js");
const newM = req("./out/new.js");

const a = JSON.stringify(oldM.DONG_LAYOUTS);
const b = JSON.stringify(newM.DONG_LAYOUTS);
console.log("DONG_LAYOUTS identical:", a === b, "| old bytes:", a.length, "| new bytes:", b.length);
if (a !== b) {
  // 첫 차이 위치 탐색
  let i = 0; while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  console.log("first diff @", i, "\n old:", a.slice(Math.max(0,i-80), i+120), "\n new:", b.slice(Math.max(0,i-80), i+120));
}

// 동별 존 수 요약
for (const l of oldM.DONG_LAYOUTS) console.log(`  old ${l.key}: zones=${l.zones.length} labels=${l.lineLabels.length} w=${l.width} h=${l.height}`);
for (const l of newM.DONG_LAYOUTS) console.log(`  new ${l.key}: zones=${l.zones.length} labels=${l.lineLabels.length} w=${l.width} h=${l.height}`);

// 지그재그 번호 비교: slot 1..25 × line 1..6
let mismatch = 0;
for (let slot = 1; slot <= 25; slot++) {
  for (let line = 1; line <= 6; line++) {
    const o = oldM.getZigzagLocNo(`A-L${line}-${slot}`);
    const n = newM.getZigzagLocNo(`A-L${line}-${slot}`);
    if (o !== n) {
      mismatch++;
      if (mismatch <= 10) console.log(`  zigzag diff A-L${line}-${slot}: old=${o} new=${n}`);
    }
    if (n !== null && (!Number.isFinite(n) || n <= 0)) console.log(`  BAD new locNo A-L${line}-${slot} = ${n}`);
  }
}
console.log("zigzag mismatches (slot 1..25):", mismatch);
// 알려진 앵커값 확인 (파일 주석 기준)
const anchors = [["A-L1-19",1],["A-L2-19",2],["A-L2-18",3],["A-L1-18",4],["A-L1-17",5],["A-L2-17",6],["A-L3-19",39],["A-L4-19",40],["A-L5-19",77],["A-L6-19",78]];
for (const [id, exp] of anchors) {
  const n = newM.getZigzagLocNo(id);
  console.log(`  anchor ${id} = ${n} (expect ${exp}) ${n === exp ? "OK" : "FAIL"}`);
}
// slot>19 확장값 (new 전용 — NaN/음수 가드 확인)
for (const id of ["A-L6-20","A-L6-21","A-L6-23","A-L1-20","A-L1-21","A-L1-23","A-L3-20","A-L5-20"]) {
  console.log(`  ext ${id} = ${newM.getZigzagLocNo(id)}`);
}
