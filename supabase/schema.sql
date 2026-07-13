-- ============================================================
-- 주간 계획표 앱 - Supabase 데이터베이스 스키마
-- ------------------------------------------------------------
-- 사용법: Supabase 대시보드 → 왼쪽 메뉴 "SQL Editor" → New query
--        → 이 파일 내용을 통째로 붙여넣고 "Run" 실행.
--
-- 설계 방침(MVP):
--   프리셋 개수가 많지 않으므로, 사용자별로 프리셋 목록 전체를
--   하나의 JSON(jsonb) 컬럼에 통째로 저장한다. (로컬 저장 구조와 1:1로 단순)
--   나중에 프리셋 공유/검색이 필요해지면 그때 정규화하면 된다.
-- ============================================================

-- 1) 사용자별 데이터 테이블
create table if not exists public.user_data (
  -- auth.users 의 id 를 그대로 기본키로 사용 (1인 1행)
  user_id           uuid primary key references auth.users (id) on delete cascade,
  -- 프리셋 목록 전체를 담는 JSON 배열
  presets           jsonb not null default '[]'::jsonb,
  -- 마지막으로 보던 프리셋 id
  selected_preset_id text,
  updated_at        timestamptz not null default now()
);

-- 2) 행 수준 보안(RLS) 활성화: 남의 데이터에 접근 못 하게 막는다.
alter table public.user_data enable row level security;

-- 3) 정책: 본인(user_id = 로그인한 유저)의 행만 읽고/쓰기 가능.
--    (이미 존재하면 지우고 다시 만들어, 여러 번 실행해도 안전하게)
drop policy if exists "본인 데이터 조회" on public.user_data;
create policy "본인 데이터 조회"
  on public.user_data for select
  using (auth.uid() = user_id);

drop policy if exists "본인 데이터 추가" on public.user_data;
create policy "본인 데이터 추가"
  on public.user_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "본인 데이터 수정" on public.user_data;
create policy "본인 데이터 수정"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4) updated_at 자동 갱신 트리거 (수정 시각을 항상 최신으로)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_data_updated_at on public.user_data;
create trigger trg_user_data_updated_at
  before update on public.user_data
  for each row execute function public.set_updated_at();

-- 5) Realtime 발행 등록
--    데스크탑 위젯이 "웹에서 방금 고친 시간표"를 곧바로 보여주려면, 폴링만으로는 늦다(최대 1분).
--    이 테이블의 변경을 Realtime 으로 발행해 위젯이 구독하게 한다.
--    (RLS 는 그대로 적용된다 — 남의 행 변경은 애초에 전달되지 않는다)
--    이미 등록돼 있으면 duplicate_object 오류가 나므로, 여러 번 실행해도 안전하게 감싼다.
do $$
begin
  alter publication supabase_realtime add table public.user_data;
exception
  when duplicate_object then null;
end $$;
