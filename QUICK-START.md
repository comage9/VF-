# VF Outbound-Tabs.tsx 수정 - 빠른 시작 가이드

## 30초 요약

```bash
# 1. 배치 파일 실행
create-outbound-fix.bat

# 2. 테스트 실행
node test-outbound-connection.js

# 3. 브라우저 접속
# http://localhost:3000
```

## 주요 파일

| 파일 | 설명 | 실행 방법 |
|------|------|-----------|
| `create-outbound-fix.bat` | 자동 설정 스크립트 | Windows에서 더블 클릭 또는 `create-outbound-fix.bat` |
| `test-outbound-connection.js` | 연결 테스트 스크립트 | `node test-outbound-connection.js` |
| `README-APPLY.txt` | 전체 가이드 | 텍스트 편집기로 열기 |

## 5분 긴급 적용

```batch
REM 1단계: 자동 설정
create-outbound-fix.bat

REM 배치 파일에서 서버 시작 선택:
REM 1. npm start
REM 2. npm run dev (권장)
REM 3. pm2 restart
REM 4. 건너뜀
```

```bash
# 2단계: 테스트
node test-outbound-connection.js

# 3단계: 브라우저 확인
# http://localhost:3000
```

## 30분 표준 적용

### 1단계: 환경 설정 (5분)
```batch
create-outbound-fix.bat
```

### 2단계: .env 설정 (5분)
```bash
# .env 파일 편집
VF_DATA_SOURCE=local
VF_DATA_PATH=./outbound-data.json
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 3단계: 서버 시작 (5분)
```bash
# 개발 모드
npm run dev

# 또는 프로덕션 모드
npm start

# 또는 PM2
pm2 start npm --name "vf-app" -- start
```

### 4단계: 테스트 (10분)
```bash
# 자동 테스트
node test-outbound-connection.js

# 수동 테스트
curl http://localhost:3000/api/outbound-tabs

# 브라우저 개발자 도구 (F12)
# Network 탭 확인
# Console 탭 확인
```

### 5단계: 기능 검증 (5분)
- [ ] Outbound Tabs 표시
- [ ] 데이터 로드
- [ ] 탭 전환
- [ ] 아이템 목록
- [ ] 반응형 디자인

## 2시간 전체 적용

상세 절차는 `README-APPLY.txt` 참조

### 주요 단계
1. **개발 환경 준비** (30분)
   - Git 브랜치 생성
   - 파일 백업
   - 의존성 검토

2. **환경 설정** (20분)
   - .env.production 생성
   - .env.development 생성
   - 환경 변수 검증

3. **코드 검토** (30분)
   - TypeScript 타입 확인
   - 에러 핸들링 확인
   - 테스트 작성

4. **포괄적 테스트** (20분)
   - 자동화 테스트
   - 통합 테스트
   - 브라우저 테스트
   - 성능 테스트

5. **문서화** (10분)
   - README.md 업데이트
   - API 문서 작성
   - 변경 로그 작성

6. **배포 준비** (20분)
   - 빌드 테스트
   - 배포 체크리스트
   - 롤백 계획

7. **배포 및 검증** (20분)
   - Git 커밋
   - PR 생성
   - 배포
   - 배포 후 검증

## 문제 해결

### .env 인코딩 문제
```batch
# 배치 파일 재실행
create-outbound-fix.bat
```

### 서버 시작 실패
```bash
# 포트 확인
netstat -ano | findstr :3000

# 다른 포트 사용
set PORT=3001
npm start
```

### API 연결 실패
```bash
# 라우트 확인
dir /s /b api\*.ts

# 로그 확인
pm2 logs
```

### 데이터 로드 실패
```bash
# JSON 유효성 확인
node -e "console.log(JSON.parse(require('fs').readFileSync('outbound-data.json')))"
```

### 테스트 실패
```bash
# 상세 로그 확인
node test-outbound-connection.js 2>&1

# 환경 재설정
create-outbound-fix.bat
```

## 유용한 명령어

### 서버 관리
```bash
npm start              # 프로덕션
npm run dev            # 개발 모드
npm run build          # 빌드
npm test               # 테스트
```

### PM2 관리
```bash
pm2 list               # 프로세스 목록
pm2 logs vf-app        # 로그
pm2 restart vf-app     # 재시작
pm2 stop vf-app         # 중지
pm2 monit              # 모니터링
```

### Git 관리
```bash
git status             # 상태
git diff               # 변경사항
git log --oneline      # 히스토리
```

### 테스트
```bash
node test-outbound-connection.js
curl http://localhost:3000/api/outbound-tabs
```

## 체크리스트

### 사전 확인
- [ ] 배치 파일 실행 완료
- [ ] .env 파일 생성
- [ ] 데이터 파일 생성
- [ ] 패키지 설치 완료
- [ ] 서버 시작 확인

### 기능 확인
- [ ] Outbound Tabs 렌더링
- [ ] 데이터 로드 성공
- [ ] 탭 전환 기능
- [ ] 아이템 표시
- [ ] 로딩 상태
- [ ] 에러 상태
- [ ] 반응형 디자인

### 배포 확인
- [ ] 모든 테스트 통과
- [ ] 빌드 성공
- [ ] 환경 변수 설정
- [ ] 백업 완료
- [ ] 롤백 계획
- [ ] 모니터링 설정

## 지원

### 문제 해결 순서
1. `create-outbound-fix.bat` 재실행
2. `node test-outbound-connection.js` 테스트
3. `README-APPLY.txt` 문제 해결 섹션 확인
4. 프로젝트 문서 검토
5. 팀원 문의

### 리소스
- Next.js: https://nextjs.org/docs
- React: https://react.dev
- TypeScript: https://www.typescriptlang.org/docs

## 빠른 레퍼런스

### 파일 경로
```
.env                     # 환경 변수
outbound-data.json       # 테스트 데이터
outbound-tabs.tsx        # 메인 컴포넌트
pages/api/outbound-tabs/ # API 라우트
```

### 환경 변수
```bash
VF_DATA_SOURCE=local|api
VF_DATA_PATH=./outbound-data.json
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_API_TIMEOUT=10000
NODE_ENV=development|production
```

### 포트
- 개발: 3000
- 대안: 3001, 3002

---

**버전**: 1.0.0  
**생성일**: 2026-04-16  
**빠른 시작**: `create-outbound-fix.bat` → `node test-outbound-connection.js` → 브라우저 접속
