/*
 * 조직 워크스페이스 상태 + Provider.
 *
 * 하는 일:
 *   - 내가 속한 조직 목록을 읽는다
 *   - 지금 보고 있는 작업 공간(개인 / 특정 조직)을 기억한다
 *   - 조직을 고르면 그 조직의 구성원 / 공유된 시간표 / 배포된 시간표를 읽는다
 *
 * 왜 Context 인가:
 *   워크스페이스 전환 버튼(상단바)과 조직 화면은 서로 다른 컴포넌트다.
 *   훅을 그냥 각자 부르면 상태가 각자 따로 생겨서, 상단바에서 조직을 골라도
 *   화면이 안 바뀐다. 하나의 상태를 공유해야 한다.
 *
 * 개인 프리셋(usePresetStore)과는 끝까지 분리해 둔다.
 * 한곳에 몰아넣으면 개인 데이터와 조직 데이터가 같은 상태 안에서 섞이고,
 * 그러면 언젠가 실수로 개인 일정을 조직 화면에 그리게 된다.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  OrgMember,
  OrgRole,
  Organization,
  Preset,
  SharedSchedule,
  Workspace,
} from "../types";
import {
  approveMember as approveMemberApi,
  createOrg as createOrgApi,
  fetchMyOrgs,
  fetchOrgMembers,
  fetchOrgPlan,
  fetchSharedSchedules,
  joinOrg as joinOrgApi,
  publishOrgPlan,
  removeMember as removeMemberApi,
  shareMySchedule,
  unshareMySchedule,
} from "../lib/orgStorage";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./useAuth";

// 마지막으로 보던 작업 공간을 기억한다. 새로고침할 때마다 개인으로 튕기면 성가시다.
const WORKSPACE_KEY = "ilgongbang.workspace";

function loadSavedWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return { kind: "personal" };
    const parsed = JSON.parse(raw) as Workspace;
    // 저장된 값이 깨져 있어도 앱이 죽으면 안 된다 — 개인 공간으로 되돌린다.
    if (parsed?.kind === "org" && typeof parsed.orgId === "string") return parsed;
    return { kind: "personal" };
  } catch {
    return { kind: "personal" };
  }
}

interface OrgContextValue {
  orgs: Organization[];
  workspace: Workspace;
  setWorkspace: (next: Workspace) => void;
  currentOrg: Organization | null;
  members: OrgMember[];
  sharedSchedules: SharedSchedule[];
  orgPlan: Preset | null;
  myRole: OrgRole | null;
  isAdmin: boolean;
  // 초대 링크로 신청했지만 관리자 승인 전인 상태. 이때는 조직의 어떤 시간표도 보이지 않는다.
  isPending: boolean;
  pendingMembers: OrgMember[];
  mySharedSchedule: Preset | null;
  loading: boolean;
  error: string | null;
  createOrg: (name: string, displayName: string) => Promise<Organization>;
  joinOrg: (inviteCode: string, displayName: string) => Promise<Organization>;
  shareSchedule: (preset: Preset) => Promise<void>;
  unshareSchedule: () => Promise<void>;
  publishPlan: (schedule: Preset) => Promise<void>;
  approve: (userId: string) => Promise<void>;
  remove: (userId: string) => Promise<void>;
  reloadCurrentOrg: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const value = useOrgState();
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

/** 앱 어디서나 조직 상태를 꺼내 쓰는 훅. */
export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error("useOrg 는 <OrgProvider> 안에서만 사용할 수 있습니다.");
  }
  return ctx;
}

