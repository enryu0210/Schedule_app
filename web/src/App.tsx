/*
 * 앱의 최상위 라우터.
 * - 인증 상태에 따라 화면을 나눈다:
 *     세션 확인 중 → 로딩 / 비로그인 → 로그인 화면 / 로그인 → 작업 공간
 * - "로그인 후 사용" 정책에 맞춰, 로그인 전에는 어떤 스케줄도 보여주지 않는다.
 * - 로그인 후에는 작업 공간이 둘로 갈린다:
 *     개인 계획표(Planner) / 조직 워크스페이스(OrgWorkspace)
 *   이 갈림이 곧 프라이버시 경계선이다 — 개인 프리셋은 조직에 절대 보이지 않는다.
 */
import { useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { NoticeProvider } from "./hooks/useScheduleNotice";
import { OrgProvider, useOrg } from "./hooks/useOrg";
import { PresetProvider } from "./hooks/usePresetStore";
import { LoginScreen } from "./components/LoginScreen";
import { MonthView } from "./components/MonthView";
import { OrgDialog } from "./components/OrgDialog";
import { OrgWorkspace } from "./components/OrgWorkspace";
import { Planner } from "./components/Planner";
import { WidgetView } from "./components/WidgetView";
import { sampleCalendarSchedule } from "./data/sampleCalendar";
import { readGoogleConnectResult } from "./lib/googleCalendar";
import { clearInviteCodeFromUrl, readInviteCodeFromUrl } from "./lib/inviteLink";
import { isWidgetMode } from "./lib/widgetMode";

export default function App() {
  const { user, loading } = useAuth();

  // 개발 전용 미리보기: `npm run dev` 에서 ?preview=month 로 달 뷰를 목 데이터로 확인한다.
  // (로그인 게이트 때문에 실제 화면은 인증 없이 못 보므로, 새 화면은 이렇게 눈으로 검증한다)
  // import.meta.env.DEV 로 감싸 프로덕션 번들에는 들어가지 않게 한다.
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("preview") === "month"
  ) {
    return (
      <div className="wrap">
        <MonthView
          schedule={sampleCalendarSchedule()}
          connected
          onConnectGoogle={() => {}}
          onSyncNow={() => {}}
        />
      </div>
    );
  }

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
  //    셋 다 Provider 인 이유:
  //    - OrgProvider    : 상단바(전환 버튼)와 조직 화면이 같은 상태를 봐야 한다
  //    - PresetProvider : 개인 프리셋 저장소는 앱 전체에 **하나**여야 한다(자동 저장이 두 벌이 되면 서로 덮어쓴다)
  //    - NoticeProvider : 상시 알림 동기화는 **화면과 무관하게** 항상 돌아야 한다.
  //                       (개인/조직 어느 화면이든, 로딩·빈 상태이든 "지금 보고 있는 시간표"를 따라가야 하므로)
  //    순서 주의: NoticeProvider 는 두 저장소를 모두 읽으므로 가장 안쪽이어야 한다.
  return (
    <OrgProvider>
      <PresetProvider>
        <NoticeProvider>
          <Workspace />
        </NoticeProvider>
      </PresetProvider>
    </OrgProvider>
  );
}

// 지금 고른 작업 공간에 맞는 화면을 보여준다.
function Workspace() {
  const { workspace } = useOrg();
  // 조직 만들기/참여 모달은 두 화면 어디서나 열 수 있어야 해서 여기서 관리한다.
  const [showOrgDialog, setShowOrgDialog] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  // 초대 링크(?join=CODE)로 들어왔다면 참여 모달을 코드가 채워진 채로 연다.
  //
  // 코드만 보고 바로 가입시키지 않는 이유: 조직에서 쓸 이름을 받아야 한다.
  // 이름 없이 넣으면 겹쳐보기 화면에서 관리자가 누가 누군지 알 수 없다.
  //
  // 처리한 뒤 주소에서 코드를 지운다. 남겨두면 새로고침할 때마다 모달이 다시 뜬다.
  useEffect(() => {
    const code = readInviteCodeFromUrl();
    if (!code) return;
    setInviteCode(code);
    setShowOrgDialog(true);
    clearInviteCodeFromUrl();
  }, []);

  // 구글 캘린더 연결 후 돌아왔다면(?google=connected|error) 결과를 알려주고 주소를 청소한다.
  // (연결은 구글·서버를 거쳐 여기로 돌아온다 — lib/googleCalendar.ts)
  useEffect(() => {
    const res = readGoogleConnectResult();
    if (!res) return;
    if (res.result === "connected") {
      alert("구글 캘린더가 연결되었습니다.\n잠시 후 일정이 자동으로 동기화됩니다.");
    } else {
      alert(
        "구글 캘린더 연결에 실패했습니다." +
          (res.reason ? `\n(사유: ${res.reason})` : "")
      );
    }
  }, []);

  function closeOrgDialog() {
    setShowOrgDialog(false);
    setInviteCode(null);
  }

  return (
    <>
      {workspace.kind === "org" ? (
        <OrgWorkspace onAddOrg={() => setShowOrgDialog(true)} />
      ) : (
        <Planner onAddOrg={() => setShowOrgDialog(true)} />
      )}

      {showOrgDialog && (
        <OrgDialog
          onClose={closeOrgDialog}
          initialInviteCode={inviteCode ?? undefined}
        />
      )}
    </>
  );
}
