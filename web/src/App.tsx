/*
 * 앱의 최상위 라우터.
 * - 인증 상태에 따라 화면을 나눈다:
 *     세션 확인 중 → 로딩 / 비로그인 → 로그인 화면 / 로그인 → 작업 공간
 * - "로그인 후 사용" 정책에 맞춰, 로그인 전에는 어떤 스케줄도 보여주지 않는다.
 * - 로그인 후에는 작업 공간이 둘로 갈린다:
 *     개인 계획표(Planner) / 조직 워크스페이스(OrgWorkspace)
 *   이 갈림이 곧 프라이버시 경계선이다 — 개인 프리셋은 조직에 절대 보이지 않는다.
 */
import { useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { OrgProvider, useOrg } from "./hooks/useOrg";
import { LoginScreen } from "./components/LoginScreen";
import { OrgDialog } from "./components/OrgDialog";
import { OrgWorkspace } from "./components/OrgWorkspace";
import { Planner } from "./components/Planner";
import { WidgetView } from "./components/WidgetView";
import { isWidgetMode } from "./lib/widgetMode";

export default function App() {
  const { user, loading } = useAuth();

  // 위젯 모드는 로딩/로그인 화면까지 자체적으로 처리하므로 가장 먼저 분기한다.
  // (위젯은 개인 일정만 보여준다 — 조직 기능은 위젯에 넣지 않는다)
  if (isWidgetMode()) return <WidgetView />;

  // 1) 앱 시작 시 기존 세션을 확인하는 동안 잠깐 로딩 표시.
  if (loading) {
    return (
      <div className="wrap">
        <div className="loading-hint">불러오는 중…</div>
      </div>
    );
  }

  // 2) 로그인하지 않았으면 로그인 화면.
  if (!user) return <LoginScreen />;

  // 3) 로그인 완료 → 작업 공간(개인/조직).
  //    조직 상태는 상단바(전환 버튼)와 조직 화면이 함께 써야 하므로 Provider 로 감싼다.
  return (
    <OrgProvider>
      <Workspace />
    </OrgProvider>
  );
}

// 지금 고른 작업 공간에 맞는 화면을 보여준다.
function Workspace() {
  const { workspace } = useOrg();
  // 조직 만들기/참여 모달은 두 화면 어디서나 열 수 있어야 해서 여기서 관리한다.
  const [showOrgDialog, setShowOrgDialog] = useState(false);

  return (
    <>
      {workspace.kind === "org" ? (
        <OrgWorkspace onAddOrg={() => setShowOrgDialog(true)} />
      ) : (
        <Planner onAddOrg={() => setShowOrgDialog(true)} />
      )}

      {showOrgDialog && <OrgDialog onClose={() => setShowOrgDialog(false)} />}
    </>
  );
}