// 실제 상태 로직. Provider 안에서 딱 한 번만 돈다.
function useOrgState(): OrgContextValue {
  const { user } = useAuth();

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [workspace, setWorkspaceState] = useState<Workspace>(loadSavedWorkspace);

  // 현재 조직의 내용물
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [sharedSchedules, setSharedSchedules] = useState<SharedSchedule[]>([]);
  const [orgPlan, setOrgPlan] = useState<Preset | null>(null);

  const [loading, setLoading] = useState(false);
  // 어느 조직까지 성공적으로 읽어봤는지. 로딩 표시를 '처음 열 때'로만 제한하는 데 쓴다.
  const loadedOrgId = useRef<string | null>(null);
  // 읽기에 실패했을 때, 빈 화면 대신 "못 읽었다"고 알린다.
  // 조직 화면에서 이 구분은 특히 중요하다 — 공유한 시간표가 네트워크 문제로 안 보이면
  // 관리자가 "이 사람은 안 냈네" 하고 잘못된 일정을 짜게 된다.
  const [error, setError] = useState<string | null>(null);

  const currentOrgId = workspace.kind === "org" ? workspace.orgId : null;
  const currentOrg = orgs.find((o) => o.id === currentOrgId) ?? null;
  const me = members.find((m) => m.userId === user?.id) ?? null;
  const myRole = me?.role ?? null;
  // 승인 대기 중이면 관리자여도 아무 권한이 없다(애초에 RLS 가 데이터를 안 준다).
  const isPending = me?.status === "pending";
  const isAdmin = myRole === "admin" && !isPending;
  // 관리자가 처리해야 할 가입 신청들.
  const pendingMembers = members.filter((m) => m.status === "pending");
  const mySharedSchedule =
    sharedSchedules.find((s) => s.userId === user?.id)?.schedule ?? null;

  const setWorkspace = useCallback((next: Workspace) => {
    setWorkspaceState(next);
    try {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next));
    } catch {
      // localStorage 를 못 써도(사생활 보호 모드 등) 앱은 계속 동작해야 한다.
    }
  }, []);

  // 내가 속한 조직 목록 읽기
  const reloadOrgs = useCallback(async () => {
    if (!user) return;
    try {
      setOrgs(await fetchMyOrgs());
    } catch (e) {
      console.error("[Org] 조직 목록 불러오기 실패", e);
      setError("조직 목록을 불러오지 못했습니다.");
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setOrgs([]);
      setWorkspaceState({ kind: "personal" });
      return;
    }
    void reloadOrgs();
  }, [user?.id, reloadOrgs]);

  // 선택한 조직의 내용을 읽는다.
  const reloadCurrentOrg = useCallback(async () => {
    if (!currentOrgId) {
      setMembers([]);
      setSharedSchedules([]);
      setOrgPlan(null);
      return;
    }

    // 로딩 표시는 이 조직을 **처음 열 때만** 띄운다.
    // 자동 저장이나 Realtime 알림으로 다시 읽을 때도 로딩을 띄우면 화면이 통째로 갈아엎어져,
    // 편집 중이던 조직 시간표 편집기가 사라졌다 다시 뜨면서 입력이 날아간다.
    const firstLoad = loadedOrgId.current !== currentOrgId;
    if (firstLoad) setLoading(true);
    setError(null);
    try {
      // 셋 다 필요하므로 한꺼번에 받는다. 하나라도 실패하면 실패로 본다
      // (반쪽 데이터로 그린 시간표가 제일 위험하다).
      const [nextMembers, nextShared, nextPlan] = await Promise.all([
        fetchOrgMembers(currentOrgId),
        fetchSharedSchedules(currentOrgId),
        fetchOrgPlan(currentOrgId),
      ]);
      setMembers(nextMembers);
      setSharedSchedules(nextShared);
      setOrgPlan(nextPlan);
      // 성공했을 때만 "이 조직은 이미 읽었다"고 표시한다.
      // 실패했는데 표시해버리면, 다음 재시도 때 로딩 표시 없이 조용히 실패한다.
      loadedOrgId.current = currentOrgId;
    } catch (e) {
      console.error("[Org] 조직 데이터 불러오기 실패", e);
      setError("조직 데이터를 불러오지 못했습니다. 새로고침해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [currentOrgId]);

  useEffect(() => {
    void reloadCurrentOrg();
  }, [reloadCurrentOrg]);

  /*
   * Realtime 구독 — 남이 바꾼 것을 새로고침 없이 본다.
   *
   * 이게 없으면:
   *   관리자가 조직 시간표를 배포해도 팀원은 새로고침해야 보고,
   *   팀원이 시간표를 공유해도 관리자 화면은 그대로다.
   *   관리자는 "다들 냈나?" 하면서 F5 를 누르고 있게 된다.
   *
   * 알림에 담긴 값을 그대로 쓰지 않고 **다시 읽는다**(reloadCurrentOrg).
   *   알림 순서가 뒤바뀌거나 중간 것을 놓쳐도 항상 최신 상태로 수렴하기 때문이다.
   *   (위젯에서 이미 검증된 방식 — useWidgetPresets)
   *
   * 폴링 안전망은 두지 않는다. 위젯과 달리 사람이 보고 있는 화면이라,
   * 구독이 끊기면 새로고침하면 된다.
   * 관리자가 편집 중일 때 자기 저장이 되돌아와 덮어쓰는 문제는
   * OrgPlanEditor 의 dirty 플래그가 막는다.
   */
  useEffect(() => {
    if (!supabase || !currentOrgId) return;

    const channel = supabase
      .channel(`org:${currentOrgId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // 공유는 INSERT, 갱신은 UPDATE, 내리기는 DELETE — 전부 받는다.
          schema: "public",
          table: "org_shared_schedules",
          filter: `org_id=eq.${currentOrgId}`,
        },
        () => void reloadCurrentOrg()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "org_plans",
          filter: `org_id=eq.${currentOrgId}`,
        },
        () => void reloadCurrentOrg()
      )
      .subscribe((status) => {
        // 구독이 실패해도 화면은 동작한다. 남의 변경이 늦게 보일 뿐이다.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            `[Org] Realtime 구독 실패(${status}) — 새로고침해야 최신 상태가 보입니다. ` +
              "Supabase 에서 org_plans / org_shared_schedules 의 Realtime 발행을 확인하세요."
          );
        }
      });

    // 조직을 바꾸거나 화면을 떠나면 반드시 구독을 끊는다(안 그러면 채널이 계속 쌓인다).
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [currentOrgId, reloadCurrentOrg]);

  /* --- 동작(액션)들 --- */

  const createOrg = useCallback(
    async (name: string, displayName: string) => {
      const org = await createOrgApi(name, displayName);
      await reloadOrgs();
      setWorkspace({ kind: "org", orgId: org.id });
      return org;
    },
    [reloadOrgs, setWorkspace]
  );

  const joinOrg = useCallback(
    async (inviteCode: string, displayName: string) => {
      const org = await joinOrgApi(inviteCode, displayName);
      await reloadOrgs();
      setWorkspace({ kind: "org", orgId: org.id });
      return org;
    },
    [reloadOrgs, setWorkspace]
  );

  // 내 개인 프리셋 하나를 조직에 공유한다(사본).
  const shareSchedule = useCallback(
    async (preset: Preset) => {
      if (!user || !currentOrgId) return;
      await shareMySchedule(currentOrgId, user.id, preset);
      await reloadCurrentOrg();
    },
    [user?.id, currentOrgId, reloadCurrentOrg]
  );

  const unshareSchedule = useCallback(async () => {
    if (!user || !currentOrgId) return;
    await unshareMySchedule(currentOrgId, user.id);
    await reloadCurrentOrg();
  }, [user?.id, currentOrgId, reloadCurrentOrg]);

  // 관리자가 가입 신청을 승인한다.
  const approve = useCallback(
    async (userId: string) => {
      if (!currentOrgId) return;
      await approveMemberApi(currentOrgId, userId);
      await reloadCurrentOrg();
    },
    [currentOrgId, reloadCurrentOrg]
  );

  // 관리자가 가입 신청을 거절하거나 구성원을 내보낸다.
  const remove = useCallback(
    async (userId: string) => {
      if (!currentOrgId) return;
      await removeMemberApi(currentOrgId, userId);
      await reloadCurrentOrg();
    },
    [currentOrgId, reloadCurrentOrg]
  );

  // 관리자가 조직 공용 시간표를 배포한다.
  const publishPlan = useCallback(
    async (schedule: Preset) => {
      if (!user || !currentOrgId) return;
      await publishOrgPlan(currentOrgId, user.id, schedule);
      await reloadCurrentOrg();
    },
    [user?.id, currentOrgId, reloadCurrentOrg]
  );

  return {
    orgs,
    workspace,
    setWorkspace,
    currentOrg,
    members,
    sharedSchedules,
    orgPlan,
    myRole,
    isAdmin,
    isPending,
    pendingMembers,
    mySharedSchedule,
    loading,
    error,
    createOrg,
    joinOrg,
    shareSchedule,
    unshareSchedule,
    publishPlan,
    approve,
    remove,
    reloadCurrentOrg,
  };
}
