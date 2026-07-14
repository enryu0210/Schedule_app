/*
 * 조직 워크스페이스의 Supabase 접근 계층.
 *
 * 개인용(cloudStorage.ts)과 철저히 분리해 둔다.
 * 개인 프리셋은 user_data 에, 조직에 공유된 시간표는 org_shared_schedules 에 따로 산다.
 * 파일을 섞으면 언젠가 실수로 개인 데이터를 조직 쿼리에 흘리게 된다.
 *
 * 규칙: 이 파일의 함수들은 실패하면 **예외를 던진다.**
 *   조직 기능은 "못 읽었는데 빈 화면"이 특히 위험하다 —
 *   팀원이 시간표를 공유했는데 네트워크 문제로 안 보이면, 관리자가
 *   "이 사람은 안 냈네" 하고 잘못된 일정을 짜게 된다.
 *   그래서 오류를 삼키지 않고 부르는 쪽이 "실패했다"고 표시하게 한다.
 */
import type {
  OrgMember,
  Organization,
  Preset,
  SharedSchedule,
} from "../types";
import { supabase } from "./supabaseClient";

// Supabase 클라이언트가 없으면 조직 기능은 아예 성립하지 않는다(로컬 대안이 없다).
function requireClient() {
  if (!supabase) throw new Error("Supabase 클라이언트가 설정되지 않았습니다.");
  return supabase;
}

/** 내가 속한 조직 목록. (RLS 가 알아서 남의 조직은 걸러준다) */
export async function fetchMyOrgs(): Promise<Organization[]> {
  const client = requireClient();
  const { data, error } = await client
    .from("organizations")
    .select("id, name, invite_code")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    inviteCode: row.invite_code as string,
  }));
}

/** 조직 만들기. 만든 사람이 곧 관리자가 된다(DB 함수 안에서 한 번에 처리). */
export async function createOrg(
  name: string,
  displayName: string
): Promise<Organization> {
  const client = requireClient();
  const { data, error } = await client
    .rpc("create_org", { p_name: name, p_display_name: displayName })
    .single();

  if (error) throw error;
  const row = data as { id: string; name: string; invite_code: string };
  return { id: row.id, name: row.name, inviteCode: row.invite_code };
}

/** 초대 코드로 조직에 가입. 이미 가입돼 있으면 조용히 그 조직을 돌려준다. */
export async function joinOrg(
  inviteCode: string,
  displayName: string
): Promise<Organization> {
  const client = requireClient();
  const { data, error } = await client
    .rpc("join_org", {
      p_invite_code: inviteCode,
      p_display_name: displayName,
    })
    .single();

  if (error) throw error;
  const row = data as { id: string; name: string; invite_code: string };
  return { id: row.id, name: row.name, inviteCode: row.invite_code };
}

/** 조직 구성원 목록. 겹쳐보기 화면에서 "누구의 시간표인지" 이름을 붙이는 데 쓴다. */
export async function fetchOrgMembers(orgId: string): Promise<OrgMember[]> {
  const client = requireClient();
  const { data, error } = await client
    .from("org_members")
    .select("user_id, role, display_name")
    .eq("org_id", orgId);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: row.user_id as string,
    role: row.role as OrgMember["role"],
    displayName: row.display_name as string,
  }));
}

/** 조직원들이 공유한 시간표 전부. (공유하지 않은 사람은 아예 행이 없다) */
export async function fetchSharedSchedules(
  orgId: string
): Promise<SharedSchedule[]> {
  const client = requireClient();
  const { data, error } = await client
    .from("org_shared_schedules")
    .select("user_id, schedule")
    .eq("org_id", orgId);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: row.user_id as string,
    schedule: row.schedule as Preset,
  }));
}

/**
 * 내 프리셋 하나를 조직에 공유한다(사본 저장).
 * 한 사람이 한 조직에 하나만 공유한다 — 여러 개를 올리면 관리자가 무엇을 봐야 할지 모른다.
 */
export async function shareMySchedule(
  orgId: string,
  userId: string,
  schedule: Preset
): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("org_shared_schedules").upsert(
    { org_id: orgId, user_id: userId, schedule },
    { onConflict: "org_id,user_id" }
  );
  if (error) throw error;
}

/** 공유 취소(내리기). */
export async function unshareMySchedule(
  orgId: string,
  userId: string
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from("org_shared_schedules")
    .delete()
    .eq("org_id", orgId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** 관리자가 배포한 조직 공용 시간표. 아직 배포 전이면 null. */
export async function fetchOrgPlan(orgId: string): Promise<Preset | null> {
  const client = requireClient();
  const { data, error } = await client
    .from("org_plans")
    .select("schedule")
    .eq("org_id", orgId)
    .maybeSingle(); // 아직 배포 안 한 조직은 행이 없다 — 오류가 아니다.

  if (error) throw error;
  return data ? (data.schedule as Preset) : null;
}

/** 조직 공용 시간표 배포(관리자만 — 권한은 DB 의 RLS 가 최종 판정한다). */
export async function publishOrgPlan(
  orgId: string,
  userId: string,
  schedule: Preset
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from("org_plans")
    .upsert(
      { org_id: orgId, schedule, updated_by: userId },
      { onConflict: "org_id" }
    );
  if (error) throw error;
}
