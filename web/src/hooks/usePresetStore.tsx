/*
 * 프리셋 저장소 (클라우드 전용) + Provider.
 *
 * 정책:
 *   - 이 앱은 "로그인 후 사용"이 원칙이다. 그래서 로그인한 사용자의 데이터를
 *     Supabase(클라우드)에서만 읽고 쓴다.
 *   - 신규 사용자는 저장된 프리셋이 없으므로 "빈 상태"로 시작한다.
 *
 * 주의: 클라우드 로딩이 끝나기 전(loaded=false)에는 저장하지 않는다.
 *       빈 초기값으로 클라우드를 덮어쓰는 사고를 막기 위함이다.
 *
 * 왜 Context 인가 (useOrg 와 같은 이유):
 *   예전에는 Planner 와 OrgWorkspace 가 이 훅을 각자 불렀다. 둘은 동시에 뜨지 않아서
 *   문제가 드러나지 않았지만, **상시 알림처럼 화면 밖에서 프리셋을 읽어야 하는 곳**이
 *   생기는 순간 저장소가 두 벌이 된다 — 자동 저장 effect 도 두 벌이라 같은 데이터를
 *   서로 덮어쓰게 된다. 인스턴스는 앱 전체에 하나여야 한다.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { Preset } from "../types";
import { loadCloudPresets, saveCloudPresets } from "../lib/cloudStorage";
import { useAuth } from "./useAuth";

interface PresetStore {
  presets: Preset[];
  setPresets: Dispatch<SetStateAction<Preset[]>>;
  selectedPresetId: string | null;
  setSelectedPresetId: Dispatch<SetStateAction<string | null>>;
  loaded: boolean;
}

const PresetContext = createContext<PresetStore | null>(null);

export function PresetProvider({ children }: { children: ReactNode }) {
  const value = usePresetState();
  return <PresetContext.Provider value={value}>{children}</PresetContext.Provider>;
}

/** 앱 어디서나 개인 프리셋을 꺼내 쓰는 훅. */
export function usePresets(): PresetStore {
  const ctx = useContext(PresetContext);
  if (!ctx) {
    throw new Error("usePresets 는 <PresetProvider> 안에서만 사용할 수 있습니다.");
  }
  return ctx;
}

// 실제 상태 로직. Provider 안에서 딱 한 번만 돈다.
function usePresetState(): PresetStore {
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
