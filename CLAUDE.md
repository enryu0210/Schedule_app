# 프로젝트: 일정공방 (주간 계획표)

## 구조
- 웹 앱은 `web/` 하위에 있음 — 모든 npm 명령은 `web/`에서 실행
- 스택: React + Vite + TypeScript(strict), Supabase(클라우드 저장), 카카오 로그인
- 데이터 모델: `web/src/types.ts` — Preset → DayPlan(7개) → ScheduleBlock
- 디자인 토큰(색/여백)은 `web/src/styles/tokens.css`, 컴포넌트는 1파일 1기능

## 빌드 / 검증 / 실행
- 빌드+타입체크: `cd web && npm run build` (`tsc -b && vite build`)
- 개발 서버: `cd web && npm run dev` → http://localhost:5173
- 주의: 카카오/Supabase 로그인 게이트 때문에 메인 화면(Planner)은
  인증 없이 브라우저 QA 불가 → UI 변경은 빌드 통과로 1차 검증

## 동작 / 배포
- 프리셋 데이터는 클라우드 자동 저장(`usePresetStore`) — 별도 저장 버튼 없음
- `origin/main` 푸쉬 시 자동 배포 → 푸쉬 전 확인받기
