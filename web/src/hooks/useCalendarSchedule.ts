/*
 * 구글 캘린더 달 일정 로더 훅.
 *
 * 역할:
 *   1) 내 calendar_schedules 를 읽어 '연결됨/동기화됨'을 화면에 넘긴다.
 *   2) 방금 연결만 하고 아직 데이터가 없으면(자리표시 행) 자동으로 한 번 동기화한다.
 *   3) "지금 새로고침"(syncNow)을 노출한다.
 *   4) 서버가 동기화를 끝내 calendar_schedules 가 바뀌면 Realtime 으로 즉시 따라간다.
 *
 * 읽기 전용 원칙(useWidgetPresets 와 같은 결): 이 훅은 테이블에 직접 쓰지 않는다.
 *   동기화(쓰기)는 서버 함수가 하고, 여기선 그 결과를 읽어 보여줄 뿐이다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarSchedule } from "../types";
import { fetchCalendarSchedule, type CalendarState } from "../lib/calendarStorage";
import { syncGoogleCalendar } from "../lib/googleCalendar";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./useAuth";

export interface CalendarData {
  schedule: CalendarSchedule | null;
  connected: boolean;
  loaded: boolean;
  syncing: boolean;
  /** 지금 동기화. 실패하면 예외를 던진다(호출한 쪽이 사용자에게 알린다). */
  syncNow: () => Promise<void>;
}

export function useCalendarSchedule(enabled: boolean): CalendarData {
  const { user } = useAuth();

  const [schedule, setSchedule] = useState<CalendarSchedule | null>(null);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // 언마운트/사용자 변경 이후 늦게 온 응답이 화면을 되돌리지 못하게 막는 표식.
  const cancelledRef = useRef(false);

  // 서버에서 현재 상태를 읽어 화면에 반영한다. 읽은 상태를 그대로 돌려준다(자동 동기화 판단용).
  const load = useCallback(async (userId: string): Promise<CalendarState | null> => {
    try {
      const state = await fetchCalendarSchedule(userId);
      if (cancelledRef.current) return null;
      setConnected(state.connected);
      setSchedule(state.schedule);
      return state;
    } catch (e) {
      if (!cancelledRef.current) console.error("[Calendar] 일정 불러오기 실패", e);
      return null;
    } finally {
      if (!cancelledRef.current) setLoaded(true);
    }
  }, []);

  // 서버에 "지금 동기화"를 요청하고, 끝나면 다시 읽어 반영한다. 실패는 위로 던진다.
  const runSync = useCallback(
    async (userId: string) => {
      if (cancelledRef.current) return;
      setSyncing(true);
      try {
        await syncGoogleCalendar();
        // 성공하면 Realtime 이 새 행을 밀어주지만, 확실히 하려고 한 번 더 읽는다.
        if (!cancelledRef.current) await load(userId);
      } finally {
        if (!cancelledRef.current) setSyncing(false);
      }
    },
    [load],
  );

  const syncNow = useCallback(async () => {
    if (user) await runSync(user.id);
  }, [user, runSync]);

  useEffect(() => {
    // 캘린더 뷰를 보고 있지 않거나(비활성) 로그인/Supabase 가 없으면 아무것도 하지 않는다.
    if (!enabled || !supabase || !user) {
      setConnected(false);
      setSchedule(null);
      setSyncing(false);
      setLoaded(!enabled); // 비활성이면 '로딩 끝'으로 둬서 화면이 멈춰 보이지 않게.
      return;
    }

    cancelledRef.current = false;
    const userId = user.id;

    // 연결만 하고 아직 실데이터가 없으면(방금 막 연결) 자동으로 한 번만 당겨온다.
    // 자동 동기화가 실패해도(예: 함수 미배포) 화면은 '동기화 대기'로 남고, 사용자가 '새로고침'으로 재시도.
    let autoSynced = false;
    (async () => {
      const state = await load(userId);
      if (state?.connected && !state.schedule && !autoSynced) {
        autoSynced = true;
        try {
          await runSync(userId);
        } catch (e) {
          console.error("[Calendar] 자동 동기화 실패", e);
        }
      }
    })();

    // 서버가 calendar_schedules 를 갱신하면(동기화 완료) 즉시 다시 읽는다.
    const channel = supabase
      .channel(`calendar:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calendar_schedules",
          filter: `user_id=eq.${userId}`,
        },
        () => load(userId),
      )
      .subscribe((status) => {
        // 실패해도 '새로고침' 버튼으로 수동 갱신이 가능하다. 자동 반영만 늦어질 뿐.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[Calendar] Realtime 구독 실패(${status})`);
        }
      });

    return () => {
      cancelledRef.current = true;
      supabase?.removeChannel(channel);
    };
  }, [enabled, user?.id, load, runSync]);

  return { schedule, connected, loaded, syncing, syncNow };
}
