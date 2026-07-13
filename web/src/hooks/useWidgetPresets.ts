/*
 * 위젯 전용 "읽기 전용" 프리셋 로더.
 *
 * 왜 usePresetStore 를 재사용하지 않았나:
 *   usePresetStore 는 프리셋이 바뀌면 클라우드에 자동 저장한다. 위젯은 보기만 하는 화면인데
 *   저장 로직을 달고 다니면, 웹에서 방금 수정한 내용을 위젯이 오래된 상태로 덮어쓸 위험이 있다.
 *   그래서 위젯은 "읽기만" 하는 훅을 따로 둔다.
 *
 * 웹에서 시간표를 고치면 위젯도 따라가야 하므로 주기적으로 다시 읽는다.
 */
import { useEffect, useState } from "react";
import type { Preset } from "../types";
import { loadCloudPresets } from "../lib/cloudStorage";
import { useAuth } from "./useAuth";

// 다시 읽는 주기. 너무 짧으면 불필요한 네트워크 요청이 되고, 너무 길면 수정이 늦게 반영된다.
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

    async function refresh() {
      try {
        const cloud = await loadCloudPresets(user!.id);
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

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user?.id]);

  return { presets, selectedPresetId, loaded };
}
