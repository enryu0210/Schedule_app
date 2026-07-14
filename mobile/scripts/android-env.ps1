# 안드로이드 빌드 환경을 "이 기기에 맞게" 찾아낸다.
#
# 왜 이 파일이 있나:
#   JDK 와 adb 의 설치 위치는 기기마다 다르다(관리자 설치 / 사용자 설치 / D: 드라이브 등).
#   예전엔 문서에 절대경로를 박아뒀다가 PC 를 바꾸자 그대로 복붙이 실패했다.
#   그래서 경로를 "찾는 법"만 남기고, 실제 경로는 실행 시점에 정한다.
#
# 사용법: 다른 스크립트에서 dot-source 한다 →  . "$PSScriptRoot\android-env.ps1"
# 내보내는 것: $env:JAVA_HOME, $script:Adb, $script:RepoRoot

# --- 저장소 루트 (드라이브가 C: 든 F: 든 상관없게 git 에게 물어본다) ---
$script:RepoRoot = (git rev-parse --show-toplevel) -replace '/', '\'
if (-not $script:RepoRoot) { throw "git 저장소 안에서 실행해야 합니다." }

# --- Android Studio 내장 JDK (Gradle 은 Java 23+ 와 안 맞아 반드시 이걸 쓴다) ---
$jdkCandidates = @(
    "$env:ProgramFiles\Android\Android Studio\jbr"
    "${env:ProgramFiles(x86)}\Android\Android Studio\jbr"
    "$env:LOCALAPPDATA\Programs\Android Studio\jbr"
    "$env:JAVA_HOME"   # 이미 알맞게 잡아둔 사람은 그대로 존중
)
$jdk = $jdkCandidates | Where-Object { $_ -and (Test-Path (Join-Path $_ 'bin\java.exe')) } | Select-Object -First 1
if (-not $jdk) {
    throw "Android Studio 의 JDK(jbr)를 못 찾았습니다. Android Studio 를 설치했는지 확인하거나, `$env:JAVA_HOME 을 직접 지정하세요."
}
$env:JAVA_HOME = $jdk

# --- adb (Android SDK platform-tools) ---
$adbCandidates = @(
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
    "$env:ANDROID_HOME\platform-tools\adb.exe"
    "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe"
    "$env:ProgramFiles\Android\Android Sdk\platform-tools\adb.exe"
)
$script:Adb = $adbCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $script:Adb) {
    # adb 가 없어도 APK 빌드는 된다 → 설치 단계에서만 문제이므로 여기선 경고만 한다.
    Write-Warning "adb 를 못 찾았습니다. APK 빌드는 되지만 폰에 바로 설치할 수는 없습니다."
}

Write-Host "저장소 : $script:RepoRoot"
Write-Host "JDK    : $env:JAVA_HOME"
Write-Host "adb    : $(if ($script:Adb) { $script:Adb } else { '(없음)' })"
