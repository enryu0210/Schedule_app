/*
 * 상시 알림 켜기/끄기 스위치. (안드로이드 앱에서만 보인다)
 *
 * 켜두면 알림창에 "지금 하는 일정"이 항상 자리를 지킨다 — 앱을 꺼도, 폰을 재부팅해도.
 * 웹·데스크탑 위젯에서는 아무것도 그리지 않는다(그쪽엔 알림 개념이 없다).
 *
 * 이 컴포넌트는 **그리기만** 한다. 시간표를 네이티브로 넘기는 일은 NoticeProvider 가
 * 화면과 무관하게 항상 하고 있다 — 예전처럼 이 스위치가 안 보이는 화면(조직 등)에서
 * 동기화가 멈추는 일을 없애기 위해서다.
 */
import { useState } from "react";
import { useActiveSchedule } from "../hooks/useActiveSchedule";
import { useOrg } from "../hooks/useOrg";
import { useScheduleNotice } from "../hooks/useScheduleNotice";

export function NoticeToggle() {
  const { supported, enabled, toggle } = useScheduleNotice();
  const { schedule, sourceLabel } = useActiveSchedule();
  const { workspace } = useOrg();
  // 권한을 거부당해 못 켠 경우를 사용자에게 알려주기 위한 안내.
  const [denied, setDenied] = useState(false);

  if (!supported) return null;

  async function handleToggle() {
    const next = await toggle();
    // 켜려고 눌렀는데 꺼진 채로 남았다 = 알림 권한을 거부당했다는 뜻.
    setDenied(!enabled && !next);
  }

  // 무엇을 기준으로 알림이 뜨는지 그대로 보여준다.
  // 개인/조직 전환이 알림에 반영되지 않던 버그를 사용자가 바로 알아챌 수 있어야 한다.
  const source = schedule
    ? `${sourceLabel} 기준`
    : workspace.kind === "org"
      ? "조직 시간표가 아직 없어요"
      : "표시할 시간표가 없어요";

  return (
    <div className="notice-toggle">
      <button
        className={"notice-switch" + (enabled ? " on" : "")}
        onClick={handleToggle}
        aria-pressed={enabled}
      >
        <span className="notice-switch-label">
          🔔 지금 일정 알림
          <small>{enabled ? source : "꺼짐"}</small>
        </span>
        <span className="notice-switch-track" aria-hidden="true">
          <span className="notice-switch-knob" />
        </span>
      </button>

      {denied && (
        <p className="notice-denied">
          알림 권한이 꺼져 있어요. 설정 → 앱 → 일정공방 → 알림에서 켜주세요.
        </p>
      )}
    </div>
  );
}
