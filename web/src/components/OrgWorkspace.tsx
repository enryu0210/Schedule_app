/*
 * 조직 워크스페이스 화면.
 *
 * 이 화면이 푸는 문제 (실제 조직에서 겪은 것):
 *   1. 일정을 몰라서 약속·회의를 잡을 때마다 매번 물어봐야 한다
 *   2. 관리자가 누가 언제 일하는지 몰라서 쓸모없는 미팅이 잡힌다
 *
 * 그래서 흐름을 고리로 만든다:
 *   팀원이 자기 시간표를 공유 → 관리자가 겹쳐 보고 빈 시간을 찾음
 *   → 관리자가 조직 시간표를 배포 → 팀원이 그것을 본다
 *
 * 프라이버시: 여기 보이는 것은 팀원이 **직접 "공유"를 누른 시간표**뿐이다.
 *   개인 계획표(개인 워크스페이스)는 조직에서 절대 보이지 않는다.
 */
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useNow } from "../hooks/useNow";
import { useOrg } from "../hooks/useOrg";
import { usePresetStore } from "../hooks/usePresetStore";
import { jsDayToMondayIndex } from "../lib/time";
import { AuthBar } from "./AuthBar";
import { OrgPlanEditor } from "./OrgPlanEditor";
import { TeamOverlapGrid } from "./TeamOverlapGrid";
import { WeekGrid } from "./WeekGrid";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

type Tab = "overlap" | "plan";

interface Props {
  onAddOrg: () => void;
}

