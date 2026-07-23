/*
 * 위젯이 "지금" 무엇을 보여줄지 고르는 순수 함수 모음.
 *
 * 왜 화면(WidgetBody)에서 빼냈나:
 *   시간 판정은 눈으로 확인하기가 제일 어렵다 — 자정이나 정시가 될 때까지 기다려야 하니까.
 *   순수 함수로 빼두면 시각을 인자로 넣어 하루치를 즉시 돌려볼 수 있고,
 *   WidgetBody 는 "받은 걸 그리기"에만 집중할 수 있다.
 */
import type { DayPlan, ScheduleBlock } from "../types";
import { expandedEndMinutes, isNowInBlock, toMinutes } from "./time";

/** 하루는 1440분. 어제 시간축과 오늘 시간축을 오갈 때 쓴다. */
const MINUTES_PER_DAY = 1440;

export interface WidgetBlock extends ScheduleBlock {
  /**
   * 어제에서 자정을 넘겨 넘어온 블록인지.
   * start/end 는 어제 기준 값("23:00"~"01:00")이라, 시간을 따질 때 어제 시간축으로 돌려놔야 한다.
   */
  fromYesterday?: boolean;
}

/**
 * 위젯 화면에 올릴 블록 목록을 만든다. (오늘 블록 + 어제에서 넘어온 블록)
 *
 * 왜 어제 것을 데려오나:
 *   예전에는 오늘 요일의 블록만 봤다. 그래서 23:00~01:00 같은 야간 일정이
 *   00시가 되는 순간 화면에서 사라지고 "지금은 일정이 없어요" 가 떴다 — 아직 진행 중인데.
 *   어제 블록 중 '자정을 넘기는 것'만 후보로 데려오면, 실제로 끝났는지는
 *   pickCurrentBlock 이 시각을 보고 판단한다.
 *
 * @param days     프리셋의 7일치 계획 (월~일)
 * @param todayIdx 오늘 요일 (0=월 ... 6=일)
 */
export function buildWidgetBlocks(
  days: DayPlan[] | undefined,
  todayIdx: number
): WidgetBlock[] {
  const today = days?.[todayIdx]?.blocks ?? [];

  // 월요일(0)의 어제는 일요일(6). 음수가 되지 않게 +6 후 나머지로 돈다.
  const yesterdayIdx = (todayIdx + 6) % 7;
  const carried = (days?.[yesterdayIdx]?.blocks ?? [])
    // 자정을 넘기지 않는 어제 블록은 오늘 화면에 올 일이 없다.
    .filter((b) => expandedEndMinutes(b.start, b.end) > MINUTES_PER_DAY)
    .map<WidgetBlock>((b) => ({ ...b, fromYesterday: true }));

  return [...carried, ...today];
}

/**
 * 블록의 시작 시각을 "오늘 0시 기준 분"으로 환산한다.
 * 어제에서 넘어온 블록은 음수가 된다(어제 23:00 → -60).
 * 이렇게 맞춰놔야 어제 블록과 오늘 블록을 같은 자로 비교할 수 있다.
 */
function startMinutesFromToday(block: WidgetBlock): number {
  return toMinutes(block.start) - (block.fromYesterday ? MINUTES_PER_DAY : 0);
}

/**
 * 지금 진행 중인 블록 하나를 고른다. 없으면 null.
 *
 * 겹치는 블록이 있으면 **가장 늦게 시작한 것**을 고른다.
 * (09~18 "근무" 안에 13~14 "점심" 이 들어 있으면, 13:30 에 하는 일은 점심이다.
 *  예전에는 배열에서 먼저 나오는 걸 집어서, 블록을 추가한 순서에 따라 답이 달라졌다)
 *
 * @param nowMin 오늘 0시 기준 현재 분
 */
export function pickCurrentBlock(
  blocks: WidgetBlock[],
  nowMin: number
): WidgetBlock | null {
  const running = blocks.filter((b) =>
    // 어제 블록은 어제 시간축으로 되돌려서 본다. (오늘 00:30 = 어제 24:30)
    isNowInBlock(
      b.fromYesterday ? nowMin + MINUTES_PER_DAY : nowMin,
      b.start,
      b.end
    )
  );

  if (running.length === 0) return null;
  return running.reduce((latest, b) =>
    startMinutesFromToday(b) > startMinutesFromToday(latest) ? b : latest
  );
}

/**
 * 아직 시작하지 않은 블록을 시작이 빠른 순으로 고른다.
 * 어제에서 넘어온 블록은 이미 시작한 것이므로 절대 들어가면 안 된다
 * (그냥 두면 "23:00 야간작업" 이 새벽 0시의 *다음* 일정으로 올라온다).
 */
export function pickUpcomingBlocks(
  blocks: WidgetBlock[],
  nowMin: number,
  count: number
): WidgetBlock[] {
  return blocks
    .filter((b) => !b.fromYesterday && toMinutes(b.start) > nowMin)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    .slice(0, count);
}
