// 제품배치도 정적 데이터 + 스냅샷 payload 중복 감사 스크립트 (2026-08-28)
// 용도: node .pd-probe/dup-check.cjs [payload.json 경로]
const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..", "frontend", "client", "src", "pages");

function parsePlacement(file, name) {
  const src = fs.readFileSync(path.join(BASE, file), "utf8");
  const m = new RegExp(name + "[^{]*\\{([\\s\\S]*?)\\n\\};").exec(src);
  if (!m) { console.log("NO MATCH", file, name); return []; }
  return [...m[1].matchAll(/"([^"]+)":\s*"([^"]*)"/g)].map((r) => [r[1], r[2]]);
}

function audit(entries, label) {
  const seen = new Map();
  let cross = 0, intra = 0;
  for (const [zone, val] of entries) {
    if (!val) continue;
    const pnums = val.split(",").map((s) => s.trim()).filter(Boolean);
    const inZone = new Set();
    for (const p of pnums) {
      if (inZone.has(p)) { intra++; console.log(`  [intra] ${label} ${zone}: ${p}`); }
      inZone.add(p);
      if (seen.has(p)) { cross++; console.log(`  [cross] ${label} ${p}: ${seen.get(p)} vs ${zone}`); }
      else seen.set(p, zone);
    }
  }
  console.log(`${label}: entries=${entries.length}, unique=${seen.size}, cross=${cross}, intra=${intra}`);
  return { cross, intra };
}

console.log("=== 정적 기본 데이터 감사 ===");
const files = [
  ["product-display-a-data.ts", "A_RANK_PLACEMENT"],
  ["product-display-b-data.ts", "B_RANK_PLACEMENT"],
  ["product-display-c-data.ts", "C_RANK_PLACEMENT"],
  ["product-display-d-data.ts", "D_RANK_PLACEMENT"],
];
const all = [];
for (const [f, n] of files) all.push(...parsePlacement(f, n));
audit(all, "STATIC-A+B+C+D");

// 파일 스냅샷 payload 감사 (인자 있을 때)
const payloadFile = process.argv[2];
if (payloadFile) {
  console.log("=== payload 감사:", payloadFile, "===");
  const raw = fs.readFileSync(payloadFile, "utf8");
  let obj = JSON.parse(raw);
  if (typeof obj.payload === "string") obj = JSON.parse(obj.payload);
  const data = obj.data;
  audit(Object.entries(data).map(([k, v]) => [k, v]), "PAYLOAD");
}
