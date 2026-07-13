/*
 * 시간 계산 관련 순수 함수 모음.
 * - UI와 분리해두면 테스트하기 쉽고, 자정을 넘기는 블록 처리 로직을 한 곳에서 관리할 수 있다.
 */
import type { DayPlan } from "../types";

// "HH:MM" 문자열을 "0시 기준 분(minute)"으로 변환. 예: "16:30" -> 990
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  // 잘못된 입력 방어: 숫자가 아니면 0으로 처리해 앱이 죽지 않게 한다.
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

// 분 단위를 다시 "HH:MM" 로 변환. 24:00 이상(자정 넘김)은 그대로 표기.
export function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// "07:30–16:00" 형태의 라벨을 만들어준다. 24:00 이상은 자정 넘김 표기(00:30)로 바꿔 보여준다.
export function formatRange(start: string, end: string): string {
  const prettyEnd =
    toMinutes(end) >= 24 * 60 ? toHHMM(toMinutes(end) - 24 * 60) : end;
  return `${start}–${prettyEnd}`;
}

// 지금 시각(nowMin, 분 단위)이 [start, end) 블록 안에 들어오는지 판단.
// end 가 start 보다 작거나 같으면 자정을 넘긴 것으로 보고 +24시간 처리한다.
export function isNowInBlock(nowMin: number, start: string, end: string): boolean {
  const s = toMinutes(start);
  const e = toMinutes(end) <= s ? toMinutes(end) + 1440 : toMinutes(end);
  return nowMin >= s && nowMin < e;
}

// JS 의 getDay()(0=일)를 우리 배열 기준(0=월 ... 6=일)으로 변환.
export function jsDayToMondayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

// 시작 시각에서 1시간 뒤를 "HH:MM"으로 돌려준다. (블록의 기본 종료 시각 계산용)
export function oneHourLater(start: string): string {
  return toHHMM(toMinutes(start) + 60);
}

// 블록의 "펼친 종료 시각"(분). 자정을 넘긴 블록(종료 <= 시작)은 +24시간 해서
// 항상 시작보다 큰 값이 되게 만든다. 그래프 뷰에서 높이를 계산하려면 필수.
export function expandedEndMinutes(start: string, end: string): number {
  const s = toMinutes(start);
  const e = toMinutes(end);
  return e <= s ? e + 1440 : e;
}

// 그래프(주간 그리드) 뷰에서 세로축으로 그릴 시간 범위.
export interface GridRange {
  startMin: number; // 그리드 맨 위 시각(분). 정시(00분)에 맞춰져 있다.
  endMin: number;   // 그리드 맨 아래 시각(분). 자정 넘김 때문에 1440을 넘을 수 있다.
}

const DEFAULT_RANGE: GridRange = { startMin: 9 * 60, endMin: 18 * 60 };
const MIN_SPAN_MIN = 4 * 60; // 블록이 몇 개 없어도 그리드가 너무 납작해지지 않게 최소 4시간 확보
// 블록 위아래로 남겨두는 여백. 이게 없으면 맨 위/맨 아래 블록이 그리드 끝에 딱 붙어
// 드래그로 더 이르게/늦게 옮길 자리가 아예 없어진다.
const PAD_MIN = 60;

/*
 * 일주일 전체 블록을 훑어서 그래프 뷰의 시간 범위를 정한다.
 * 00~24시를 항상 그리면 새벽 시간대가 텅 비어 낭비되므로,
 * 실제 블록이 존재하는 구간(가장 이른 시작 ~ 가장 늦은 종료)에만 맞춘다.
 */
export function computeGridRange(days: DayPlan[]): GridRange {
  let min = Infinity;
  let max = -Infinity;

  for (const day of days) {
    for (const block of day.blocks) {
      min = Math.min(min, toMinutes(block.start));
      max = Math.max(max, expandedEndMinutes(block.start, block.end));
    }
  }

  // 블록이 하나도 없는 프리셋이면 무난한 기본 범위(09~18시)를 보여준다.
  if (min === Infinity) return DEFAULT_RANGE;

  // 시각 눈금이 정시에 떨어지도록 위/아래를 각각 정시로 내림/올림하고, 여백을 붙인다.
  const startMin = Math.max(0, Math.floor(min / 60) * 60 - PAD_MIN);
  let endMin = Math.ceil(max / 60) * 60 + PAD_MIN;

  // 자정을 넘기는 블록이 없다면 24시를 넘겨 그릴 이유가 없다.
  if (max <= 24 * 60) endMin = Math.min(endMin, 24 * 60);
  if (endMin - startMin < MIN_SPAN_MIN) endMin = startMin + MIN_SPAN_MIN;

  return { startMin, endMin };
}
