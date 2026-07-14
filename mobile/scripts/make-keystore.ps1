# 릴리스 서명 키(키스토어)를 만든다. **딱 한 번만** 실행한다.
#
#   .\mobile\scripts\make-keystore.ps1
#
# ⚠️ 안드로이드는 "같은 키로 서명된 APK" 만 업데이트로 인정한다.
#    이 키를 잃어버리면 기존 사용자는 앱을 지우고 새로 깔아야 한다(앱 데이터도 함께 사라진다).
#    만들고 나면 ~/.ilgongbang/ 폴더를 통째로 백업할 것.
#
# 키를 저장소 밖(홈 디렉터리)에 두는 이유: 커밋되면 누구나 우리 앱인 척하는 APK 를 만들 수 있다.

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\android-env.ps1" | Out-Null

$keyDir = Join-Path $env:USERPROFILE '.ilgongbang'
$keystore = Join-Path $keyDir 'ilgongbang.jks'
$propsPath = Join-Path $keyDir 'android-keystore.properties'

if (Test-Path $keystore) {
    Write-Host "이미 키스토어가 있습니다: $keystore" -ForegroundColor Yellow
    Write-Host "덮어쓰면 기존 사용자가 업데이트를 받을 수 없게 됩니다. 그대로 둡니다." -ForegroundColor Yellow
    exit 0
}

New-Item -ItemType Directory -Force -Path $keyDir | Out-Null

# 비밀번호는 사람이 외울 필요가 없다(설정 파일이 대신 기억한다) → 길고 무작위로 만든다.
$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = [Convert]::ToBase64String($bytes) -replace '[+/=]', 'x'

$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
if (-not (Test-Path $keytool)) { throw "keytool 을 찾지 못했습니다: $keytool" }

Write-Host "키스토어를 만듭니다 (유효기간 27년)..." -ForegroundColor Cyan
& $keytool -genkeypair -v `
    -keystore $keystore `
    -alias ilgongbang `
    -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $password -keypass $password `
    -dname "CN=Ilgongbang, OU=Dev, O=Ilgongbang, L=Seoul, C=KR"
if ($LASTEXITCODE -ne 0) { throw "키스토어 생성 실패" }

# Gradle 이 읽는 설정 파일.
#  - 경로에 백슬래시를 쓰면 .properties 규격상 이스케이프로 먹히므로 슬래시로 적는다.
#  - PowerShell 의 Set-Content -Encoding utf8 은 BOM 을 붙여 파싱을 깨뜨린다 → WriteAllText 로 쓴다.
$storeForProps = $keystore -replace '\\', '/'
$content = @"
storeFile=$storeForProps
storePassword=$password
keyAlias=ilgongbang
keyPassword=$password
"@
[System.IO.File]::WriteAllText($propsPath, $content, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "완료." -ForegroundColor Green
Write-Host "  키스토어 : $keystore"
Write-Host "  설정     : $propsPath"
Write-Host ""
Write-Host "⚠️  이 폴더를 반드시 백업하세요. 잃어버리면 기존 사용자에게 업데이트를 줄 수 없습니다." -ForegroundColor Yellow
Write-Host "    (앱을 지우고 새로 깔아야 하고, 그때 로그인·설정이 모두 사라집니다)" -ForegroundColor Yellow
