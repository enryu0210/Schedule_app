/*
 * 카드 맨 아래에 상시 노출되는 "빠른 추가" 한 줄.
 * - 시작 시각 + 할 일 이름만 입력하면 바로 블록이 추가된다.
 *   (종료 시각은 시작 +1시간, 색상은 기본값으로 자동 지정 → 최소 입력으로 빠르게)
 * - 세부 조정(종료 시각·색상)은 추가된 블록을 눌러 편집 모달에서 하면 된다.
 *
 * 참고: 이 컴포넌트는 부모에서 key 를 주어 블록이 추가될 때마다 새로 마운트된다.
 *       그래서 defaultStart(직전 블록의 끝 시각)가 매번 자동으로 반영된다.
 */
import { useState } from "react";
import { toMinutes, toHHMM } from "../lib/time";

interface Props {
  defaultStart: string; // 시작 시각 초기값 (보통 직전 블록의 끝 시각)
  onAdd: (start: string, label: string) => void;
}

export function QuickAddRow({ defaultStart, onAdd }: Props) {
  const [start, setStart] = useState(defaultStart);
  const [label, setLabel] = useState("");

  function submit() {
    const trimmed = label.trim();
    if (!trimmed) return; // 이름이 비어 있으면 추가하지 않는다
    onAdd(start, trimmed);
    setLabel(""); // 다음 입력을 위해 이름만 비운다 (start 는 remount 시 갱신됨)
  }

  return (
    <div className="quick-add">
      <input
        type="time"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        aria-label="시작 시각"
      />
      <input
        type="text"
        value={label}
        placeholder="할 일 빠르게 추가"
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        aria-label="할 일 이름"
      />
      <button className="add-btn" onClick={submit} title="추가" aria-label="추가">
        +
      </button>
    </div>
  );
}

// 시작 시각에서 1시간 뒤를 "HH:MM"으로 돌려주는 헬퍼. (기본 종료 시각 계산용)
export function oneHourLater(start: string): string {
  return toHHMM(toMinutes(start) + 60);
}
