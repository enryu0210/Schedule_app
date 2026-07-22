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
--   3. OAuth state 는 "이 연결이 어떤 사용자 것인지 + CSRF 방지"용 일회성 표식.
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
-- 3) OAuth state (일회성 — 어떤 사용자의 연결인지 + CSRF 방지)
--    클라이언트가 연결을 시작할 때 자기 것으로 한 줄 만들고,
--    콜백(Edge Function)이 그걸로 사용자를 알아낸 뒤 즉시 지운다.
-- ------------------------------------------------------------
create table if not exists public.google_oauth_states (
  state      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.google_oauth_states enable row level security;

-- 클라이언트는 '자기 것'만 만들 수 있다. (읽기/삭제는 서버만 — state 는 랜덤이라 CSRF 안전)
drop policy if exists "본인 state 생성" on public.google_oauth_states;
create policy "본인 state 생성"
  on public.google_oauth_states for insert
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 4) Realtime 발행 — 서버가 동기화하면 앱/위젯이 즉시 갱신되도록
-- ------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.calendar_schedules;
exception when duplicate_object then null; end $$;
