/*
 * 달(월) 달력 격자 계산 — 순수 함수 모음.
 *
 * 주간 시간표(time.ts)와는 축이 다르다. 여기선 '날짜에 못박힌' 구글 캘린더 일정을
 * 달력 모양(월요일 시작 7칸 x 여러 주)으로 배치한다.
 * UI 와 분리해 두면 요일 시작·앞뒤 달 채움 같은 자잘한 규칙을 한곳에서 관리하고 테스트하기 쉽다.
 */
import type { CalendarEvent } from "../types";

// 달력 한 칸(하루).
export interface MonthDay {
  date: string;      // "YYYY-MM-DD"
  day: number;       // 1~31
  inMonth: boolean;  // 이 달의 날짜인가 (격자 앞뒤를 메우는 이웃 달 칸이면 false)
  isToday: boolean;
  weekend: boolean;  // 토/일 (색을 죽여 평일과 구분)
}

// "YYYY-MM-DD" 를 로컬 시각 기준으로 만든다.
// toISOString() 을 쓰면 UTC 로 밀려 하루가 어긋날 수 있어(한국 +9), 부품을 직접 조립한다.
function ymd(year: number, monthIndex0: number, day: number): string {
  const mm = String(monthIndex0 + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** 오늘이 속한 달을 "YYYY-MM" 로. (월 뷰의 기본 표시 달) */
export function currentMonth(today: Date = new Date()): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

/** 표시 중인 달을 delta 만큼 앞뒤로 옮긴다. (◀ ▶ 버튼용) */
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  // Date 가 월 넘침(예: 13월)을 알아서 다음 해로 정리해준다.
  const d = new Date(year, mon - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-07" → "2026년 7월" (머리글 표시용) */
export function formatMonthTitle(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return `${year}년 ${mon}월`;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-07-12" → "7월 12일 (일)" (날짜 팝업 제목용). 로컬 Date 로 만들어 요일이 밀리지 않게 한다. */
export function formatDayTitle(date: string): string {
  const [year, mon, day] = date.split("-").map(Number);
  const dow = new Date(year, mon - 1, day).getDay(); // 0=일
  return `${mon}월 ${day}일 (${WEEKDAY_KO[dow]})`;
}

/**
 * "YYYY-MM" 한 달을 월요일 시작 주(week)들의 격자로 만든다.
 * 첫 주 앞과 마지막 주 뒤는 이웃 달 날짜로 채워 항상 7칸을 맞춘다(달력 모양 유지).
 */
export function buildMonthGrid(month: string, today: Date = new Date()): MonthDay[][] {
  const [year, mon] = month.split("-").map(Number);
  const monthIndex = mon - 1; // JS Date 는 0=1월
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate());

  // 이 달 1일의 요일. JS getDay()는 0=일요일이므로, 월요일 시작 기준으로 바꾼다.
  const firstDow = new Date(year, monthIndex, 1).getDay();
  const leadingBlanks = (firstDow + 6) % 7; // 월(1)→0, 화(2)→1 … 일(0)→6

  // 이 달의 날 수. (다음 달 0일 = 이번 달 마지막 날)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const weekCount = Math.ceil((leadingBlanks + daysInMonth) / 7);

  // 격자 시작 = 이 달 1일에서 leadingBlanks 만큼 앞으로.
  const cursor = new Date(year, monthIndex, 1 - leadingBlanks);

  const weeks: MonthDay[][] = [];
  for (let w = 0; w < weekCount; w++) {
    const week: MonthDay[] = [];
    for (let d = 0; d < 7; d++) {
      const dow = cursor.getDay();
      const dateStr = ymd(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      week.push({
        date: dateStr,
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === monthIndex,
        isToday: dateStr === todayStr,
        weekend: dow === 0 || dow === 6,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/**
 * 이벤트를 날짜별로 묶는다. 한 칸(하루)에 무엇을 그릴지 빠르게 찾으려는 것.
 * 하루 안에서는 종일 일정을 맨 위로, 그 다음 시작시각 순으로 정렬한다.
 */
export function groupEventsByDate(
  events: CalendarEvent[]
): Record<string, CalendarEvent[]> {
  const byDate: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    (byDate[ev.date] ??= []).push(ev);
  }
  for (const date in byDate) {
    byDate[date].sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1; // 종일 먼저
      return a.start.localeCompare(b.start);               // 그다음 이른 시각 먼저
    });
  }
  return byDate;
}
