# 구현 지시서: ②구간(L3/L4) 결함 보정 — 69/70 누락·72~75 중복 해소

> 아래 편집을 **정확히 그대로** 적용하라. 앵커(정확 일치)를 찾아 주어진 텍스트로 교체한다.
> 대상: `frontend/client/src/pages/product-display.tsx`
> 배경: 전수 검증에서 ②구간(39~76)에 누락 69·70, 중복 72~75 확인 — 원인은 L3-16/L4-16 다품목 셀의 이중 정의.
> 카논 제약(모두 유지): ①구간 1~38 고정 / (4,14)=61 / ③구간 77=(3,3) 시작 / 전체 1~151 연속 무중복.

## Edit 1 — A_LOCNO_MAP ②구간 후반 교체 (12~19)

앵커(정확 일치, 6줄):
```
  "L4-12": 61, "L3-12": 62,
  "L4-13": 63, "L3-13": 64,
  "L4-14": 65, "L3-14": 66,
  "L4-15": 67, "L3-15": 68,
  "L4-16": 69, "L3-16": 70,
  "L4-17": 71, "L3-17": 72,
  "L4-18": 73, "L3-18": 74,
  "L4-19": 75, "L3-19": 76,
```
교체:
```
  "L4-12": 61, "L3-12": 62,
  "L4-13": 63, "L3-13": 64,
  "L4-14": 65, "L3-14": 66,
  "L4-15": 67, "L3-15": 68,
  // 슬롯16: L4-16·L3-16 다품목(2품목씩) → A_LOCNOS_MAP [69,70]·[71,72]로 소진 — 39~76 정확 마감
  // 슬롯19(L4-19/L3-19): 카논 경계 — ③구간 77=(3,3) 시작으로 번호 미부여 (L3-19 존 부재)
  "L4-17": 73, "L3-17": 74,
  "L4-18": 75, "L3-18": 76,
```

## Edit 2 — A_LOCNOS_MAP L3-16/L4-16 교체

앵커(정확 일치, 1줄):
```
  "L3-16": [74, 75], "L4-16": [72, 73],
```
교체:
```
  "L4-16": [69, 70], "L3-16": [71, 72],
```

## 금지 사항

- ①구간(1~38)·③구간(77~135)·L7(136~151) **수정 금지**
- 좌표 계산·A_COORD_NOS 생성 로직 **수정 금지** (맵만 바꾸면 자동 반영)
- 그 외 모든 변경 금지

## 검증 (마지막에 반드시 실행)

1. `frontend/client`에서 `npx tsc --noEmit 2>&1 | grep product-display | grep -v TS6133` → 신규 오류 0건
2. `npm run build` 통과
3. 아래 노드 스크립트를 `frontend/client/scripts-check-sec2.mjs`로 저장해 `node frontend/client/scripts-check-sec2.mjs` 실행하고 결과를 그대로 출력 (완료 후 스크립트 파일은 삭제하지 말고 유지):
```js
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
```
기대: (4,18)=[69,70]·(6,18)=[71,72]·(4,19)=73·(6,19)=74·(4,20)=75·(6,20)=76 · 전체 1~151 누락 0 중복 0 → ALL PASS
4. 변경 요약 출력
