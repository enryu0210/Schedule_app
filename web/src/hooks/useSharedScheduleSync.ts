/*
 * 공유한 시간표 자동 갱신.
 *
 * 왜 필요한가 (이게 없으면 나는 사고):
 *   조직에 공유되는 것은 프리셋의 '사본'이다. 그래서 팀원이 개인 계획표를 고쳐도
 *   공유본은 옛날 그대로 남는다. 팀원은 고쳤다고 생각하는데,
 *   관리자는 옛 시간표를 보고 회의를 잡는다. 아무도 틀린 걸 모른 채로 사고가 난다.
 *   → 사람이 '공유 갱신' 버튼을 누르는 것에 의존하면 안 된다. 자동으로 따라가게 한다.
 *
 * 동작:
 *   개인 프리셋이 바뀌면, 내가 그 프리셋을 공유해 둔 모든 조직의 사본을 갱신한다.
 *   (같은 프리셋을 여러 조직에 공유했을 수 있으므로 조직을 순회한다)
 *
 * 하지 않는 것 — 프리셋을 지웠을 때 공유본까지 지우지는 않는다.
 *   로딩 도중 presets 가 잠깐 빈 배열인 순간이 있어서, 그걸 '삭제'로 오해하면
 *   팀원의 공유 시간표가 통째로 날아간다. 지우는 것은 항상 사용자가
 *   '공유 내리기'로 직접 하게 둔다. (되돌릴 수 없는 일은 자동으로 하지 않는다)
 */
import { useEffect, useRef } from "react";
import type { Preset } from "../types";
import { fetchMySharedSchedules, shareMySchedule } from "../lib/orgStorage";
import { useAuth } from "./useAuth";

// 편집을 멈춘 뒤 이만큼 지나면 갱신한다. 타이핑/드래그 중 매번 서버에 쓰지 않기 위함이다.
const SYNC_DELAY_MS = 1200;

export function useSharedScheduleSync(presets: Preset[], loaded: boolean) {
  const { user } = useAuth();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    // 클라우드에서 다 읽기 전에는 절대 건드리지 않는다.
    // 빈 초기값으로 공유본을 덮어쓰는 사고를 막는다(usePresetStore 와 같은 원칙).
    if (!user || !loaded || presets.length === 0) return;

    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void syncSharedSchedules(user.id, presets);
    }, SYNC_DELAY_MS);

    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [presets, loaded, user?.id]);
}

async function syncSharedSchedules(userId: string, presets: Preset[]) {
  try {
    const shared = await fetchMySharedSchedules(userId);
    if (shared.length === 0) return; // 아무 데도 공유하지 않았으면 할 일이 없다.

    for (const { orgId, schedule } of shared) {
      // 공유본과 같은 id 를 가진 개인 프리셋 = 이 공유본의 '원본'.
      const source = presets.find((p) => p.id === schedule.id);
      // 원본이 사라졌다면(삭제했거나 아직 못 읽었거나) 건드리지 않는다. 위 주석 참고.
      if (!source) continue;

      // 내용이 같으면 쓰지 않는다. 무의미한 서버 쓰기 + Realtime 알림을 줄인다.
      if (JSON.stringify(source) === JSON.stringify(schedule)) continue;

      await shareMySchedule(orgId, userId, source);
    }
  } catch (e) {
    // 실패해도 개인 계획표 사용은 계속돼야 한다. 다음 편집 때 다시 시도된다.
    console.error("[Org] 공유 시간표 자동 갱신 실패", e);
  }
}
