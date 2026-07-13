/*
 * 시간 계산 관련 순수 함수 모음.
 * - UI와 분리해두면 테스트하기 쉽고, 자정을 넘기는 블록 처리 로직을 한 곳에서 관리할 수 있다.
 */

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
