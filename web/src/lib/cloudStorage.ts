/*
 * Supabase 클라우드 저장/불러오기.
 * - 로그인한 사용자의 프리셋을 user_data 테이블(사용자당 1행)에 통째로 저장한다.
 * - 로컬 저장(storage.ts)과 같은 형태의 데이터를 주고받아, 위쪽 로직이 동일하게 동작하도록 한다.
 */
import type { Preset } from "../types";
import { supabase } from "./supabaseClient";

export interface CloudState {
  presets: Preset[];
  // 프리셋이 하나도 없는 신규 사용자는 null 일 수 있다.
  selectedPresetId: string | null;
}

// 클라우드에서 사용자의 프리셋을 불러온다.
// - 저장된 행이 없으면 null 을 반환한다(= 아직 클라우드 데이터 없음 → 로컬 데이터를 올릴 대상).
// - 오류가 나면 null 을 반환하고 로그를 남겨, 앱이 로컬 데이터로 계속 동작하게 한다.
export async function loadCloudPresets(userId: string): Promise<CloudState | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("user_data")
      .select("presets, selected_preset_id")
      .eq("user_id", userId)
      .maybeSingle(); // 행이 없어도 에러가 아닌 null 로 받는다.

    if (error) throw error;
    if (!data || !Array.isArray(data.presets) || data.presets.length === 0) {
      return null;
    }

    return {
      presets: data.presets as Preset[],
      selectedPresetId: data.selected_preset_id ?? (data.presets as Preset[])[0].id,
    };
  } catch (e) {
    console.error("[Supabase] 프리셋 불러오기 실패", e);
    return null;
  }
}

// 클라우드에 사용자의 프리셋을 저장한다. (있으면 갱신, 없으면 삽입 = upsert)
export async function saveCloudPresets(
  userId: string,
  state: CloudState
): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("user_data").upsert(
      {
        user_id: userId,
        presets: state.presets,
        selected_preset_id: state.selectedPresetId,
      },
      { onConflict: "user_id" }
    );
    if (error) throw error;
    return true;
  } catch (e) {
    // 저장 실패해도 화면은 로컬 데이터로 계속 동작한다.
    console.error("[Supabase] 프리셋 저장 실패", e);
    return false;
  }
}
