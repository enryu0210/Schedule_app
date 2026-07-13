/*
 * 위젯 전용 "읽기 전용" 프리셋 로더.
 *
 * 왜 usePresetStore 를 재사용하지 않았나:
 *   usePresetStore 는 프리셋이 바뀌면 클라우드에 자동 저장한다. 위젯은 보기만 하는 화면인데
 *   저장 로직을 달고 다니면, 웹에서 방금 수정한 내용을 위젯이 오래된 상태로 덮어쓸 위험이 있다.
 *   그래서 위젯은 "읽기만" 하는 훅을 따로 둔다.
 *
 * 웹에서 시간표를 고치면 위젯이 곧바로 따라가야 한다. 두 가지 방법을 함께 쓴다:
 *   1) Realtime 구독 — 저장되는 순간 알림을 받아 다시 읽는다. (평소엔 이쪽이 일한다)
 *   2) 주기적 폴링   — 웹소켓이 끊기거나(절전/네트워크 전환) 알림을 놓쳤을 때를 위한 안전망.
 *   폴링만 쓰면 최대 1분까지 늦게 반영되고, 주기를 줄이면 하루 종일 켜두는 위젯이 계속 요청을 쏜다.
 *
 * 오프라인 캐시(lib/widgetCache):
 *   위젯은 바탕화면에 상주하므로 인터넷이 끊기는 순간을 반드시 만난다. 그때 빈 화면이 되지 않게
 *   ① 시작하자마자 캐시를 먼저 그리고(=네트워크를 기다리지 않는다),
 *   ② 클라우드 읽기에 성공하면 화면과 캐시를 함께 갱신하고,
 *   ③ 실패하면 지금 보이는 내용을 그대로 두고 "오프라인" 표시만 켠다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Preset } from "../types";
import { fetchCloudPresets } from "../lib/cloudStorage";
import { readWidgetCache, writeWidgetCache } from "../lib/widgetCache";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./useAuth";

// 안전망 폴링 주기. Realtime 이 살아 있으면 여기서 할 일은 사실상 없다.
const REFRESH_MS = 60_000;

export interface WidgetPresets {
  presets: Preset[];
  selectedPresetId: string | null;
  loaded: boolean;
  /** 클라우드 읽기에 실패해 캐시(또는 직전 화면)를 보여주는 중인지 */
  offline: boolean;
  /** 마지막으로 클라우드에서 읽어온 시각(ms). 아직 한 번도 못 읽었으면 null */
  lastSyncedAt: number | null;
}

export function useWidgetPresets(): WidgetPresets {
  const { user } = useAuth();

  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  // 언마운트/사용자 변경 이후에 늦게 도착한 응답이 화면을 되돌리지 못하게 막는 표식.
  const cancelledRef = useRef(false);

  const refresh = useCallback(async (userId: string) => {
    try {
      const cloud = await fetchCloudPresets(userId);
      if (cancelledRef.current) return;

      // 성공. cloud 가 null 이면 "아직 프리셋을 만들지 않은 사용자" — 빈 화면이 맞다.
      setPresets(cloud?.presets ?? []);
      setSelectedPresetId(cloud?.selectedPresetId ?? null);
      setOffline(false);
      setLastSyncedAt(Date.now());

      // 다음번 오프라인을 대비해 사본을 남긴다. (빈 결과는 덮어쓰지 않는다 —
      // 일시적으로 빈 응답을 받았다고 멀쩡한 캐시를 날릴 이유는 없다)
      if (cloud) writeWidgetCache(userId, cloud);
    } catch {
      // 실패 = 인터넷/서버 문제. 화면은 건드리지 않는다(캐시 또는 직전 내용 유지).
      if (cancelledRef.current) return;
      setOffline(true);
    } finally {
      if (!cancelledRef.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setPresets([]);
      setSelectedPresetId(null);
      setLoaded(false);
      setOffline(false);
      setLastSyncedAt(null);
      return;
    }

    cancelledRef.current = false;
    const userId = user.id;

    // ① 네트워크를 기다리기 전에 캐시부터 그린다.
    //    오프라인으로 부팅했거나 응답이 느릴 때 "불러오는 중…" 대신 어제 보던 일정이 뜬다.
    const cached = readWidgetCache(userId);
    if (cached) {
      setPresets(cached.presets);
      setSelectedPresetId(cached.selectedPresetId);
      setLastSyncedAt(cached.savedAt || null);
      setLoaded(true);
    }

    // ② 그 위에 최신 내용을 덮어쓴다.
    refresh(userId);
    const timer = setInterval(() => refresh(userId), REFRESH_MS);

    // 인터넷이 돌아온 순간 바로 따라잡는다. (이게 없으면 다음 폴링까지 최대 1분간
    // "오프라인" 표시가 남는다. 절전에서 깨어난 직후에도 이 이벤트가 온다)
    const handleOnline = () => refresh(userId);
    window.addEventListener("online", handleOnline);

    // 내 행(user_data)이 바뀌면 즉시 다시 읽는다.
    // 알림에 담긴 새 값을 그대로 쓰지 않고 다시 읽는 이유: 파싱/기본값 처리를
    // fetchCloudPresets 한 곳에만 두기 위해서다. (요청 한 번 더 하는 값은 충분히 싸다)
    const channel = supabase
      ?.channel(`widget:user_data:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // 첫 저장은 INSERT, 이후 수정은 UPDATE 라 둘 다 받는다.
          schema: "public",
          table: "user_data",
          filter: `user_id=eq.${userId}`,
        },
        () => refresh(userId)
      )
      .subscribe((status) => {
        // 구독이 실패해도 위젯은 폴링으로 계속 동작한다. 반영이 늦어질 뿐이다.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            `[Widget] Realtime 구독 실패(${status}) — 폴링으로만 갱신됩니다. ` +
              "Supabase 에서 user_data 테이블의 Realtime 이 켜져 있는지 확인하세요."
          );
        }
      });

    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      if (channel) supabase?.removeChannel(channel);
    };
  }, [user?.id, refresh]);

  return { presets, selectedPresetId, loaded, offline, lastSyncedAt };
}
