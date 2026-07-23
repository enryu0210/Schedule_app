/*
 * 구글 캘린더 '읽기' 계층 — calendar_schedules 테이블에서 동기화된 달 일정을 가져온다.
 *
 * 쓰기(동기화)는 클라이언트가 하지 않는다. 서버(Edge Function)만 이 테이블에 쓴다(RLS).
 * 그래서 여기는 순수 읽기 전용이다. (cloudStorage.ts 의 fetchCloudPresets 와 같은 결)
 *
 * '연결됨' 판정을 이 행의 '존재'로 한다:
 *   토큰 테이블(google_calendar_tokens)은 클라이언트가 한 줄도 못 읽으므로,
 *   "연결했는지"를 물어볼 수 없다. 대신 연결 시 콜백이 calendar_schedules 에 자리표시 행을
 *   하나 만들어 둔다 → 그 행이 있으면 '연결됨'. 실제 이벤트가 채워졌는지는 syncedAt 으로 가른다.
 */
import type { CalendarSchedule } from "../types";
import { supabase } from "./supabaseClient";

export interface CalendarState {
  // 구글 캘린더를 연결했는가 (calendar_schedules 에 내 행이 있는가).
  connected: boolean;
  // 실제로 동기화된 달 일정. 연결만 하고 아직 못 받았으면(자리표시 행) null.
  schedule: CalendarSchedule | null;
}

/**
 * 내 캘린더 상태를 읽는다. **실패하면 예외를 던진다**(네트워크 오류 등).
 * 행이 없으면 '미연결'(정상 상황이라 예외가 아니다).
 */
export async function fetchCalendarSchedule(userId: string): Promise<CalendarState> {
  if (!supabase) throw new Error("Supabase 클라이언트가 설정되지 않았습니다.");

  const { data, error } = await supabase
    .from("calendar_schedules")
    .select("schedule")
    .eq("user_id", userId)
    .maybeSingle(); // 행이 없어도 에러가 아닌 null 로 받는다.

  if (error) throw error;
  if (!data) return { connected: false, schedule: null };

  const sched = data.schedule as CalendarSchedule | null;
  // 연결은 됐지만 아직 실제 동기화 전(자리표시 행)이면 syncedAt 이 0 이다 → schedule 은 null 로 취급.
  const synced = !!sched && typeof sched.syncedAt === "number" && sched.syncedAt > 0;
  return { connected: true, schedule: synced ? sched : null };
}
