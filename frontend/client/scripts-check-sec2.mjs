// ②구간 보정 후 전체 연속성 검증 — 소스에서 맵을 직접 파싱
import fs from 'fs';
const src = fs.readFileSync('frontend/client/src/pages/product-display.tsx','utf8');
const lm = src.match(/const A_LOCNO_MAP[^=]*= \{([\s\S]*?)\};/)[1];
const ln = src.match(/const A_LOCNOS_MAP[^=]*= \{([\s\S]*?)\};/)[1];
const parse = (t)=>{const o={};for(const m of t.matchAll(/"(L\d+-\d+)":\s*(\[[^\]]+\]|\d+)/g)){o[m[1]]=m[2].startsWith("[")?JSON.parse(m[2]):[Number(m[2])]}return o;};
const M1=parse(lm), M2=parse(ln);
const colMap={L1:9,L2:7,L3:6,L4:4,L5:3,L6:1};
const coord={};
const put=(c,n)=>{coord[c]=n;};
for(const[k,v]of Object.entries(M1)){const m2=/^(L\d+)-(\d+)$/.exec(k);const l7=m2[1]==="L7";const cx=l7?Number(m2[2]):colMap[m2[1]];put(`${cx}-${l7?1:Number(m2[2])+2}`,v);}
for(const[k,v]of Object.entries(M2)){const m2=/^(L\d+)-(\d+)$/.exec(k);const l7=m2[1]==="L7";const cx=l7?Number(m2[2]):colMap[m2[1]];put(`${cx}-${l7?1:Number(m2[2])+2}`,v);}
const checks=[["9-3",[37]],["4-14",[61]],["4-16",[65]],["9-21",[1]],["9-12",[20]],["3-3",[77,78]],["1-3",[79,80]],["4-18",[69,70]],["6-18",[71,72]],["4-19",[73]],["6-19",[74]],["4-20",[75]],["6-20",[76]],["1-1",[136,137]],["6-14",[62]]];
let pass=true;
for(const[c,e]of checks){const g=coord[c]||null;const ok=JSON.stringify(g)===JSON.stringify(e);if(!ok)pass=false;console.log(`${c}: ${JSON.stringify(g)} 기대 ${JSON.stringify(e)} ${ok?'OK':'FAIL'}`);}
const all=[].concat(...Object.values(coord)).sort((a,b)=>a-b);
const uniq=[...new Set(all)];
const missing=[];for(let i=1;i<=151;i++)if(!uniq.includes(i))missing.push(i);
const dup=all.filter((v,i)=>all.indexOf(v)!==i);
console.log(`전체: ${uniq.length}개, 1~151 누락: [${missing}], 중복: [${dup}]`);
console.log(pass&&missing.length===0&&dup.length===0?'ALL PASS':'CHECK NEEDED');
