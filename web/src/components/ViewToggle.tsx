/*
 * 차트형 ↔ 그래프형 전환 토글.
 * - 두 개짜리 세그먼트 컨트롤. 어떤 뷰가 켜져 있는지 항상 보이게 해서
 *   사용자가 "지금 뭘 보고 있는지" 헷갈리지 않도록 했다.
 */
import type { ViewMode } from "../types";

interface Props {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ value, onChange }: Props) {
  return (
    <div className="view-toggle" role="group" aria-label="보기 방식">
      <button
        className={"view-toggle-btn" + (value === "chart" ? " active" : "")}
        onClick={() => onChange("chart")}
        aria-pressed={value === "chart"}
      >
        목록
      </button>
      <button
        className={"view-toggle-btn" + (value === "graph" ? " active" : "")}
        onClick={() => onChange("graph")}
        aria-pressed={value === "graph"}
      >
        시간표
      </button>
    </div>
  );
}
