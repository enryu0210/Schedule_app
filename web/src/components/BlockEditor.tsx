/*
 * 블록 추가/편집 모달.
 * - 시작/종료 시각, 할 일 이름, 색상을 입력받는다.
 * - 저장 전 간단한 유효성 검사를 해 잘못된 시간 입력을 막는다.
 */
import { useState } from "react";
import type { BlockColor, ScheduleBlock } from "../types";
import { oneHourLater, toMinutes } from "../lib/time";
import { createId } from "../lib/id";

const COLORS: BlockColor[] = ["neutral", "gray", "purple", "teal", "coral", "pink"];

interface Props {
  // 편집 대상 블록. 새로 추가하는 경우 null.
  initial: ScheduleBlock | null;
  // 새로 추가할 때 미리 채워둘 시작 시각. (그래프 뷰에서 빈 칸을 눌러 들어온 경우)
  defaultStart?: string;
  onSave: (block: ScheduleBlock) => void;
  onCancel: () => void;
}

export function BlockEditor({ initial, defaultStart, onSave, onCancel }: Props) {
  const start0 = initial?.start ?? defaultStart ?? "09:00";
  const [start, setStart] = useState(start0);
  const [end, setEnd] = useState(initial?.end ?? oneHourLater(start0));
  const [label, setLabel] = useState(initial?.label ?? "");
  const [color, setColor] = useState<BlockColor>(initial?.color ?? "neutral");
  const [error, setError] = useState("");

  function handleSave() {
    // 유효성 검사: 이름이 비었거나, 종료가 시작보다 빠르면(자정 넘김 제외) 막는다.
    if (!label.trim()) {
      setError("할 일 이름을 입력해주세요.");
      return;
    }
    // 종료가 시작보다 작으면 자정 넘김으로 간주하되, 완전히 같은 시각은 막는다.
    if (toMinutes(end) === toMinutes(start)) {
      setError("시작과 종료 시각이 같을 수 없습니다.");
      return;
    }

    onSave({
      id: initial?.id ?? createId(),
      start,
      end,
      label: label.trim(),
      color,
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      {/* 모달 내부 클릭은 닫힘 방지 */}
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? "블록 편집" : "블록 추가"}</h2>

        <div className="field">
          <label>시간</label>
          <div className="time-inputs">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            <span>~</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>할 일</label>
          <input
            type="text"
            value={label}
            placeholder="예: 논문준비"
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
        </div>

        <div className="field">
          <label>색상</label>
          <div className="color-picker">
            {COLORS.map((c) => (
              <button
                key={c}
                className={"color-swatch " + c + (c === color ? " selected" : "")}
                onClick={() => setColor(c)}
                title={c}
              />
            ))}
          </div>
        </div>

        {error && <div style={{ color: "#b3261e", fontSize: 12, marginTop: 4 }}>{error}</div>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>취소</button>
          <button className="btn primary" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  );
}
