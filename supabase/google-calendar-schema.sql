-- ============================================================
-- 구글 캘린더 연동 — 테이블 + RLS
-- ------------------------------------------------------------
-- 사용법: Supabase 대시보드 → SQL Editor → New query → 통째로 붙여넣고 Run.
--         여러 번 실행해도 안전하다(if not exists / drop-create).
--
-- 설계 핵심 (docs/구글-캘린더-연동.md):
--   1. 구글 refresh 토큰은 '서버(Edge Function, service_role)'에서만 만진다.
--      → 클라이언트가 읽을 수 있는 정책을 '하나도' 만들지 않는다. RLS 기본 거부에 맡긴다.
--   2. 동기화된 달 일정만 본인이 읽는다. 쓰기는 서버만.
--   3. (설계 변경 2026-07-22) OAuth state 는 별도 테이블 대신 '로그인 access_token' 을 그대로 쓴다.
--      콜백이 admin.auth.getUser(state) 로 신원+위조를 한 번에 검증 → google_oauth_states 테이블 폐기.
-- ============================================================

-- ------------------------------------------------------------
-- 1) 구글 토큰 (⚠ 서버 전용 — 클라이언트는 한 줄도 못 읽는다)
-- ------------------------------------------------------------
create table if not exists public.google_calendar_tokens (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,          -- 서버(Edge Function)만 사용. 절대 클라이언트로 내보내지 않는다.
  connected_at  timestamptz not null default now()
);
alter table public.google_calendar_tokens enable row level security;
-- 정책을 '하나도' 만들지 않는다 → RLS 가 모든 클라이언트 접근을 기본 거부한다.
--   Edge Function 은 service_role 로 붙어 RLS 를 우회하므로 정상 동작한다.

-- ------------------------------------------------------------
-- 2) 동기화된 달 일정 (본인만 읽기 / 쓰기는 서버만)
--    이 행의 '존재' 자체가 "구글 캘린더를 연결했다"는 신호로도 쓰인다.
-- ------------------------------------------------------------
create table if not exists public.calendar_schedules (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  schedule  jsonb not null,             -- CalendarSchedule 구조 { events, rangeStart, rangeEnd, syncedAt }
  synced_at timestamptz not null default now()
);
alter table public.calendar_schedules enable row level security;

drop policy if exists "본인 캘린더 조회" on public.calendar_schedules;
create policy "본인 캘린더 조회"
  on public.calendar_schedules for select
  using (auth.uid() = user_id);
-- insert/update 정책은 만들지 않는다 → 클라이언트는 못 쓰고 Edge Function(service_role)만 쓴다.

-- ------------------------------------------------------------
-- (폐기) google_oauth_states — 더는 만들지 않는다.
--    설계 변경으로 state = 로그인 access_token 이 됐다(위 설명 참고). 별도 state 테이블이 필요 없다.
--    ⚠ 이전 버전 SQL 을 이미 돌려 이 테이블이 남아 있다면, 아래 한 줄로 정리해도 된다(선택, 무해):
--        drop table if exists public.google_oauth_states;
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3) Realtime 발행 — 서버가 동기화하면 앱/위젯이 즉시 갱신되도록
-- ------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.calendar_schedules;
exception when duplicate_object then null; end $$;
