# 폰에 디버그 APK 를 빌드해서 설치한다. (PowerShell 에서 실행)
#
#   .\mobile\scripts\install-debug.ps1            # 웹 재빌드 없이 설치만
#   .\mobile\scripts\install-debug.ps1 -Sync      # 웹 코드를 고쳤을 때 (web/dist 를 다시 번들)
#
# 경로를 기기마다 손대지 않아도 되게, JDK/adb/저장소 위치는 android-env.ps1 이 찾아준다.

param(
    # 웹 코드를 고쳤다면 반드시 켠다. 안드로이드 앱은 web/dist 를 APK 안에 "번들" 하기 때문에
    # 동기화를 안 하면 폰에서 예전 화면이 그대로 뜬다. (데스크탑 위젯과 다른 점)
    [switch]$Sync
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\android-env.ps1"

# --- 폰이 연결돼 있는지 먼저 본다 (빌드에 몇 분 쓰고 나서 실패하면 아깝다) ---
if (-not $script:Adb) { throw "adb 를 찾지 못해 설치할 수 없습니다." }
$devices = & $script:Adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' }
if (-not $devices) {
    throw @"
연결된 기기가 없습니다. 폰에서 아래를 확인하세요.
  1) 설정 → 휴대전화 정보 → 빌드번호 7번 탭 (개발자 옵션 켜기)
  2) 개발자 옵션 → USB 디버깅 ON
  3) USB 연결 후 폰에 뜨는 'USB 디버깅을 허용하시겠습니까?' → 허용
  (무선이라면: adb pair <IP:포트> 후 adb connect <IP:포트>)
"@
}
Write-Host "연결된 기기: $($devices -join ', ')" -ForegroundColor Green

if ($Sync) {
    Write-Host "`n[1/2] 웹 빌드 + 안드로이드로 복사 (npm run sync)..." -ForegroundColor Cyan
    Push-Location (Join-Path $script:RepoRoot 'mobile')
    try { npm run sync; if ($LASTEXITCODE -ne 0) { throw "npm run sync 실패" } } finally { Pop-Location }
}

Write-Host "`n[2/2] APK 빌드 + 설치 (gradlew installDebug)..." -ForegroundColor Cyan
Push-Location (Join-Path $script:RepoRoot 'mobile\android')
try {
    .\gradlew.bat installDebug
    if ($LASTEXITCODE -ne 0) { throw "gradlew installDebug 실패" }
} finally { Pop-Location }

Write-Host "`n설치 완료. 폰에서 '일정공방' 앱을 열어 카카오 로그인을 확인하세요." -ForegroundColor Green
Write-Host "웹뷰 콘솔이 필요하면 PC 크롬에서 chrome://inspect" -ForegroundColor DarkGray
