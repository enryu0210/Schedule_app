# 배포용(서명된) APK 를 만든다.
#
#   .\mobile\scripts\build-release.ps1
#
# 결과물: dist\일정공방-<버전>.apk  ← 이 파일 하나만 사람들에게 주면 된다.
#
# 디버그 APK 와 다른 점:
#   - 디버그 키가 아니라 **우리 릴리스 키**로 서명된다 → 다음 버전이 "업데이트"로 인식된다
#     (디버그 APK 위에 릴리스 APK 를 덮어 깔 수는 없다. 서명이 달라 설치가 거부된다 — 지우고 깔아야 한다)
#   - 폰에서 "출처를 알 수 없는 앱" 설치 허용은 여전히 필요하다(스토어를 통하지 않으므로)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\android-env.ps1"

$propsPath = Join-Path $env:USERPROFILE '.ilgongbang\android-keystore.properties'
if (-not (Test-Path $propsPath)) {
    throw @"
서명 키가 없습니다. 먼저 한 번 만들어 주세요:

    .\mobile\scripts\make-keystore.ps1

(키는 저장소 밖 ~/.ilgongbang/ 에 만들어집니다. 잃어버리면 업데이트를 줄 수 없으니 백업하세요)
"@
}

# 웹 코드를 APK 안에 번들하므로, 배포 빌드는 항상 최신 웹으로 다시 굽는다.
Write-Host "`n[1/3] 웹 빌드 + 안드로이드로 복사..." -ForegroundColor Cyan
Push-Location (Join-Path $script:RepoRoot 'mobile')
try { npm run sync; if ($LASTEXITCODE -ne 0) { throw "npm run sync 실패" } } finally { Pop-Location }

Write-Host "`n[2/3] 릴리스 APK 빌드 + 서명..." -ForegroundColor Cyan
Push-Location (Join-Path $script:RepoRoot 'mobile\android')
try {
    .\gradlew.bat assembleRelease
    if ($LASTEXITCODE -ne 0) { throw "assembleRelease 실패" }
} finally { Pop-Location }

# 버전 이름은 build.gradle 이 유일한 출처다 — 여기서 따로 적으면 두 곳이 어긋난다.
$gradleFile = Join-Path $script:RepoRoot 'mobile\android\app\build.gradle'
$versionName = (Select-String -Path $gradleFile -Pattern 'versionName\s+"([^"]+)"').Matches[0].Groups[1].Value

$apk = Join-Path $script:RepoRoot 'mobile\android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apk)) { throw "APK 를 찾지 못했습니다: $apk" }

$distDir = Join-Path $script:RepoRoot 'dist'
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
# 파일명은 일부러 영문으로 둔다 — 한글 파일명은 카톡·드라이브·다른 OS 를 거치며 깨진다.
$out = Join-Path $distDir "ilgongbang-$versionName.apk"
Copy-Item $apk $out -Force

Write-Host "`n[3/3] 완료" -ForegroundColor Green
Write-Host "  $out  ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB)"
Write-Host ""
Write-Host "이 파일을 GitHub Releases 에 올리거나, 카톡/드라이브로 전달하면 됩니다." -ForegroundColor DarkGray
Write-Host "받는 사람은 '출처를 알 수 없는 앱' 설치를 허용해야 합니다." -ForegroundColor DarkGray
