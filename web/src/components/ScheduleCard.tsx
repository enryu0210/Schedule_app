/*
 * 선택된 요일의 시간표 카드.
 * - 각 블록을 한 줄로 렌더링하고, 지금 시각에 해당하는 블록에 "지금" 하이라이트를 준다.
 * - 편집 모드(editMode)일 때는 블록 클릭 시 편집, 삭제 버튼 노출.
 */
import type { DayPlan, ScheduleBlock } from "../types";
import { formatRange, isNowInBlock } from "../lib/time";

interface Props {
  day: DayPlan;
  isToday: boolean;    // 이 요일이 오늘인가 (하이라이트 대상 여부)
  nowMin: number;      // 현재 시각(분)
  editMode: boolean;
  onEditBlock: (block: ScheduleBlock) => void;
  onDeleteBlock: (blockId: string) => void;
}

export function ScheduleCard({ day, isToday, nowMin, editMode, onEditBlock, onDeleteBlock }: Props) {
  return (
    <div className="card">
      <div className="card-head">
        <span className="day">{day.name}</span>
        <span className="tag">{day.tag}</span>
      </div>
      <div className="divider" />

      {day.blocks.length === 0 && (
        <div className="empty-hint">아직 블록이 없습니다. 아래 “+ 블록 추가”로 시작하세요.</div>
      )}

      {day.blocks.map((b) => {
        // 오늘이면서 현재 시각이 블록 범위 안에 있으면 "지금"으로 표시.
        const isNow = isToday && isNowInBlock(nowMin, b.start, b.end);
        return (
          <div key={b.id} className={"row" + (isNow ? " now" : "") + (editMode ? " editable" : "")}>
            <span className="time">{formatRange(b.start, b.end)}</span>
            <span
              className={"pill " + b.color}
              onClick={editMode ? () => onEditBlock(b) : undefined}
            >
              {b.label}
              {isNow && <span className="now-badge">지금</span>}
            </span>
            {editMode && (
              <button className="del-btn" title="삭제" onClick={() => onDeleteBlock(b.id)}>
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
