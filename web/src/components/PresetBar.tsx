/*
 * 프리셋 선택 줄. (방학 / 학기중 / 휴가 ... + 새 프리셋 추가 버튼)
 * - 프리셋을 클릭하면 해당 시간표로 전환한다.
 */
import type { Preset } from "../types";

interface Props {
  presets: Preset[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

export function PresetBar({ presets, selectedId, onSelect, onAdd }: Props) {
  return (
    <div className="preset-bar">
      {presets.map((p) => (
        <button
          key={p.id}
          className={"preset-chip" + (p.id === selectedId ? " active" : "")}
          onClick={() => onSelect(p.id)}
        >
          {p.label}
        </button>
      ))}
      {/* 새 프리셋 만들기 */}
      <button className="preset-chip add" onClick={onAdd} title="새 프리셋 추가">
        + 프리셋
      </button>
    </div>
  );
}
