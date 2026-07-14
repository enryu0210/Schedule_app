-- ============================================================
-- 일정공방 — 조직(팀/기업) 워크스페이스 스키마
-- ------------------------------------------------------------
-- 사용법: Supabase 대시보드 → SQL Editor → New query → 통째로 붙여넣고 Run.
--         여러 번 실행해도 안전하다(모두 if not exists / drop-create).
--
-- 설계 방침
--   1. 개인 데이터(user_data)는 한 줄도 건드리지 않는다.
--      개인 프리셋은 여전히 "본인만" 볼 수 있다. 조직 기능 때문에 개인 앱이 깨지면 최악이다.
--   2. 팀원이 "이 프리셋을 조직에 공유"를 눌렀을 때만, 그 시간표의 '사본'이
--      org_shared_schedules 에 저장되어 같은 조직 사람들에게 보인다.
--      → 프라이버시 경계선이 코드가 아니라 '테이블'에 물리적으로 존재한다.
--   3. 관리자는 팀원들이 공유한 시간표를 겹쳐 보고(빈 시간 찾기),
--      그걸 토대로 조직 공용 시간표(org_plans)를 짜서 배포한다.
-- ============================================================

-- ------------------------------------------------------------
-- 1) 조직
-- ------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  -- 초대 코드. 카카오 로그인 사용자는 이메일이 없을 수 있어서(Allow users without email),
  -- 이메일 초대는 쓸 수 없다. 그래서 '코드를 알려주고 입력하게' 하는 방식을 쓴다.
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 8)),
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2) 조직 구성원
-- ------------------------------------------------------------
create table if not exists public.org_members (
  org_id       uuid not null references public.organizations (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- admin: 조직 시간표를 배포할 수 있다 / member: 자기 시간표를 공유하고, 배포된 것을 본다
  role         text not null default 'member' check (role in ('admin', 'member')),
  -- 카카오 닉네임을 그대로 쓰면 나중에 바뀌었을 때 추적이 안 되므로, 조직 안에서 쓸 이름을 따로 둔다.
  display_name text not null default '',
  joined_at    timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- ------------------------------------------------------------
-- 3) 팀원이 조직에 '공유한' 시간표 (원본이 아니라 사본)
--    한 사람이 한 조직에 하나만 공유한다 — 여러 개를 올리면 관리자가 무엇을 봐야 할지 모른다.
-- ------------------------------------------------------------
create table if not exists public.org_shared_schedules (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Preset 구조 그대로({ id, label, days[7] }). 개인 프리셋을 복사해 넣는다.
  -- 사본이므로, 개인이 원본을 고치면 앱이 이 행도 다시 써준다.
  schedule   jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- ------------------------------------------------------------
-- 4) 관리자가 배포한 조직 공용 시간표
--    조직당 한 장으로 시작한다. (여러 장이 필요해지면 그때 id 를 추가해 확장한다)
-- ------------------------------------------------------------
create table if not exists public.org_plans (
  org_id     uuid primary key references public.organizations (id) on delete cascade,
  schedule   jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- RLS 헬퍼 함수
-- ------------------------------------------------------------
-- 왜 함수로 빼는가:
--   org_members 의 RLS 정책 안에서 다시 org_members 를 select 하면
--   "정책을 평가하려고 정책을 평가하는" 무한 재귀가 나서 쿼리가 통째로 실패한다.
--   security definer 함수는 RLS 를 우회해 조회하므로 이 고리를 끊는다.
--   (search_path 를 고정하는 이유: security definer 함수는 권한이 세서,
--    search_path 를 안 박아두면 스키마 바꿔치기 공격의 통로가 된다)
-- ============================================================
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org and user_id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- RLS 정책
-- ============================================================
alter table public.organizations       enable row level security;
alter table public.org_members         enable row level security;
alter table public.org_shared_schedules enable row level security;
alter table public.org_plans           enable row level security;

-- --- organizations ---
-- 조회: 내가 속한 조직만. (초대 코드로 가입하는 경로는 아래 join_org 함수가 따로 처리한다)
drop policy if exists "내 조직 조회" on public.organizations;
create policy "내 조직 조회"
  on public.organizations for select
  using (public.is_org_member(id));

-- 수정(이름 변경 등)은 관리자만.
drop policy if exists "조직 수정은 관리자만" on public.organizations;
create policy "조직 수정은 관리자만"
  on public.organizations for update
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- 생성/가입은 아래 RPC 함수(create_org / join_org)로만 한다.
-- 테이블에 직접 insert 하는 정책을 열어두면 '조직만 만들고 멤버 등록은 실패' 같은
-- 반쪽 상태가 생길 수 있어서, 두 작업을 함수 안에서 한 번에 처리한다.

-- --- org_members ---
-- 같은 조직 사람끼리는 서로가 누구인지 보인다. (겹쳐보기 화면에 이름을 띄워야 한다)
drop policy if exists "같은 조직원 조회" on public.org_members;
create policy "같은 조직원 조회"
  on public.org_members for select
  using (public.is_org_member(org_id));

-- 내보내기는 관리자, 나가기는 본인.
drop policy if exists "구성원 삭제" on public.org_members;
create policy "구성원 삭제"
  on public.org_members for delete
  using (public.is_org_admin(org_id) or user_id = auth.uid());

-- 역할 변경은 관리자만. 본인 이름(display_name) 변경은 본인도 가능.
drop policy if exists "구성원 수정" on public.org_members;
create policy "구성원 수정"
  on public.org_members for update
  using (public.is_org_admin(org_id) or user_id = auth.uid())
  with check (public.is_org_admin(org_id) or user_id = auth.uid());

-- --- org_shared_schedules ---
-- 조회: 같은 조직 사람이면 볼 수 있다. (이게 이 기능의 핵심 — 여기서만 벽이 열린다)
drop policy if exists "조직원 시간표 조회" on public.org_shared_schedules;
create policy "조직원 시간표 조회"
  on public.org_shared_schedules for select
  using (public.is_org_member(org_id));

-- 쓰기: 자기 것만. 남의 시간표를 대신 올리거나 고칠 수 없다.
drop policy if exists "내 시간표만 공유" on public.org_shared_schedules;
create policy "내 시간표만 공유"
  on public.org_shared_schedules for insert
  with check (user_id = auth.uid() and public.is_org_member(org_id));

drop policy if exists "내 공유 시간표만 수정" on public.org_shared_schedules;
create policy "내 공유 시간표만 수정"
  on public.org_shared_schedules for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 공유 취소(내리기)는 본인만.
drop policy if exists "내 공유 시간표만 삭제" on public.org_shared_schedules;
create policy "내 공유 시간표만 삭제"
  on public.org_shared_schedules for delete
  using (user_id = auth.uid());

-- --- org_plans ---
-- 조회: 조직원 전원. 배포된 시간표는 모두가 봐야 의미가 있다.
drop policy if exists "조직 시간표 조회" on public.org_plans;
create policy "조직 시간표 조회"
  on public.org_plans for select
  using (public.is_org_member(org_id));

-- 배포(쓰기)는 관리자만.
drop policy if exists "조직 시간표 배포는 관리자만" on public.org_plans;
create policy "조직 시간표 배포는 관리자만"
  on public.org_plans for insert
  with check (public.is_org_admin(org_id));

drop policy if exists "조직 시간표 수정은 관리자만" on public.org_plans;
create policy "조직 시간표 수정은 관리자만"
  on public.org_plans for update
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

-- ============================================================
-- RPC — 조직 만들기 / 초대 코드로 가입하기
-- ------------------------------------------------------------
-- 왜 함수인가: '조직 생성'과 '나를 관리자로 등록'은 반드시 함께 일어나야 한다.
--   따로 하면 중간에 실패했을 때 주인 없는 조직이 남는다.
--   '가입' 역시 초대 코드로 조직을 찾아야 하는데, 아직 멤버가 아니라서
--   RLS 상 그 조직이 안 보인다. → security definer 로 뚫고 들어간다.
-- ============================================================
create or replace function public.create_org(p_name text, p_display_name text default '')
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org public.organizations;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  insert into public.organizations (name, created_by)
  values (trim(p_name), auth.uid())
  returning * into new_org;

  -- 만든 사람이 곧 관리자다.
  insert into public.org_members (org_id, user_id, role, display_name)
  values (new_org.id, auth.uid(), 'admin', coalesce(nullif(trim(p_display_name), ''), '관리자'));

  return new_org;
end;
$$;

create or replace function public.join_org(p_invite_code text, p_display_name text default '')
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org public.organizations;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into target_org
  from public.organizations
  where invite_code = upper(trim(p_invite_code));

  if not found then
    raise exception '초대 코드가 올바르지 않습니다.';
  end if;

  -- 이미 가입돼 있으면 조용히 그 조직을 돌려준다. (두 번 눌러도 에러가 나지 않게)
  insert into public.org_members (org_id, user_id, role, display_name)
  values (target_org.id, auth.uid(), 'member', coalesce(nullif(trim(p_display_name), ''), '팀원'))
  on conflict (org_id, user_id) do nothing;

  return target_org;
end;
$$;

-- ============================================================
-- updated_at 자동 갱신
-- (set_updated_at 함수는 schema.sql 에서 이미 만들어 뒀다)
-- ============================================================
drop trigger if exists trg_org_shared_updated_at on public.org_shared_schedules;
create trigger trg_org_shared_updated_at
  before update on public.org_shared_schedules
  for each row execute function public.set_updated_at();

drop trigger if exists trg_org_plans_updated_at on public.org_plans;
create trigger trg_org_plans_updated_at
  before update on public.org_plans
  for each row execute function public.set_updated_at();

-- ============================================================
-- Realtime 발행
--   관리자가 시간표를 배포하면 팀원 화면이 즉시 바뀌어야 한다.
--   (개인용에서 위젯이 Realtime 으로 즉시 갱신되는 것과 같은 방식)
-- ============================================================
do $$
begin
  alter publication supabase_realtime add table public.org_plans;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.org_shared_schedules;
exception when duplicate_object then null;
end $$;
