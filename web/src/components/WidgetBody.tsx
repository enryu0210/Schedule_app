/*
 * 위젯의 "화면" 부분 (순수 컴포넌트).
 *
 * 로그인/데이터 로딩은 WidgetView 가 맡고, 여기서는 받은 블록만 그린다.
 * 이렇게 나눠두면 로그인 게이트 없이도 이 컴포넌트만 따로 띄워 눈으로 확인할 수 있다.
 */
import { formatRange, isNowInBlock, toMinutes } from "../lib/time";
import type { ScheduleBlock } from "../types";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
// 다음 일정을 몇 개까지 보여줄지. 창이 작으므로 2개가 한계다.
const UPCOMING_COUNT = 2;

interface Props {
  todayIdx: number;          // 0=월 ... 6=일
  nowMin: number;            // 0시 기준 현재 분
  blocks: ScheduleBlock[];   // 오늘의 블록들
}

export function WidgetBody({ todayIdx, nowMin, blocks }: Props) {
  const current = blocks.find((b) => isNowInBlock(nowMin, b.start, b.end)) ?? null;

  // "다음 일정" = 아직 시작하지 않은 블록. 시작 시각이 빠른 순으로 앞에서 몇 개만.
  const upcoming = blocks
    .filter((b) => toMinutes(b.start) > nowMin)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    .slice(0, UPCOMING_COUNT);

  const clock = `${String(Math.floor(nowMin / 60)).padStart(2, "0")}:${String(
    nowMin % 60
  ).padStart(2, "0")}`;

  return (
    <div className="widget">
      {/* 상단: 요일 + 현재 시각. Tauri 에서는 이 영역을 잡고 창을 옮긴다. */}
      <header className="widget-head" data-tauri-drag-region>
        <span className="widget-day">{WEEKDAYS[todayIdx]}요일</span>
        <span className="widget-clock">{clock}</span>
      </header>

      {current ? (
        <div className={`widget-now ${current.color}`}>
          <span className="widget-now-time">
            {formatRange(current.start, current.end)}
          </span>
          <strong className="widget-now-label">{current.label}</strong>
        </div>
      ) : (
        <div className="widget-now widget-now-idle">
          <strong className="widget-now-label">지금은 일정이 없어요</strong>
        </div>
      )}

      {upcoming.length > 0 && (
        <ul className="widget-next">
          {upcoming.map((block) => (
            <li key={block.id} className="widget-next-item">
              <span className={`widget-dot ${block.color}`} />
              <span className="widget-next-time">{block.start}</span>
              <span className="widget-next-label">{block.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
