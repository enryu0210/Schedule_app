/*
 * 프리셋 저장소 훅. 로컬(localStorage)과 클라우드(Supabase)를 하나로 묶는다.
 *
 * 동작 규칙:
 *   - 비로그인: localStorage 만 사용 (지금까지와 동일).
 *   - 로그인:   클라우드 데이터를 불러와 화면에 반영. 이후 변경은 로컬+클라우드 동시 저장.
 *   - 첫 로그인(클라우드에 데이터 없음): 지금 쓰던 로컬 데이터를 클라우드로 올린다(마이그레이션).
 *
 * 주의: 로그인 직후 클라우드를 다 읽기 전에 로컬 데이터를 덮어쓰지 않도록
 *       'cloudLoadedForUser' ref 로 순서를 보장한다. (데이터 유실 방지)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Preset } from "../types";
import { loadState, saveState } from "../lib/storage";
import { loadCloudPresets, saveCloudPresets } from "../lib/cloudStorage";
import { useAuth } from "./useAuth";

export function usePresetStore() {
  const { user } = useAuth();

  // 최초엔 로컬 데이터로 시작한다. (로그인 상태면 아래 effect가 클라우드로 교체)
  const initialLocal = useMemo(() => loadState(), []);
  const [presets, setPresets] = useState<Preset[]>(initialLocal.presets);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    initialLocal.selectedPresetId
  );

  // 현재 로그인한 사용자의 클라우드 데이터를 다 읽었는지 표시.
  // 이 값이 세팅되기 전엔 클라우드 저장을 하지 않아, 로컬로 클라우드를 덮는 사고를 막는다.
  const cloudLoadedForUser = useRef<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // 로그인 상태가 바뀌면 클라우드에서 데이터를 가져온다.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setSyncing(true);

    loadCloudPresets(user.id).then((cloud) => {
      if (cancelled) return;
      if (cloud) {
        // 클라우드에 데이터가 있으면 그것을 우선으로 화면에 반영.
        setPresets(cloud.presets);
        setSelectedPresetId(cloud.selectedPresetId);
      } else {
        // 클라우드가 비어 있으면(첫 로그인) 지금 로컬 데이터를 올린다.
        saveCloudPresets(user.id, { presets, selectedPresetId });
      }
      cloudLoadedForUser.current = user.id;
      setSyncing(false);
    });

    return () => {
      cancelled = true;
    };
    // 로그인한 사용자가 바뀔 때만 다시 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // 프리셋이 바뀔 때마다 저장. 로컬은 항상, 클라우드는 로그인+클라우드로딩 완료 시에만.
  useEffect(() => {
    saveState(presets, selectedPresetId); // 로컬은 항상 최신으로 유지(오프라인 캐시 역할)
    if (user && cloudLoadedForUser.current === user.id) {
      saveCloudPresets(user.id, { presets, selectedPresetId });
    }
  }, [presets, selectedPresetId, user]);

  return { presets, setPresets, selectedPresetId, setSelectedPresetId, syncing };
}
