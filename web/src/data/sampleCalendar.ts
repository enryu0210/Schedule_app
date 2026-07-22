/*
 * 월 뷰 미리보기(?preview=month, 개발 전용)용 가짜 캘린더 데이터.
 *
 * 아직 구글 실데이터가 붙기 전(Phase 2~3)에 달 뷰 화면을 눈으로 확인하려는 용도다.
 * 이번 달 실제 날짜 위에 몇 개를 흩뿌려, "오늘" 강조와 여러 일정이 겹친 칸까지 보이게 한다.
 * Phase 3 에서 실데이터가 붙으면 이 파일은 지운다.
 */
import type { CalendarEvent, CalendarSchedule } from "../types";
import { currentMonth } from "../lib/monthGrid";

function mk(
  month: string,
  day: number,
  start: string,
  end: string,
  label: string,
  allDay = false
): CalendarEvent {
  return {
    id: `${month}-${day}-${start}-${label}`,
    date: `${month}-${String(day).padStart(2, "0")}`,
    start,
    end,
    label,
    allDay,
  };
}

export function sampleCalendarSchedule(): CalendarSchedule {
  const month = currentMonth();
  const events: CalendarEvent[] = [
    mk(month, 3, "10:00", "11:00", "팀 회의"),
    mk(month, 3, "14:00", "15:30", "치과 예약"),
    mk(month, 3, "19:00", "21:00", "스터디"),
    mk(month, 3, "22:00", "23:00", "운동"), // 4개째 → "+1" 로 접히는지 확인
    mk(month, 7, "09:30", "10:30", "1on1"),
    mk(month, 12, "00:00", "23:59", "워크숍", true), // 종일 일정
    mk(month, 12, "18:00", "20:00", "저녁 약속"),
    mk(month, 18, "13:00", "14:00", "병원"),
    mk(month, 24, "11:00", "12:00", "미용실"),
    mk(month, 28, "20:00", "22:00", "영화"),
  ];
  return {
    events,
    rangeStart: `${month}-01`,
    rangeEnd: `${month}-28`,
    // 12분 전에 동기화한 것처럼 보이게 (배지 문구 확인용)
    syncedAt: Date.now() - 12 * 60 * 1000,
  };
}
