// old.raw / new.raw → 레이아웃 구간만 추출한 스탠드얼론 TS 모듈 생성
const fs = require("fs");
const dir = __dirname;

function extract(rawPath, outPath, isNew) {
  const src = fs.readFileSync(rawPath, "utf8");
  // 시작: 타입 선언(DongKey 등) ~ 끝: SOFT_ZONES 주석 직전 (존 레이아웃 전체 구간)
  const start = src.indexOf("type DongKey");
  const endMarker = "/** 자동 교정 대상 zone";
  const end = src.indexOf(endMarker);
  let section = src.slice(start, end);
  // E동 엔트리 제거 (프로브는 A~D만 비교)
  const eStart = section.indexOf('  {\n    key: "E"');
  if (eStart >= 0) section = section.slice(0, eStart) + "];\n";
  // 지그재그 번호 함수 구간 (getZigzagLocNo ~ getDongLocNo 직전)
  const zStart = src.indexOf("/* ===== 로케이션 번호");
  const zEnd = src.indexOf("/** B/C/D동 로케이션 번호");
  const zig = src.slice(zStart, zEnd);

  const header = isNew
    ? `(globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };\n` +
      `const LINE_CONFIG_KEY = "vf_pd_line_config_v1";\nconst LINE_CONFIG_VERSION = "line-config-v1";\n`
    : "";
  const types = `type CSSProperties = Record<string, string | number | undefined>;\n`;
  const stubs = `const A_RANK_PLACEMENT: Record<string,string> = {};\nconst B_RANK_PLACEMENT: Record<string,string> = {};\nconst C_RANK_PLACEMENT: Record<string,string> = {};\nconst D_RANK_PLACEMENT: Record<string,string> = {};\n`;
  const footer = `export { DONG_LAYOUTS, getZigzagLocNo };\n`;
  fs.writeFileSync(outPath, header + types + stubs + section + "\n" + zig + "\n" + footer);
  console.log(outPath, "written,", fs.statSync(outPath).size, "bytes");
}

extract(dir + "/old.raw", dir + "/old.ts", false);
extract(dir + "/new.raw", dir + "/new.ts", true);
