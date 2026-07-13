/*
 * 선택된 요일의 시간표 카드.
 * - 각 블록을 한 줄로 렌더링하고, 지금 시각에 해당하는 블록에 "지금" 하이라이트를 준다.
 * - 편집 모드가 따로 없다(상시 편집): 블록을 누르면 바로 편집 모달이 열리고,
 *   삭제(×)는 항상 노출(데스크톱은 hover 시 진해짐)되며 누르면 확인 후 삭제된다.
 * - 카드 맨 아래 "빠른 추가" 한 줄로 시간·이름만 넣어 즉시 블록을 만들 수 있다.
 */
import type { DayPlan, ScheduleBlock } from "../types";
import { formatRange, isNowInBlock, toMinutes } from "../lib/time";
import { QuickAddRow } from "./QuickAddRow";

interface Props {
  day: DayPlan;
  dayId: string;       // 프리셋+요일을 구분하는 키 (빠른 추가 행 리셋용)
  isToday: boolean;    // 이 요일이 오늘인가 (하이라이트 대상 여부)
  nowMin: number;      // 현재 시각(분)
  onEditBlock: (block: ScheduleBlock) => void;
  onDeleteBlock: (blockId: string) => void;
  onQuickAdd: (start: string, label: string) => void;
}

export function ScheduleCard({
  day,
  dayId,
  isToday,
  nowMin,
  onEditBlock,
  onDeleteBlock,
  onQuickAdd,
}: Props) {
  // 빠른 추가 행의 시작 시각 기본값 = 직전(마지막) 블록의 끝 시각.
  // 없으면(빈 요일) 09:00, 자정을 넘긴 시각(24:00 이상)이면 다시 09:00 으로 되돌린다.
  const lastEnd = day.blocks.length ? day.blocks[day.blocks.length - 1].end : "09:00";
  const defaultStart = toMinutes(lastEnd) >= 24 * 60 ? "09:00" : lastEnd;

  return (
    <div className="card">
      <div className="card-head">
        <span className="day">{day.name}</span>
        <span className="tag">{day.tag}</span>
      </div>
      <div className="divider" />

      {day.blocks.length === 0 && (
        <div className="empty-hint">아직 블록이 없어요. 아래에서 바로 추가해보세요.</div>
      )}

      {day.blocks.map((b) => {
        // 오늘이면서 현재 시각이 블록 범위 안에 있으면 "지금"으로 표시.
        const isNow = isToday && isNowInBlock(nowMin, b.start, b.end);
        return (
          <div key={b.id} className={"row editable" + (isNow ? " now" : "")}>
            <span className="time">{formatRange(b.start, b.end)}</span>
            <span className={"pill " + b.color} onClick={() => onEditBlock(b)}>
              {b.label}
              {isNow && <span className="now-badge">지금</span>}
            </span>
            <button className="del-btn" title="삭제" onClick={() => onDeleteBlock(b.id)}>
              ×
            </button>
          </div>
        );
      })}

      {/* 빠른 추가: 블록이 추가될 때마다 key 가 바뀌어 시작 시각이 자동 갱신된다 */}
      <QuickAddRow
        key={`${dayId}:${day.blocks.length}`}
        defaultStart={defaultStart}
        onAdd={onQuickAdd}
      />
    </div>
  );
}
