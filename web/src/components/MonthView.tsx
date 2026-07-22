/*
 * 달(월) 뷰 — 구글 캘린더에서 가져온 '날짜에 못박힌' 일정을 달력 모양으로 보여준다.
 *
 * 주간 시간표(Planner)와 일부러 분리한다. 캘린더 일정은 반복이 아니라 특정 날짜에 붙기 때문이다.
 * 이 컴포넌트는 '화면'만 담당한다 — 데이터를 어디서 가져오는지(구글/서버)는 상위가 정한다.
 * 그래서 로그인·서버 없이도 목(mock) 데이터만 넣어 눈으로 확인할 수 있다(?preview=month).
 */
import { useState } from "react";
import type { CalendarSchedule } from "../types";
import {
  buildMonthGrid,
  currentMonth,
  formatMonthTitle,
  groupEventsByDate,
  shiftMonth,
} from "../lib/monthGrid";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
// 한 칸(하루)에 몇 개까지 이벤트를 보여줄지. 넘치면 "+N" 으로 접는다.
const MAX_CHIPS = 3;

interface Props {
  // 가져온 캘린더 일정. 아직 없거나 로딩 중이면 null.
  schedule: CalendarSchedule | null;
  // 구글 캘린더를 연결한 상태인가. false 면 격자 대신 '연결' 안내를 강조한다.
  connected: boolean;
  // 지금 서버가 동기화 중인가 (배지에 "동기화 중…" 표시)
  syncing?: boolean;
  // "구글 캘린더 연결" 버튼을 눌렀을 때.
  onConnectGoogle: () => void;
  // "지금 새로고침" 버튼(선택). 없으면 버튼을 숨긴다.
  onSyncNow?: () => void;
}

// 마지막 동기화가 언제였는지 짧게. ("방금 전" / "12분 전" / "3시간 전" / "7/20")
function formatSyncedAt(ms: number): string {
  const diffMin = Math.floor((Date.now() - ms) / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function MonthView({
  schedule,
  connected,
  syncing = false,
  onConnectGoogle,
  onSyncNow,
}: Props) {
  const [month, setMonth] = useState<string>(() => currentMonth());

  const weeks = buildMonthGrid(month);
  const byDate = groupEventsByDate(schedule?.events ?? []);

  return (
    <section className="month">
      <header className="month-head">
        <div className="month-nav">
          <button
            type="button"
            className="month-arrow"
            aria-label="이전 달"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            ‹
          </button>
          <h2 className="month-title">{formatMonthTitle(month)}</h2>
          <button
            type="button"
            className="month-arrow"
            aria-label="다음 달"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            ›
          </button>
          {/* 이번 달로 빠르게 돌아오기 */}
          <button
            type="button"
            className="month-today-btn"
            onClick={() => setMonth(currentMonth())}
          >
            오늘
          </button>
        </div>

        <div className="month-actions">
          {connected ? (
            <span className="month-sync">
              {syncing
                ? "동기화 중…"
                : schedule
                ? `${formatSyncedAt(schedule.syncedAt)} 동기화`
                : "동기화 대기"}
              {onSyncNow && (
                <button
                  type="button"
                  className="month-refresh"
                  onClick={onSyncNow}
                  disabled={syncing}
                >
                  새로고침
                </button>
              )}
            </span>
          ) : (
            <button
              type="button"
              className="month-connect"
              onClick={onConnectGoogle}
            >
              📅 구글 캘린더 연결
            </button>
          )}
        </div>
      </header>

      {/* 요일 머리글 (월~일). 주말은 색을 죽인다. */}
      <div className="month-weekdays">
        {WEEKDAYS.map((w, i) => (
          <span
            key={w}
            className={`month-weekday${i >= 5 ? " month-weekday--weekend" : ""}`}
          >
            {w}
          </span>
        ))}
      </div>

      {/* 날짜 격자 */}
      <div className="month-grid">
        {weeks.map((week, wi) => (
          <div className="month-week" key={wi}>
            {week.map((cell) => {
              const events = byDate[cell.date] ?? [];
              const shown = events.slice(0, MAX_CHIPS);
              const hidden = events.length - shown.length;
              return (
                <div
                  key={cell.date}
                  className={
                    "month-cell" +
                    (cell.inMonth ? "" : " month-cell--muted") +
                    (cell.isToday ? " month-cell--today" : "") +
                    (cell.weekend ? " month-cell--weekend" : "")
                  }
                >
                  <span className="month-daynum">{cell.day}</span>
                  <div className="month-events">
                    {shown.map((ev) => (
                      <span
                        key={ev.id}
                        className="month-event"
                        title={`${ev.allDay ? "종일" : `${ev.start}–${ev.end}`} · ${ev.label}`}
                      >
                        {!ev.allDay && (
                          <span className="month-event-time">{ev.start}</span>
                        )}
                        <span className="month-event-label">{ev.label}</span>
                      </span>
                    ))}
                    {hidden > 0 && <span className="month-more">+{hidden}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 아직 연결 전이면, 이 뷰가 무엇을 채울 자리인지 알려준다. */}
      {!connected && (
        <p className="month-hint">
          구글 캘린더를 연결하면 등록한 일정이 이 달력에 자동으로 채워집니다.
        </p>
      )}
    </section>
  );
}
