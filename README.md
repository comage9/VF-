# VF 생산 계획 모바일 UI 개선 프로젝트

## 📱 프로젝트 개요
VF 프로젝트의 생산 계획 페이지를 모바일 환경에서 더 효과적으로 사용할 수 있도록 UI/UX를 개선하는 프로젝트입니다.

## 🎯 주요 기능
1. **색상 컬러링**: 색상명을 실제 컬러로 표시 (방안 A: 텍스트+배경)
2. **수량 변환**: 낱개(pcs) → 박스 → 팔레트 단위 표시
3. **진행률 추적**: 실시간 작업량 모니터링
4. **모바일 최적화**: 터치 인터페이스 지원

## 📁 프로젝트 구조

```
workspace/
├── 컴포넌트/              # React 컴포넌트
│   ├── ProgressBar.tsx     # 진행률 바
│   ├── StatusIndicator.tsx # 상태 표시기
│   ├── ProgressCard.tsx    # 통합 진행 카드
│   └── MobileProductionCard.tsx # 모바일 카드
├── 유틸리티/              # 핵심 유틸리티
│   ├── color-mapping-utility.ts # 색상 매핑
│   └── quantity-calculator.ts   # 수량 계산
├── 데이터/                # 동기화 데이터
│   ├── vf_production_data.json  # 생산 데이터
│   └── vf_master_specs.json     # 마스터 스펙
├── 문서/                  # 옵시디언 문서
│   ├── VF-생산-계획-최종-색상-매핑.md
│   ├── mobile-card-spec.md
│   └── vf_production_mobile_ui_test_report.md
├── wiki/                  # 옵시디언 지식 베이스
│   ├── concepts/          # 개념 문서
│   └── entities/          # 엔티티 문서
├── .obsidian/            # 옵시디언 설정
└── MEMORY.md             # 프로젝트 메모리
```

## 🔧 사용 방법

### 옵시디언으로 문서 보기
1. 옵시디언 앱을 설치합니다.
2. 이 폴더를 옵시디언 볼트로 엽니다.
3. `wiki/` 폴더의 문서들을 탐색합니다.

### 컴포넌트 사용하기
```typescript
import { MobileProductionCard } from './컴포넌트/MobileProductionCard';
import { getColorStyle } from './유틸리티/color-mapping-utility';
import { calculateQuantity } from './유틸리티/quantity-calculator';

// 색상 컬러링 예제
const colorStyle = getColorStyle('WHITE1');
// 결과: { textColor: '#000000', backgroundColor: '#F5F5F5' }

// 수량 계산 예제
const quantity = calculateQuantity(1000, 30, 20);
// 결과: 33박스 1팔레트
```

### 데이터 동기화
```bash
# Windows 서버에서 데이터 가져오기
cd /home/comage/.openclaw/workspace/skills/vf-production/scripts
bash fetch-production.sh summary
```

## 🚀 빠른 시작

### 1. 저장소 클론
```bash
git clone [저장소_URL] vf-production-mobile-ui
cd vf-production-mobile-ui
```

### 2. 의존성 설치 (프로젝트에 따라)
```bash
npm install
# 또는
yarn install
```

### 3. 개발 서버 실행
```bash
npm run dev
# 또는
yarn dev
```

## 📊 데이터 소스
- **Windows 서버**: `http://bonohouse.p-e.kr:5174`
- **API 엔드포인트**: `/api/production`, `/api/master/specs`
- **동기화 스크립트**: `skills/vf-production/scripts/fetch-production.sh`

## 🛠️ 기술 스택
- **언어**: TypeScript
- **프레임워크**: React
- **스타일링**: CSS-in-JS
- **문서화**: 옵시디언 (Markdown)
- **버전 관리**: Git

## 🤖 Claude Code 연동
이 프로젝트는 Claude Code를 활용하여 개발되었습니다.

**연결 방법:**
```bash
claude --permission-mode bypassPermissions --print "작업 지시"
```

## 📝 문서 링크

### 핵심 문서
- [[VF-생산-계획-최종-색상-매핑]] - 색상 컬러 매핑 테이블
- [[VF-생산-계획-색상-매핑]] - 원본 색상 데이터
- [[메모리-시스템-가이드]] - 프로젝트 진행 상황 기록

### 기술 문서
- [[vf_production_mobile_ui_test_report]] - 테스트 보고서
- [[mobile-card-spec]] - 모바일 카드 명세서

## 🔄 업데이트 내역

### v1.0.0 (2026-04-16)
- ✅ 모든 핵심 컴포넌트 구현 완료
- ✅ 색상 매핑 시스템 완성
- ✅ 수량 계산 로직 구현
- ✅ 옵시디언 문서화 완료
- ✅ Git 동기화 준비 완료

## 📞 지원 및 문의
- **프로젝트 관리**: 주현 김
- **기술 구현**: Claude Code + OpenClaw
- **문서화**: 옵시디언 + Git

## ⚖️ 라이선스
이 프로젝트는 VF 프로젝트 내부 사용을 목적으로 합니다.

---
*이 README는 자동으로 생성되었습니다. 최신 정보는 Git 저장소를 참조하세요.*