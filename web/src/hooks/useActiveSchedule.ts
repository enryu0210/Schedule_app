/*
 * "지금 사용자가 보고 있는 시간표"를 한곳에서 판단한다.
 *
 * 왜 필요한가:
 *   상시 알림(안드로이드)은 화면이 아니라 **워크스페이스**를 따라가야 한다.
 *   예전에는 이 판단이 PresetSidebar 안에 숨어 있어서, 조직 워크스페이스로 넘어가면
 *   훅이 통째로 언마운트되고 알림은 **개인 프리셋을 계속 붙들고 있었다.**
 *
 * 규칙 (바탕화면 위젯이 selected_org_id 로 판단하는 것과 똑같이 맞춘다):
 *   - 조직을 보는 중 → 관리자가 배포한 **조직 시간표**
 *   - 개인 계획표    → 지금 고른 **개인 프리셋**
 *
 * ready 를 따로 돌려주는 이유:
 *   아직 클라우드에서 읽는 중인데 schedule=null 을 그대로 믿으면,
 *   알림이 "일정 없음"으로 잠깐 깜빡였다가 돌아온다. 다 읽기 전에는 손대지 않는다.
 */
import type { Preset } from "../types";
import { useOrg } from "./useOrg";
import { usePresets } from "./usePresetStore";

export interface ActiveSchedule {
  /** 지금 보고 있는 시간표. 조직에 배포된 시간표가 없거나 프리셋이 하나도 없으면 null */
  schedule: Preset | null;
  /** 이 시간표의 이름(개인 프리셋명 / 조직명). 홈 위젯 머리글과 알림 스위치에 그대로 쓴다 */
  sourceLabel: string;
  /** 이 판단을 믿어도 되는가(= 필요한 데이터를 다 읽었는가) */
  ready: boolean;
}

export function useActiveSchedule(): ActiveSchedule {
  const { presets, selectedPresetId, loaded: presetsLoaded } = usePresets();
  const { workspace, currentOrg, orgPlan, loading: orgLoading, isPending } = useOrg();

  if (workspace.kind === "org") {
    const sourceLabel = currentOrg?.name ?? "조직";
    // 승인 대기 중이면 조직의 어떤 시간표도 볼 수 없다(RLS 가 주지 않는다) → 보여줄 것이 없다.
    if (isPending) return { schedule: null, sourceLabel, ready: true };
    return { schedule: orgPlan, sourceLabel, ready: !orgLoading };
  }

  // 개인: 고른 프리셋이 없으면 첫 번째를 쓴다 — Planner 가 화면에 그리는 규칙과 같아야 한다.
  // (화면에는 A 가 보이는데 알림엔 B 가 뜨면 그게 제일 이상하다)
  const schedule =
    presets.find((p) => p.id === selectedPresetId) ?? presets[0] ?? null;
  return {
    schedule,
    sourceLabel: schedule?.label ?? "",
    ready: presetsLoaded,
  };
}
