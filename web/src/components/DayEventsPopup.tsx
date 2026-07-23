/*
 * 날짜별 일정 팝업 — 달력에서 하루를 누르면 그날 일정을 전부(칸에서 접힌 것까지) 보여준다.
 *
 * 달력 칸은 좁아 3개까지만 보이고 나머지는 "+N" 으로 접힌다.
 * 그래서 하루를 눌러 그날 일정을 온전히 펼쳐 보는 이 팝업이 필요하다.
 * BlockDetail 과 같은 modal 패턴(배경 클릭으로 닫힘)을 쓴다.
 */
import type { CalendarEvent } from "../types";
import { formatDayTitle } from "../lib/monthGrid";

interface Props {
  date: string;            // "YYYY-MM-DD"
  events: CalendarEvent[]; // 그날 일정(종일 먼저, 그다음 시각순 — 부르는 쪽이 정렬해 넘긴다)
  onClose: () => void;
}

export function DayEventsPopup({ date, events, onClose }: Props) {
  return (
    // 배경을 누르면 닫는다. 안쪽 클릭은 stopPropagation 으로 닫히지 않게.
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="day-popup-title">{formatDayTitle(date)}</h2>

        {events.length === 0 ? (
          <p className="day-popup-empty">등록된 일정이 없어요.</p>
        ) : (
          <ul className="day-popup-list">
            {events.map((ev) => (
              <li key={ev.id} className="day-popup-item">
                <span className="day-popup-time">
                  {ev.allDay ? "종일" : `${ev.start}–${ev.end}`}
                </span>
                <span className="day-popup-label">{ev.label}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
