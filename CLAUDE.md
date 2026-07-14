# 프로젝트: 일정공방 (주간 계획표)

## 구조
- 웹 앱은 `web/` 하위에 있음 — 모든 npm 명령은 `web/`에서 실행
- 데스크탑 위젯은 `desktop/` (Tauri 2 + Rust, 윈도우 전용) — 설계·릴리스 절차는 `docs/위젯-설계.md`
- 안드로이드 앱은 `mobile/` (Capacitor 7 + Android) — 빌드·로그인 흐름은 `docs/안드로이드-앱.md`.
  **데스크탑 위젯과 달리 `web/dist` 를 APK 안에 번들** → 웹 코드를 고치면 `cd mobile; npm run sync` 후 재빌드해야 반영됨.
  빌드/설치는 `.\mobile\scripts\install-debug.ps1` (저장소·JDK·adb 경로를 기기에서 자동 탐색).
  **경로를 문서·스크립트에 하드코딩하지 말 것** — PC 마다 다르다(F: → C: 로 바뀌자 전부 실패했음)
- 스택: React + Vite + TypeScript(strict), Supabase(클라우드 저장), 카카오 로그인
- 데이터 모델: `web/src/types.ts` — Preset → DayPlan(7개) → ScheduleBlock
- 조직(팀) 워크스페이스는 `supabase/org-schema.sql` + `docs/조직-워크스페이스.md`.
  **개인 데이터(`user_data`)와 조직 데이터는 파일·테이블·RLS 부터 분리**되어 있다 —
  조직에 보이는 건 팀원이 직접 공유한 프리셋의 *사본* 뿐. 이 경계를 흐리지 말 것
- 디자인 토큰(색/여백)은 `web/src/styles/tokens.css`, 컴포넌트는 1파일 1기능

## 빌드 / 검증 / 실행
- 빌드+타입체크: `cd web && npm run build` (`tsc -b && vite build`)
- 개발 서버: `cd web && npm run dev` → http://localhost:5173
- 주의: 카카오/Supabase 로그인 게이트 때문에 메인 화면(Planner)은
  인증 없이 브라우저 QA 불가 → UI 변경은 빌드 통과로 1차 검증
- 위젯 빌드는 **반드시 PowerShell**에서 (`cd desktop; npm run build`).
  Git Bash 는 MinGW 의 `link.exe` 가 MSVC 링커를 가려 빌드가 깨짐.
  PATH 에 cargo 추가 필요: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`
- winget 이 "설치 성공"이라 해도 MSVC 가 없을 수 있다 → `VC\Tools\MSVC\*\bin\Hostx64\x64\link.exe`
  존재를 직접 확인할 것. 설치가 이미 돌고 있으면 락에 막혀 새 설치는 조용히 no-op 된다

## 동작 / 배포
- 프리셋 데이터는 클라우드 자동 저장(`usePresetStore`) — 별도 저장 버튼 없음
- `origin/main` 푸쉬 시 자동 배포 → 푸쉬 전 확인받기
- **DB 스키마가 바뀌면 SQL 먼저 실행 → 확인 → 그다음 푸쉬.**
  코드를 먼저 배포하면 앱이 없는 컬럼을 조회해 화면이 통째로 깨진다(실제로 겪음)
- **작업(기능) 하나가 끝날 때마다 `docs/프로젝트-현황.md` 를 갱신할 것.**
  세션이 자주 끊기므로(PC 이동 등) 이 문서가 재개 시 유일한 출발점이다

## 위젯 (반드시 알 것)
- **위젯은 배포된 웹앱을 `?widget=1` 로 로드한다.** 따라서 웹 코드를 고쳐도
  **푸시 → Vercel 배포 전에는 위젯에서 확인 불가.** 위젯 화면 버그는 웹/셸 중 어디 문제인지 먼저 가릴 것.
- 배포해도 **떠 있는 위젯은 켤 때 받은 옛 화면 코드를 물고 있다** → 트레이 종료 후 재실행해야 갱신됨
  (Supabase 데이터는 Realtime 으로 계속 따라가지만, JS/CSS 는 재시작해야 바뀐다)
- 창의 성질(트레이·크기·우클릭 차단·권한)은 **셸(Rust)** 책임 → 고치면 재빌드·재설치 필요.
- 웹에서 Tauri 창 API 를 쓰면 `desktop/src-tauri/capabilities/default.json` 에 권한을 추가해야 함.
- 릴리스: GitHub Releases + 자산명 고정(`Schedule-Widget-Setup.exe`) + `latest.json`(자동 업데이트용).
  서명 키는 `~/.tauri/` (저장소 밖, 분실 시 업데이트 영구 불가).

## Supabase RLS 함정 (조직 기능에서 겪음)
- 정책이 **자기 테이블을 조회하면 무한 재귀**로 쿼리가 통째로 실패 → `security definer` 함수로 끊고
  `set search_path = public` 을 반드시 박을 것(권한이 센 함수라 스키마 바꿔치기 통로가 된다)
- 승인/권한 컬럼이 있는 테이블에 **본인 행 update 를 허용하지 말 것** — 대기자가 자기 status 를
  'active' 로 바꿔 셀프 승인할 수 있다. 본인이 바꿔야 할 값은 RPC 로만 연다

## PowerShell 5.1 함정 (실제로 겪음)
- `$env:VAR = ""` 는 값 대입이 아니라 **변수 삭제** → 빈 문자열 전달 불가
- `Set-Content -Encoding utf8` 은 **BOM 을 붙임** → Rust(serde_json) 파싱 실패.
  BOM 없는 UTF-8 은 `[System.IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding($false)))`
