/*
 * 프리셋 저장/불러오기 (로컬 우선 방식).
 * - 지금은 브라우저 localStorage 에 저장한다.
 * - 나중에 Supabase 연동 시, 이 파일의 함수 시그니처만 유지하면
 *   내부 구현만 바꿔 클라우드 동기화로 확장할 수 있다. (교체 지점을 한 곳에 모음)
 */
import type { Preset } from "../types";
import { createDefaultPreset } from "../data/defaultPreset";

const STORAGE_KEY = "schedule_app:presets:v1";
const SELECTED_KEY = "schedule_app:selectedPresetId:v1";

// 저장된 전체 상태 형태.
interface StoredState {
  presets: Preset[];
  selectedPresetId: string;
}

// 프리셋 목록을 불러온다. 저장된 게 없거나 손상됐으면 기본 프리셋으로 초기화한다.
export function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();

    const presets = JSON.parse(raw) as Preset[];
    // 최소 검증: 배열이고 하나 이상 있어야 정상으로 본다.
    if (!Array.isArray(presets) || presets.length === 0) return initialState();

    const selectedPresetId = localStorage.getItem(SELECTED_KEY) ?? presets[0].id;
    // 저장된 선택 id가 목록에 없으면 첫 번째로 되돌린다.
    const validSelected = presets.some((p) => p.id === selectedPresetId)
      ? selectedPresetId
      : presets[0].id;

    return { presets, selectedPresetId: validSelected };
  } catch (e) {
    // JSON 파싱 실패 등 예외 상황: 앱이 죽지 않도록 기본값으로 복구한다.
    console.error("프리셋 불러오기 실패, 기본값으로 복구합니다.", e);
    return initialState();
  }
}

// 프리셋 목록과 선택 상태를 저장한다.
export function saveState(presets: Preset[], selectedPresetId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    localStorage.setItem(SELECTED_KEY, selectedPresetId);
  } catch (e) {
    // 용량 초과(QuotaExceeded) 등에 대비. 저장 실패해도 화면은 계속 동작한다.
    console.error("프리셋 저장 실패", e);
  }
}

// 최초 실행 시의 기본 상태.
function initialState(): StoredState {
  const preset = createDefaultPreset();
  return { presets: [preset], selectedPresetId: preset.id };
}
