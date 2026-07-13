/*
 * 프리셋 저장소 훅 (클라우드 전용).
 *
 * 정책 변경:
 *   - 이 앱은 "로그인 후 사용"이 원칙이다. 그래서 로그인한 사용자의 데이터를
 *     Supabase(클라우드)에서만 읽고 쓴다.
 *   - 신규 사용자는 저장된 프리셋이 없으므로 "빈 상태"로 시작한다.
 *     (예전처럼 '방학' 기본 프리셋을 자동으로 만들지 않는다.)
 *
 * 주의: 클라우드 로딩이 끝나기 전(loaded=false)에는 저장하지 않는다.
 *       빈 초기값으로 클라우드를 덮어쓰는 사고를 막기 위함이다.
 */
import { useEffect, useRef, useState } from "react";
import type { Preset } from "../types";
import { loadCloudPresets, saveCloudPresets } from "../lib/cloudStorage";
import { useAuth } from "./useAuth";

export function usePresetStore() {
  const { user } = useAuth();

  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  // 현재 로그인한 사용자의 클라우드 데이터를 다 읽었는지 여부.
  const [loaded, setLoaded] = useState(false);
  const cloudLoadedForUser = useRef<string | null>(null);

  // 로그인한 사용자가 바뀌면 그 사용자의 클라우드 데이터를 불러온다.
  useEffect(() => {
    if (!user) {
      // 로그아웃 상태로 돌아가면 상태를 비운다.
      setPresets([]);
      setSelectedPresetId(null);
      setLoaded(false);
      cloudLoadedForUser.current = null;
      return;
    }

    let cancelled = false;
    setLoaded(false);

    loadCloudPresets(user.id).then((cloud) => {
      if (cancelled) return;
      if (cloud) {
        setPresets(cloud.presets);
        setSelectedPresetId(cloud.selectedPresetId);
      } else {
        // 신규 사용자: 저장된 게 없으니 빈 상태로 시작.
        setPresets([]);
        setSelectedPresetId(null);
      }
      cloudLoadedForUser.current = user.id;
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // 프리셋이 바뀌면 클라우드에 저장. (로딩 완료 + 사용자 일치 시에만)
  useEffect(() => {
    if (!user) return;
    if (!loaded || cloudLoadedForUser.current !== user.id) return;
    saveCloudPresets(user.id, { presets, selectedPresetId });
  }, [presets, selectedPresetId, user, loaded]);

  return { presets, setPresets, selectedPresetId, setSelectedPresetId, loaded };
}
