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

// 클라우드에서 사용자의 프리셋을 불러온다. **실패하면 예외를 던진다.**
// - 저장된 행이 없으면 null (= 아직 클라우드 데이터 없음. 이건 정상 상황이라 예외가 아니다).
//
// loadCloudPresets 와 나눠 둔 이유:
//   "데이터가 없다(null)" 와 "못 읽었다(네트워크 끊김)" 는 완전히 다른 상황인데,
//   오류를 삼켜 null 로 뭉뚱그리면 부르는 쪽이 둘을 구분할 수 없다.
//   위젯은 이 차이가 중요하다 — 못 읽은 것뿐인데 빈 화면으로 바꿔버리면 안 되고,
//   캐시에 남은 마지막 일정을 계속 보여줘야 한다.
export async function fetchCloudPresets(userId: string): Promise<CloudState | null> {
  if (!supabase) throw new Error("Supabase 클라이언트가 설정되지 않았습니다.");

  const { data, error } = await supabase
    .from("user_data")
    .select("presets, selected_preset_id")
    .eq("user_id", userId)
    .maybeSingle(); // 행이 없어도 에러가 아닌 null 로 받는다.

  if (error) throw error;
  if (!data || !Array.isArray(data.presets) || data.presets.length === 0) {
    return null;
  }

  const presets = data.presets as Preset[];
  return {
    presets,
    selectedPresetId: data.selected_preset_id ?? presets[0].id,
  };
}

// 위 함수의 "오류를 삼키는" 버전. 웹(usePresetStore)은 읽기에 실패해도
// 로컬 데이터로 계속 동작하면 되므로 null 만 받으면 충분하다.
export async function loadCloudPresets(userId: string): Promise<CloudState | null> {
  if (!supabase) return null; // 키가 없는 환경은 오류가 아니라 "클라우드 없음"으로 본다.
  try {
    return await fetchCloudPresets(userId);
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
