/*
 * 안드로이드 "상시 알림" 다리 (웹 → 네이티브).
 *
 * 알림에 뭘 띄울지는 **네이티브가 스스로 판단한다.** 웹은 주간 시간표를 넘겨줄 뿐이다.
 * 앱이 꺼져 있을 때도 알림은 갱신돼야 하는데, 그때는 웹뷰가 없어서 물어볼 수가 없기 때문이다.
 *
 * 안드로이드가 아닌 곳(웹·데스크탑 위젯)에서는 전부 조용히 무시한다 — 호출하는 쪽에서
 * 플랫폼을 따지지 않아도 되게 하기 위해서다.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Preset } from "../types";

interface ScheduleNoticePlugin {
  sync(options: { week: string }): Promise<void>;
  setEnabled(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
  isEnabled(): Promise<{ enabled: boolean }>;
  initDefault(): Promise<{ enabled: boolean }>;
}

const ScheduleNotice = registerPlugin<ScheduleNoticePlugin>("ScheduleNotice");

/** 이 기기에서 상시 알림을 쓸 수 있는가 (= 안드로이드 앱 안인가). */
export function isNoticeSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/**
 * 프리셋을 네이티브가 읽는 형식으로 줄인다.
 *
 * 색상·id 는 알림에 쓸 일이 없으므로 버린다. 넘기는 것이 적을수록
 * 네이티브 쪽 파싱이 단순해지고, 나중에 필드가 바뀌어도 덜 깨진다.
 *   [[{ s: "07:30", e: "17:00", l: "국가근로" }, …], …]   // 0=월 … 6=일
 */
function toNativeWeek(preset: Preset): string {
  const week = preset.days.map((day) =>
    day.blocks.map((b) => ({ s: b.start, e: b.end, l: b.label }))
  );
  return JSON.stringify(week);
}

/** 지금 보고 있는 시간표를 네이티브에 넘긴다. (실패해도 앱은 계속 돌아야 한다) */
export async function syncNotice(preset: Preset | null): Promise<void> {
  if (!isNoticeSupported() || !preset) return;
  try {
    await ScheduleNotice.sync({ week: toNativeWeek(preset) });
  } catch (e) {
    // 알림이 안 되는 것은 앱을 못 쓰게 만들 정도의 문제가 아니다 → 로그만 남긴다.
    console.warn("상시 알림 동기화 실패", e);
  }
}

/** 상시 알림 켜기/끄기. 실제로 켜졌는지를 돌려준다(권한을 거부하면 false). */
export async function setNoticeEnabled(enabled: boolean): Promise<boolean> {
  if (!isNoticeSupported()) return false;
  try {
    const res = await ScheduleNotice.setEnabled({ enabled });
    return res.enabled;
  } catch (e) {
    console.warn("상시 알림 설정 실패", e);
    return false;
  }
}

/** 지금 켜져 있는지. (앱을 다시 열었을 때 스위치 상태를 맞추는 데 쓴다) */
export async function getNoticeEnabled(): Promise<boolean> {
  if (!isNoticeSupported()) return false;
  try {
    const res = await ScheduleNotice.isEnabled();
    return res.enabled;
  } catch {
    return false;
  }
}

/**
 * 설치 후 처음이면 알림을 기본으로 켠다(권한도 이때 물어본다).
 * 두 번째부터는 현재 상태만 돌려준다 — 사용자가 끈 것을 다시 켜지 않는다.
 */
export async function initNoticeDefault(): Promise<boolean> {
  if (!isNoticeSupported()) return false;
  try {
    const res = await ScheduleNotice.initDefault();
    return res.enabled;
  } catch (e) {
    console.warn("상시 알림 초기 설정 실패", e);
    return false;
  }
}
