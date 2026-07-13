/*
 * 위젯 오프라인 캐시.
 *
 * 왜 필요한가:
 *   위젯은 하루 종일 바탕화면에 떠 있는데, 인터넷이 끊기거나(절전 복귀 직후, 와이파이 전환)
 *   Supabase 가 잠깐 응답하지 않으면 읽어올 일정이 없어 빈 화면이 된다.
 *   마지막으로 성공적으로 읽은 일정을 로컬에 남겨두면, 그동안 그것을 대신 보여줄 수 있다.
 *
 * 왜 localStorage 인가:
 *   위젯은 Tauri WebView2 안에서 도는 "웹앱"이라 로컬 저장소는 브라우저 것을 그대로 쓴다.
 *   프리셋 전체라 해봐야 수십 KB 수준이라 localStorage 용량(5MB)으로 충분하다.
 *
 * 주의: 이 캐시는 "보여주기용 사본"일 뿐이다. 위젯은 절대 클라우드에 쓰지 않으므로,
 *       캐시가 오래됐더라도 원본(클라우드)을 덮어쓸 일은 없다.
 */
import type { CloudState } from "./cloudStorage";

// 사용자마다 따로 저장한다. 한 PC 를 여러 계정이 쓰면 남의 일정이 보이면 안 되기 때문이다.
const KEY_PREFIX = "widget-cache:";

export interface CachedPresets extends CloudState {
  // 마지막으로 클라우드에서 읽어온 시각(ms). "언제 기준 일정인지" 표시에 쓴다.
  savedAt: number;
}

function keyOf(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

// 캐시를 읽는다. 없거나 형식이 깨졌으면 null.
export function readWidgetCache(userId: string): CachedPresets | null {
  try {
    const raw = localStorage.getItem(keyOf(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CachedPresets>;
    // 예전 버전이 남긴 값이나 손상된 값을 그대로 믿지 않는다.
    if (!Array.isArray(parsed.presets) || parsed.presets.length === 0) return null;

    return {
      presets: parsed.presets,
      selectedPresetId: parsed.selectedPresetId ?? parsed.presets[0].id,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    // 파싱 실패 = 캐시가 없는 것과 똑같이 취급한다. 위젯이 죽는 것보다 낫다.
    return null;
  }
}

// 클라우드에서 읽기에 성공했을 때만 부른다.
export function writeWidgetCache(userId: string, state: CloudState): void {
  try {
    const payload: CachedPresets = { ...state, savedAt: Date.now() };
    localStorage.setItem(keyOf(userId), JSON.stringify(payload));
  } catch {
    // 저장 공간이 꽉 찼거나 접근이 막혀도 위젯 동작 자체는 계속돼야 한다.
  }
}

// 로그아웃 시 남의 일정이 다음 사용자에게 보이지 않도록 지운다.
export function clearWidgetCache(userId: string): void {
  try {
    localStorage.removeItem(keyOf(userId));
  } catch {
    /* 지우기 실패는 무시해도 되는 수준이다. */
  }
}
