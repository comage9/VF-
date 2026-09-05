// runtime-sim.cjs — defaultAPlacement() 병합 + sanitizePlacementMap 동작 시뮬레이션 (2026-08-28)
const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..", "frontend", "client", "src", "pages");

function parse(file, name) {
  const src = fs.readFileSync(path.join(BASE, file), "utf8");
  const m = new RegExp(name + "[^{]*\\{([\\s\\S]*?)\\n\\};").exec(src);
  if (!m) throw new Error("NO MATCH " + file + " " + name);
  return [...m[1].matchAll(/"([^"]+)":\s*"([^"]*)"/g)].map((r) => [r[1], r[2]]);
}

function countDups(entries) {
  const seen = new Map(); let cross = 0, intra = 0;
  for (const [zone, val] of entries) {
    if (!val) continue;
    const inZone = new Set();
    for (const p of val.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (inZone.has(p)) intra++; inZone.add(p);
      if (seen.has(p)) cross++; else seen.set(p, zone);
    }
  }
  return { cross, intra, unique: seen.size, zones: entries.filter(([, v]) => v).length };
}

// defaultAPlacement() 병합 순서: A -> B -> C -> D
const merged = [
  ...parse("product-display-a-data.ts", "A_RANK_PLACEMENT"),
  ...parse("product-display-b-data.ts", "B_RANK_PLACEMENT"),
  ...parse("product-display-c-data.ts", "C_RANK_PLACEMENT"),
  ...parse("product-display-d-data.ts", "D_RANK_PLACEMENT"),
];
console.log("병합 기본 데이터:", JSON.stringify(countDups(merged)));

// sanitizePlacementMap 복제 (동일 알고리즘)
function sanitize(map) {
  const out = {}; const seen = new Set();
  for (const [zid, val] of map) {
    const items = (val || "").split(",").map((s) => s.trim()).filter(Boolean);
    const kept = [];
    for (const pn of items) {
      if (seen.has(pn)) continue;
      seen.add(pn); kept.push(pn);
    }
    if (kept.length) out[zid] = kept.join(",");
  }
  return out;
}

const clean = sanitize(merged);
console.log("sanitize 후:", JSON.stringify(countDups(Object.entries(clean))));

// B동·C동 한정 감사 (사용자 보고 범위)
const bc = merged.filter(([z]) => z.startsWith("B-") || z.startsWith("C-"));
console.log("B+C동 sanitize 전:", JSON.stringify(countDups(bc)));
const bcClean = Object.entries(clean).filter(([z]) => z.startsWith("B-") || z.startsWith("C-"));
console.log("B+C동 sanitize 후:", JSON.stringify(countDups(bcClean)));
