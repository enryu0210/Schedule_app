/*
 * 상시 알림 상태를 관리하고, 시간표가 바뀔 때마다 네이티브에 다시 넘긴다.
 *
 * 넘기는 시점이 중요하다: 사용자가 블록을 고치거나 프리셋을 바꾸면 알림에 뜨는 "지금 일정"도
 * 따라 바뀌어야 한다. 안 그러면 알림만 옛 시간표를 붙들고 있게 된다.
 *
 * 설치 후 처음이라면 알림을 **기본으로 켠다**(권한도 이때 물어본다).
 * 이 앱을 깐 이유가 곧 "지금 뭘 할 시간인지 보는 것"이라, 기본이 꺼짐이면
 * 사이드바 깊숙한 스위치를 찾아낸 사람만 이 기능을 쓰게 된다.
 */
import { useEffect, useState } from "react";
import type { Preset } from "../types";
import {
  initNoticeDefault,
  isNoticeSupported,
  setNoticeEnabled,
  syncNotice,
} from "../lib/scheduleNotice";

export function useScheduleNotice(preset: Preset | null) {
  const supported = isNoticeSupported();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!supported || !preset) return;

    let cancelled = false;

    (async () => {
      // 반드시 시간표를 먼저 넘기고 나서 켠다.
      // 순서가 뒤바뀌면 알림이 "지금은 비어 있어요" 로 먼저 떠서 첫인상을 망친다.
      await syncNotice(preset);

      // 처음이면 켜주고, 두 번째부터는 현재 상태만 돌려받는다.
      // (사용자가 끈 알림을 앱 열 때마다 되살리면 그건 고장이다)
      const on = await initNoticeDefault();
      if (!cancelled) setEnabled(on);
    })();

    return () => { cancelled = true; };
  }, [supported, preset]);

  async function toggle() {
    // 네이티브가 "실제로 켜졌는지"를 돌려준다. 권한을 거부하면 false 가 오므로
    // 스위치가 켜진 것처럼 보이는데 알림은 안 뜨는 상태를 피할 수 있다.
    const next = await setNoticeEnabled(!enabled);
    setEnabled(next);
    return next;
  }

  return { supported, enabled, toggle };
}
