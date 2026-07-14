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

-- 가입 상태 (초대 링크 도입과 함께 추가).
--   pending: 링크로 신청했지만 관리자가 아직 승인하지 않음 → **아무것도 못 본다**
--   active : 승인됨 → 팀원 시간표를 보고, 자기 시간표를 공유할 수 있다
--
-- 왜 필요한가: 초대 링크는 그 링크를 아는 사람이면 누구나 들어올 수 있다.
--   카톡방에 뿌린 링크가 밖으로 새면 모르는 사람이 팀 시간표를 본다.
--   → '승인'을 통과해야 조직원으로 친다. 이 판정은 화면이 아니라 **RLS 가 한다**(is_org_member).
alter table public.org_members
  add column if not exists status text not null default 'active'
  check (status in ('pending', 'active'));
-- (기존 구성원은 이미 승인된 사람들이므로 default 'active' 가 맞다)

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
-- 승인된(active) 구성원만 '조직원'으로 친다.
-- 승인 대기(pending) 중인 사람은 이 함수가 false 를 돌려주므로,
-- 팀원 시간표도 조직 시간표도 **읽을 수 없다**. 화면에서 숨기는 게 아니라 DB 가 막는다.
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org and user_id = auth.uid() and status = 'active'
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
    where org_id = p_org and user_id = auth.uid()
      and role = 'admin' and status = 'active'
  );
$$;

-- 승인 대기 중인 내 신청. 조직 '이름' 정도는 보여줘야 사용자가 무엇을 기다리는지 안다.
create or replace function public.is_org_pending(p_org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org and user_id = auth.uid() and status = 'pending'
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
-- 조회: 내가 속한 조직 + 내가 승인 대기 중인 조직.
-- (대기 중이어도 조직 '이름'은 보여야 무엇을 기다리는지 안다. 시간표는 여전히 못 본다)
-- 초대 코드로 가입하는 경로는 아래 join_org 함수가 따로 처리한다.
drop policy if exists "내 조직 조회" on public.organizations;
create policy "내 조직 조회"
  on public.organizations for select
  using (public.is_org_member(id) or public.is_org_pending(id));

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
-- 내 행은 언제나 보인다 — 승인 대기 중인 사람이 자기 상태('나 아직 대기중')를 알아야 하기 때문이다.
drop policy if exists "같은 조직원 조회" on public.org_members;
create policy "같은 조직원 조회"
  on public.org_members for select
  using (public.is_org_member(org_id) or user_id = auth.uid());

-- 내보내기는 관리자, 나가기는 본인.
drop policy if exists "구성원 삭제" on public.org_members;
create policy "구성원 삭제"
  on public.org_members for delete
  using (public.is_org_admin(org_id) or user_id = auth.uid());

-- 구성원 행 수정(승인 / 역할 변경)은 **관리자만**.
--
-- 본인 수정을 열어두면 안 된다(실제로 뚫릴 뻔했다):
--   'user_id = auth.uid()' 를 허용하면 **승인 대기자가 자기 status 를 active 로 바꿔
--   스스로를 승인**할 수 있다. 그러면 승인 절차가 통째로 무의미해진다.
--   본인이 바꿀 수 있어야 하는 것은 이름뿐이므로, 그것만 아래 RPC(set_my_display_name)로 연다.
drop policy if exists "구성원 수정" on public.org_members;
create policy "구성원 수정"
  on public.org_members for update
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

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

  -- 만든 사람이 곧 관리자다. (자기 조직이므로 승인 대기 없이 바로 active)
  insert into public.org_members (org_id, user_id, role, display_name, status)
  values (new_org.id, auth.uid(), 'admin', coalesce(nullif(trim(p_display_name), ''), '관리자'), 'active');

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

  -- 초대 링크/코드로 들어온 사람은 곧바로 조직원이 되지 않는다. **관리자 승인 대기** 상태로 넣는다.
  -- 링크는 아는 사람이면 누구나 쓸 수 있어서(카톡방 링크가 밖으로 샐 수 있다),
  -- 승인을 거치지 않으면 모르는 사람이 팀 시간표를 보게 된다.
  --
  -- 이미 가입/신청돼 있으면 조용히 넘어간다(두 번 눌러도 에러가 나지 않게).
  -- 특히 do nothing 이 중요하다 — 이미 active 인 사람이 링크를 다시 눌렀을 때
  -- 상태가 pending 으로 되돌아가면 멀쩡한 조직원이 쫓겨난다.
  insert into public.org_members (org_id, user_id, role, display_name, status)
  values (target_org.id, auth.uid(), 'member',
          coalesce(nullif(trim(p_display_name), ''), '팀원'), 'pending')
  on conflict (org_id, user_id) do nothing;

  return target_org;
end;
$$;

-- 관리자가 가입 신청을 승인한다.
-- (거절은 그냥 행을 지우면 된다 — delete 정책이 관리자에게 열려 있다)
create or replace function public.approve_member(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_admin(p_org) then
    raise exception '관리자만 승인할 수 있습니다.';
  end if;

  update public.org_members
  set status = 'active'
  where org_id = p_org and user_id = p_user;
end;
$$;

-- 조직 안에서 쓸 내 이름 바꾸기.
-- 구성원 행의 직접 수정은 관리자에게만 열려 있으므로(셀프 승인 방지), 이름만 이 함수로 연다.
create or replace function public.set_my_display_name(p_org uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.org_members
  set display_name = coalesce(nullif(trim(p_display_name), ''), display_name)
  where org_id = p_org and user_id = auth.uid();
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
-- 개인 테이블에 붙는 유일한 것: "지금 무엇을 보고 있나"
-- ------------------------------------------------------------
-- 바탕화면 위젯은 웹앱과 **별개의 WebView** 라 localStorage 를 공유하지 못한다.
-- 그래서 '개인 계획표를 보는 중인지, 어느 조직을 보는 중인지'를 클라우드에 남겨,
-- 위젯이 웹에서 마지막으로 보던 것을 그대로 따라가게 한다.
-- (프리셋 선택 selected_preset_id 가 이미 똑같은 방식으로 동작한다)
--
-- 일정 '데이터'가 아니라 화면 상태일 뿐이므로 개인/조직 데이터 경계는 그대로다.
-- null = 개인 계획표.
--
-- 조직이 지워지면 자동으로 null(개인)로 떨어진다(on delete set null).
-- 안 그러면 위젯이 사라진 조직을 붙들고 빈 화면이 된다.
-- ============================================================
alter table public.user_data
  add column if not exists selected_org_id uuid
  references public.organizations (id) on delete set null;

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
