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
 * 폴링만 쓰면 최대 1분까지 늦게 반영되고, 주기를 줄이면 하루 종일 켜두는 위젯이 계속 요청을 쏜다.
 */
import { useEffect, useState } from "react";
import type { Preset } from "../types";
import { loadCloudPresets } from "../lib/cloudStorage";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./useAuth";

// 안전망 폴링 주기. Realtime 이 살아 있으면 여기서 할 일은 사실상 없다.
const REFRESH_MS = 60_000;

export function useWidgetPresets() {
  const { user } = useAuth();

  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setPresets([]);
      setSelectedPresetId(null);
      setLoaded(false);
      return;
    }

    let cancelled = false;
    const userId = user.id;

    async function refresh() {
      try {
        const cloud = await loadCloudPresets(userId);
        if (cancelled) return;
        setPresets(cloud?.presets ?? []);
        setSelectedPresetId(cloud?.selectedPresetId ?? null);
      } catch {
        // 네트워크가 끊겨도 위젯이 죽으면 안 된다. 직전에 읽어둔 내용을 그대로 보여준다.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    refresh();
    const timer = setInterval(refresh, REFRESH_MS);

    // 내 행(user_data)이 바뀌면 즉시 다시 읽는다.
    // 알림에 담긴 새 값을 그대로 쓰지 않고 다시 읽는 이유: 파싱/기본값 처리를
    // loadCloudPresets 한 곳에만 두기 위해서다. (요청 한 번 더 하는 값은 충분히 싸다)
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
        () => refresh()
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
      cancelled = true;
      clearInterval(timer);
      if (channel) supabase?.removeChannel(channel);
    };
  }, [user?.id]);

  return { presets, selectedPresetId, loaded };
}
