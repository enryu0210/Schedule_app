/*
 * 상시 알림(안드로이드) 상태 관리 + Provider.
 *
 * 왜 Provider 인가 (이게 이번 버그의 핵심):
 *   예전에는 이 훅이 NoticeToggle(=PresetSidebar 안의 스위치) 안에서만 돌았다.
 *   그래서 **스위치가 화면에 없는 순간에는 동기화도 멈췄다.**
 *     - 조직 워크스페이스로 전환 → 사이드바가 없다 → 알림은 개인 프리셋을 계속 붙들고 있음
 *     - 프리셋을 전부 지움 / 로딩 중 → Planner 가 빈 화면을 그리며 사이드바를 안 그림 → 동기화 없음
 *   동기화는 **화면과 무관하게 워크스페이스 최상단에서 항상** 돌아야 한다.
 *   스위치는 그 상태를 구독해 그리기만 한다.
 *
 * 설치 후 처음이라면 알림을 **기본으로 켠다**(권한도 이때 물어본다).
 * 이 앱을 깐 이유가 곧 "지금 뭘 할 시간인지 보는 것"이라, 기본이 꺼짐이면
 * 사이드바 깊숙한 스위치를 찾아낸 사람만 이 기능을 쓰게 된다.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  initNoticeDefault,
  isNoticeSupported,
  setNoticeEnabled,
  syncNotice,
} from "../lib/scheduleNotice";
import { useActiveSchedule } from "./useActiveSchedule";

interface NoticeState {
  /** 이 기기에서 상시 알림을 쓸 수 있는가 (= 안드로이드 앱 안인가) */
  supported: boolean;
  enabled: boolean;
  /** 켜고 끄기. 실제로 켜졌는지를 돌려준다(권한을 거부하면 false) */
  toggle: () => Promise<boolean>;
}

const NoticeContext = createContext<NoticeState | null>(null);

export function NoticeProvider({ children }: { children: ReactNode }) {
  const value = useNoticeState();
  return <NoticeContext.Provider value={value}>{children}</NoticeContext.Provider>;
}

export function useScheduleNotice(): NoticeState {
  const ctx = useContext(NoticeContext);
  if (!ctx) {
    throw new Error("useScheduleNotice 는 <NoticeProvider> 안에서만 사용할 수 있습니다.");
  }
  return ctx;
}

function useNoticeState(): NoticeState {
  const supported = isNoticeSupported();
  const { schedule, sourceLabel, ready } = useActiveSchedule();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // 아직 다 못 읽었으면 아무것도 하지 않는다.
    // 여기서 성급하게 넘기면 알림이 "일정 없음"으로 깜빡였다가 돌아온다.
    if (!supported || !ready) return;

    let cancelled = false;

    (async () => {
      // 반드시 시간표를 먼저 넘기고 나서 켠다.
      // 순서가 뒤바뀌면 알림이 "지금은 비어 있어요" 로 먼저 떠서 첫인상을 망친다.
      //
      // schedule 이 null 이어도 넘긴다(빈 시간표). 안 넘기면 프리셋을 전부 지웠거나
      // 조직에 배포된 시간표가 없을 때 **알림에 옛 시간표가 그대로 남는다.**
      await syncNotice(schedule, sourceLabel);

      // 처음이면 켜주고, 두 번째부터는 현재 상태만 돌려받는다.
      // (사용자가 끈 알림을 앱 열 때마다 되살리면 그건 고장이다)
      const on = await initNoticeDefault();
      if (!cancelled) setEnabled(on);
    })();

    return () => {
      cancelled = true;
    };
  }, [supported, ready, schedule, sourceLabel]);

  async function toggle() {
    const next = await setNoticeEnabled(!enabled);
    setEnabled(next);
    return next;
  }

  return { supported, enabled, toggle };
}
