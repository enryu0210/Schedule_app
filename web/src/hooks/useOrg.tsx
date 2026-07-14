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
  createOrg as createOrgApi,
  fetchMyOrgs,
  fetchOrgMembers,
  fetchOrgPlan,
  fetchSharedSchedules,
  joinOrg as joinOrgApi,
  publishOrgPlan,
  shareMySchedule,
  unshareMySchedule,
} from "../lib/orgStorage";
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
  mySharedSchedule: Preset | null;
  loading: boolean;
  error: string | null;
  createOrg: (name: string, displayName: string) => Promise<Organization>;
  joinOrg: (inviteCode: string, displayName: string) => Promise<Organization>;
  shareSchedule: (preset: Preset) => Promise<void>;
  unshareSchedule: () => Promise<void>;
  publishPlan: (schedule: Preset) => Promise<void>;
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
  // 읽기에 실패했을 때, 빈 화면 대신 "못 읽었다"고 알린다.
  // 조직 화면에서 이 구분은 특히 중요하다 — 공유한 시간표가 네트워크 문제로 안 보이면
  // 관리자가 "이 사람은 안 냈네" 하고 잘못된 일정을 짜게 된다.
  const [error, setError] = useState<string | null>(null);

  const currentOrgId = workspace.kind === "org" ? workspace.orgId : null;
  const currentOrg = orgs.find((o) => o.id === currentOrgId) ?? null;
  const myRole =
    members.find((m) => m.userId === user?.id)?.role ?? null;
  const isAdmin = myRole === "admin";
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

    setLoading(true);
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
    mySharedSchedule,
    loading,
    error,
    createOrg,
    joinOrg,
    shareSchedule,
    unshareSchedule,
    publishPlan,
    reloadCurrentOrg,
  };
}
