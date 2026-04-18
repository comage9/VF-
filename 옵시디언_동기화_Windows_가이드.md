# 옵시디언 동기화 Windows 명령어 가이드

## 📁 현재 작업 공간 구조
```
C:\Users\[사용자명]\.openclaw\workspace\
├── .obsidian\          # 옵시디언 설정
├── 문서\              # 모든 프로젝트 문서
├── 메모리\            # 시스템 메모리
├── 컴포넌트\          # VF 프로젝트
├── 유틸리티\          # VF 프로젝트
├── 데이터\            # VF 프로젝트
└── ki-ai-trader\      # 키 프로젝트
```

## 🔄 동기화 방법

### 방법 1: Git을 이용한 동기화 (권장)

#### 1. Git 설치 확인
```powershell
# PowerShell에서 실행
git --version
```

#### 2. Git 저장소 초기화 (처음 한 번만)
```powershell
cd C:\Users\[사용자명]\.openclaw\workspace
git init
git add .
git commit -m "Initial commit: OpenClaw workspace"
```

#### 3. 원격 저장소 연결 (GitHub, GitLab 등)
```powershell
# GitHub 예시
git remote add origin https://github.com/[사용자명]/openclaw-workspace.git
git branch -M main
git push -u origin main
```

#### 4. 동기화 명령어
```powershell
# 변경사항 업로드
cd C:\Users\[사용자명]\.openclaw\workspace
git add .
git commit -m "업데이트: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git push

# 변경사항 다운로드
cd C:\Users\[사용자명]\.openclaw\workspace
git pull
```

### 방법 2: rsync를 이용한 Linux ↔ Windows 동기화

#### 1. Windows에 rsync 설치
```powershell
# Chocolatey 패키지 매니저 설치 (관리자 권한 PowerShell)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# rsync 설치
choco install rsync -y
```

#### 2. Linux에서 Windows로 동기화
```bash
# Linux에서 실행 (현재 시스템)
rsync -avz --progress ~/.openclaw/workspace/ user@windows-ip:/mnt/c/Users/[사용자명]/.openclaw/workspace/
```

#### 3. Windows에서 Linux로 동기화
```powershell
# PowerShell에서 실행
rsync -avz --progress /mnt/c/Users/[사용자명]/.openclaw/workspace/ user@linux-ip:~/.openclaw/workspace/
```

### 방법 3: Windows 작업 스케줄러를 이용한 자동 동기화

#### 1. 동기화 스크립트 생성
`C:\Users\[사용자명]\sync_openclaw.ps1` 파일 생성:
```powershell
# sync_openclaw.ps1
$workspace = "C:\Users\[사용자명]\.openclaw\workspace"
$logFile = "C:\Users\[사용자명]\sync_log.txt"

Write-Output "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - 동기화 시작" | Out-File -Append $logFile

try {
    cd $workspace
    git add .
    git commit -m "자동 업데이트: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    git push
    Write-Output "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - 동기화 성공" | Out-File -Append $logFile
} catch {
    Write-Output "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - 동기화 실패: $_" | Out-File -Append $logFile
}
```

#### 2. 작업 스케줄러 등록
```powershell
# PowerShell 관리자 권한으로 실행
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-File C:\Users\[사용자명]\sync_openclaw.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At "09:00AM"
$trigger2 = New-ScheduledTaskTrigger -Daily -At "06:00PM"
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "OpenClawWorkspaceSync" -Action $action -Trigger $trigger, $trigger2 -Principal $principal
```

## 🚀 빠른 시작을 위한 배치 파일

### 1. Git 동기화 배치 파일
`C:\Users\[사용자명]\sync_git.bat`:
```batch
@echo off
cd /d "C:\Users\[사용자명]\.openclaw\workspace"
echo 현재 시간: %date% %time%
git add .
git commit -m "업데이트: %date% %time%"
git push
pause
```

### 2. 옵시디언 실행 배치 파일
`C:\Users\[사용자명]\open_obsidian.bat`:
```batch
@echo off
start "" "C:\Program Files\Obsidian\Obsidian.exe" "C:\Users\[사용자명]\.openclaw\workspace"
```

## ⚙️ 옵시디언 플러그인 추천 (동기화용)

1. **Obsidian Git** - Git 통합
2. **Sync** - 공식 동기화 서비스
3. **Remotely Save** - 다양한 클라우드 서비스 지원
4. **File Order** - 파일 정렬

## 🔧 문제 해결

### Git 오류 발생 시
```powershell
# Git 캐시 초기화
git rm -r --cached .
git add .
git commit -m "캐시 초기화"
```

### 권한 문제 발생 시
```powershell
# PowerShell 관리자 권한으로 실행
icacls "C:\Users\[사용자명]\.openclaw" /grant "[사용자명]:(OI)(CI)F"
```

### 네트워크 문제 발생 시
```powershell
# 방화벽 규칙 추가
New-NetFirewallRule -DisplayName "OpenClaw Sync" -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow
```

## 📞 지원

문제가 발생하면 다음을 확인하세요:
1. Git이 설치되어 있는지
2. 네트워크 연결 상태
3. 파일 권한 설정
4. 방화벽 설정

---
*이 문서는 OpenClaw 시스템에서 자동 생성되었습니다.*
*업데이트: 2026년 4월 18일*
```