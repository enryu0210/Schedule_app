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
  // 지금 보고 있는 작업 공간. null = 개인 계획표, 값이 있으면 그 조직.
  // 위젯이 "웹에서 마지막으로 보던 것"을 따라가기 위해 클라우드에 둔다
  // (위젯은 별개의 WebView 라 localStorage 를 공유하지 못한다).
  selectedOrgId: string | null;
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
    .select("presets, selected_preset_id, selected_org_id")
    .eq("user_id", userId)
    .maybeSingle(); // 행이 없어도 에러가 아닌 null 로 받는다.

  if (error) throw error;
  if (!data) return null;

  const presets = Array.isArray(data.presets) ? (data.presets as Preset[]) : [];
  const selectedOrgId = (data.selected_org_id as string | null) ?? null;

  // 개인 프리셋도 없고 보고 있는 조직도 없으면 "아직 아무것도 없는 사용자"다.
  //
  // 조직을 보고 있다면 개인 프리셋이 하나도 없어도 null 을 돌려주면 안 된다.
  // 개인 계획표는 안 쓰고 조직 시간표만 보는 사람이 실제로 있는데,
  // 그때 null 을 주면 위젯이 "데이터 없음"으로 판단해 빈 화면이 된다.
  if (presets.length === 0 && !selectedOrgId) return null;

  return {
    presets,
    selectedPresetId: data.selected_preset_id ?? presets[0]?.id ?? null,
    selectedOrgId,
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
//
// selected_org_id 는 여기서 건드리지 않는다(보내는 컬럼만 갱신된다).
// 프리셋을 저장할 때마다 작업 공간 선택까지 덮어쓰면, 웹에서 개인 계획표를 고치는 순간
// 위젯이 조직 시간표에서 개인으로 튕겨나간다.
export async function saveCloudPresets(
  userId: string,
  state: Pick<CloudState, "presets" | "selectedPresetId">
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

/**
 * 지금 보고 있는 작업 공간을 클라우드에 남긴다. (null = 개인 계획표)
 * 위젯은 이 값을 읽어 "웹에서 마지막으로 보던 것"을 그대로 보여준다.
 */
export async function saveSelectedOrgId(
  userId: string,
  orgId: string | null
): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("user_data")
      .upsert({ user_id: userId, selected_org_id: orgId }, { onConflict: "user_id" });
    if (error) throw error;
  } catch (e) {
    // 실패해도 웹 화면은 정상 동작한다(localStorage 에 이미 기억해 뒀다).
    // 위젯이 이전 화면을 계속 보여줄 뿐이다.
    console.error("[Supabase] 작업 공간 저장 실패", e);
  }
}
