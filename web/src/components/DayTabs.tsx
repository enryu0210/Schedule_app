/*
 * 요일 탭 (월~일). 오늘 요일에는 점(dot)을 찍어 표시한다.
 */
import type { DayPlan } from "../types";

interface Props {
  days: DayPlan[];
  selectedIdx: number;
  todayIdx: number;
  onSelect: (idx: number) => void;
}

export function DayTabs({ days, selectedIdx, todayIdx, onSelect }: Props) {
  return (
    <div className="tabs">
      {days.map((d, i) => (
        <button
          key={d.name}
          className={"tab" + (i === selectedIdx ? " active" : "")}
          onClick={() => onSelect(i)}
        >
          {/* 요일 이름의 첫 글자만 표시 (월, 화, ...) */}
          {d.name.slice(0, 1)}
          {i === todayIdx && <span className="dot" />}
        </button>
      ))}
    </div>
  );
}
