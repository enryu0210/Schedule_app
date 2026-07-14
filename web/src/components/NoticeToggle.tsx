/*
 * 상시 알림 켜기/끄기 스위치. (안드로이드 앱에서만 보인다)
 *
 * 켜두면 알림창에 "지금 하는 일정"이 항상 자리를 지킨다 — 앱을 꺼도, 폰을 재부팅해도.
 * 웹·데스크탑 위젯에서는 아무것도 그리지 않는다(그쪽엔 알림 개념이 없다).
 */
import { useState } from "react";
import type { Preset } from "../types";
import { useScheduleNotice } from "../hooks/useScheduleNotice";

interface Props {
  preset: Preset | null;
}

export function NoticeToggle({ preset }: Props) {
  const { supported, enabled, toggle } = useScheduleNotice(preset);
  // 권한을 거부당해 못 켠 경우를 사용자에게 알려주기 위한 안내.
  const [denied, setDenied] = useState(false);

  if (!supported) return null;

  async function handleToggle() {
    const next = await toggle();
    // 켜려고 눌렀는데 꺼진 채로 남았다 = 알림 권한을 거부당했다는 뜻.
    setDenied(!enabled && !next);
  }

  return (
    <div className="notice-toggle">
      <button
        className={"notice-switch" + (enabled ? " on" : "")}
        onClick={handleToggle}
        aria-pressed={enabled}
      >
        <span className="notice-switch-label">
          🔔 지금 일정 알림
          <small>{enabled ? "알림창에 항상 표시 중" : "꺼짐"}</small>
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
