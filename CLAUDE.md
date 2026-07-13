# 프로젝트: 일정공방 (주간 계획표)

## 구조
- 웹 앱은 `web/` 하위에 있음 — 모든 npm 명령은 `web/`에서 실행
- 데스크탑 위젯은 `desktop/` (Tauri 2 + Rust, 윈도우 전용) — 설계·릴리스 절차는 `docs/위젯-설계.md`
- 안드로이드 앱은 `mobile/` (Capacitor 7 + Android) — 빌드·로그인 흐름은 `docs/안드로이드-앱.md`.
  **데스크탑 위젯과 달리 `web/dist` 를 APK 안에 번들** → 웹 코드를 고치면 `cd mobile; npm run sync` 후 재빌드해야 반영됨
- 스택: React + Vite + TypeScript(strict), Supabase(클라우드 저장), 카카오 로그인
- 데이터 모델: `web/src/types.ts` — Preset → DayPlan(7개) → ScheduleBlock
- 디자인 토큰(색/여백)은 `web/src/styles/tokens.css`, 컴포넌트는 1파일 1기능

## 빌드 / 검증 / 실행
- 빌드+타입체크: `cd web && npm run build` (`tsc -b && vite build`)
- 개발 서버: `cd web && npm run dev` → http://localhost:5173
- 주의: 카카오/Supabase 로그인 게이트 때문에 메인 화면(Planner)은
  인증 없이 브라우저 QA 불가 → UI 변경은 빌드 통과로 1차 검증
- 위젯 빌드는 **반드시 PowerShell**에서 (`cd desktop; npm run build`).
  Git Bash 는 MinGW 의 `link.exe` 가 MSVC 링커를 가려 빌드가 깨짐.
  PATH 에 cargo 추가 필요: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`

## 동작 / 배포
- 프리셋 데이터는 클라우드 자동 저장(`usePresetStore`) — 별도 저장 버튼 없음
- `origin/main` 푸쉬 시 자동 배포 → 푸쉬 전 확인받기

## 위젯 (반드시 알 것)
- **위젯은 배포된 웹앱을 `?widget=1` 로 로드한다.** 따라서 웹 코드를 고쳐도
  **푸시 → Vercel 배포 전에는 위젯에서 확인 불가.** 위젯 화면 버그는 웹/셸 중 어디 문제인지 먼저 가릴 것.
- 창의 성질(트레이·크기·우클릭 차단·권한)은 **셸(Rust)** 책임 → 고치면 재빌드·재설치 필요.
- 웹에서 Tauri 창 API 를 쓰면 `desktop/src-tauri/capabilities/default.json` 에 권한을 추가해야 함.
- 릴리스: GitHub Releases + 자산명 고정(`Schedule-Widget-Setup.exe`) + `latest.json`(자동 업데이트용).
  서명 키는 `~/.tauri/` (저장소 밖, 분실 시 업데이트 영구 불가).

## PowerShell 5.1 함정 (실제로 겪음)
- `$env:VAR = ""` 는 값 대입이 아니라 **변수 삭제** → 빈 문자열 전달 불가
- `Set-Content -Encoding utf8` 은 **BOM 을 붙임** → Rust(serde_json) 파싱 실패.
  BOM 없는 UTF-8 은 `[System.IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding($false)))`