export function OrgWorkspace({ onAddOrg }: Props) {
  const { user } = useAuth();
  const {
    orgs,
    setWorkspace,
    currentOrg,
    members,
    sharedSchedules,
    orgPlan,
    isAdmin,
    mySharedSchedule,
    loading,
    error,
    shareSchedule,
    unshareSchedule,
    publishPlan,
  } = useOrg();

  // 공유/배포할 후보는 "내 개인 프리셋"이다. 읽기 용도로만 쓴다(여기서 개인 프리셋을 고치지 않는다).
  const { presets, loaded: presetsLoaded } = usePresetStore();

  const now = useNow();
  const todayIdx = jsDayToMondayIndex(now.getDay());

  const [tab, setTab] = useState<Tab>("overlap");
  const [pickedPresetId, setPickedPresetId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // 고른 조직이 목록에 없다 = 탈퇴했거나 조직이 지워졌는데 선택값만 남은 경우.
  // 빈 화면을 보여주면 사용자는 앱이 고장 난 줄 안다. 개인 공간으로 돌아갈 길을 준다.
  if (!currentOrg) {
    // 아직 조직 목록을 읽는 중일 수도 있으므로, 목록이 비어 있을 때만 단정한다.
    const stillLoading = orgs.length > 0;
    return (
      <div className="wrap">
        <div className="auth-row">
          <WorkspaceSwitcher onAddOrg={onAddOrg} />
          <AuthBar />
        </div>
        {stillLoading ? (
          <div className="loading-hint">불러오는 중…</div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-emoji">👥</div>
            <h2>조직을 찾을 수 없어요</h2>
            <p>탈퇴했거나 조직이 삭제되었을 수 있습니다.</p>
            <button
              className="btn primary"
              onClick={() => setWorkspace({ kind: "personal" })}
            >
              개인 계획표로 돌아가기
            </button>
          </div>
        )}
      </div>
    );
  }

  const pickedPreset =
    presets.find((p) => p.id === pickedPresetId) ?? presets[0] ?? null;

  // 서버 왕복 중 버튼 연타로 같은 작업이 두 번 나가는 것을 막는다.
  async function run(action: () => Promise<void>, failMessage: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      console.error(failMessage, e);
      alert(failMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="auth-row">
        <WorkspaceSwitcher onAddOrg={onAddOrg} />
        <AuthBar />
      </div>

      <div className="top">
        <h1>
          {currentOrg.name}
          <span className={"role-badge" + (isAdmin ? " admin" : "")}>
            {isAdmin ? "관리자" : "팀원"}
          </span>
        </h1>
        {isAdmin && (
          <div className="invite-code">
            초대 코드 <code>{currentOrg.inviteCode}</code>
            <button
              className="btn tiny"
              onClick={() => navigator.clipboard?.writeText(currentOrg.inviteCode)}
            >
              복사
            </button>
          </div>
        )}
      </div>

      {/* 읽기 실패를 조용히 넘기지 않는다.
          공유된 시간표가 안 보이는 게 "안 냈다"인지 "못 읽었다"인지 구분되지 않으면
          관리자가 잘못된 일정을 짠다. */}
      {error && <div className="org-error">{error}</div>}

      {/* --- 내 시간표 공유 --- */}
      <section className="org-share">
        <h2>내 시간표 공유</h2>
        {!presetsLoaded ? (
          <div className="loading-hint">내 프리셋 불러오는 중…</div>
        ) : presets.length === 0 ? (
          <p className="org-hint">
            공유할 프리셋이 없습니다. 개인 계획표에서 먼저 시간표를 만들어주세요.
          </p>
        ) : (
          <>
            <p className="org-hint">
              고른 프리셋의 <b>사본</b>이 조직에 공유됩니다. 개인 계획표는 공개되지 않습니다.
              알리고 싶지 않은 일정은 블록 이름을 <b>“개인일정”</b> 처럼 적으면 됩니다.
            </p>
            <div className="org-share-row">
              <select
                className="workspace-select"
                value={pickedPreset?.id ?? ""}
                onChange={(e) => setPickedPresetId(e.target.value)}
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>

              <button
                className="btn primary"
                disabled={busy || !pickedPreset}
                onClick={() =>
                  pickedPreset &&
                  run(
                    () => shareSchedule(pickedPreset),
                    "시간표 공유에 실패했습니다. 잠시 후 다시 시도해주세요."
                  )
                }
              >
                {mySharedSchedule ? "공유 갱신" : "조직에 공유"}
              </button>

              {mySharedSchedule && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    run(unshareSchedule, "공유 취소에 실패했습니다.")
                  }
                >
                  공유 내리기
                </button>
              )}
            </div>
            {mySharedSchedule && (
              <div className="org-shared-now">
                현재 <b>{mySharedSchedule.label}</b> 을(를) 공유 중입니다.
                개인 계획표를 고쳤다면 <b>공유 갱신</b>을 눌러야 반영됩니다.
              </div>
            )}
          </>
        )}
      </section>

      {/* --- 탭 --- */}
      <div className="org-tabs">
        <button
          className={"org-tab" + (tab === "overlap" ? " active" : "")}
          onClick={() => setTab("overlap")}
        >
          팀 빈 시간 찾기
        </button>
        <button
          className={"org-tab" + (tab === "plan" ? " active" : "")}
          onClick={() => setTab("plan")}
        >
          조직 시간표
        </button>
      </div>

      {loading ? (
        <div className="loading-hint">불러오는 중…</div>
      ) : tab === "overlap" ? (
        <TeamOverlapGrid
          members={members}
          sharedSchedules={sharedSchedules}
          todayIdx={todayIdx}
        />
      ) : isAdmin ? (
        // 관리자는 조직 시간표를 여기서 직접 짠다.
        // 개인 프리셋을 만들어 배포하는 방식은 순서가 억지스러웠다 —
        // 조직 시간표를 짜려고 내 개인 계획표를 먼저 어지럽혀야 했다.
        <OrgPlanEditor
          plan={orgPlan}
          todayIdx={todayIdx}
          nowMin={now.getHours() * 60 + now.getMinutes()}
          onSave={publishPlan}
        />
      ) : orgPlan ? (
        // 팀원에게는 읽기 전용. 클릭·드래그를 CSS 로 막는다.
        <div className="readonly-grid">
          <WeekGrid
            days={orgPlan.days}
            todayIdx={todayIdx}
            nowMin={now.getHours() * 60 + now.getMinutes()}
            onEditBlock={() => {}}
            onAddBlockAt={() => {}}
            onMoveBlock={() => {}}
          />
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-emoji">📋</div>
          <h2>아직 조직 시간표가 없어요</h2>
          <p>관리자가 조직 시간표를 만들면 여기에 표시됩니다.</p>
        </div>
      )}

      <div className="org-members">
        <h2>구성원 {members.length}명</h2>
        <ul>
          {members.map((m) => {
            const shared = sharedSchedules.some((s) => s.userId === m.userId);
            return (
              <li key={m.userId}>
                <span>{m.displayName || "이름 없음"}</span>
                {m.role === "admin" && <span className="role-badge admin">관리자</span>}
                {m.userId === user?.id && <span className="role-badge">나</span>}
                <span className={"share-state" + (shared ? " on" : "")}>
                  {shared ? "공유함" : "미공유"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
