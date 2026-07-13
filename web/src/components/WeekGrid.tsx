/*
 * 그래프형(에브리타임식) 주간 시간표.
 * - 세로축 = 시간, 가로축 = 요일 7개. 일주일 전체를 한 화면에서 본다.
 * - 세로 시간 범위는 프리셋에 실제로 들어있는 블록에 맞춰 자동으로 잡는다(computeGridRange).
 *   00~24시를 늘 그리면 새벽이 텅 비어 블록이 납작해지기 때문이다.
 * - 블록을 누르면 편집, 빈 칸을 누르면 그 시각으로 새 블록 추가가 열린다.
 */
import type { DayPlan, ScheduleBlock } from "../types";
import {
  computeGridRange,
  expandedEndMinutes,
  toHHMM,
  toMinutes,
} from "../lib/time";

// 1시간이 차지하는 세로 픽셀. CSS 변수로 넘겨 모바일에서 줄일 수 있게 했다.
const HOUR_HEIGHT = 52;
// 빈 칸을 눌러 추가할 때 시각을 몇 분 단위로 맞출지(스냅).
const SNAP_MIN = 30;

interface Props {
  days: DayPlan[];
  todayIdx: number; // 오늘 요일 (0=월 … 6=일)
  nowMin: number;   // 현재 시각(분)
  onEditBlock: (dayIdx: number, block: ScheduleBlock) => void;
  onAddBlockAt: (dayIdx: number, start: string) => void;
}

export function WeekGrid({ days, todayIdx, nowMin, onEditBlock, onAddBlockAt }: Props) {
  const { startMin, endMin } = computeGridRange(days);
  const spanMin = endMin - startMin;
  const gridHeight = (spanMin / 60) * HOUR_HEIGHT;

  // 세로축에 그릴 정시 눈금들 (예: 9, 10, 11 …). 맨 아래 끝 시각은 라벨을 생략한다.
  const hourMarks: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hourMarks.push(m);

  // 그리드 안에서 특정 시각(분)이 위에서 몇 % 지점인지.
  const toTopPercent = (minute: number) => ((minute - startMin) / spanMin) * 100;

  // "지금" 가로선 위치. 그리드가 자정을 넘겨 이어지는 경우(예: 22시~26시)에는
  // 새벽 시각(예: 01:00 = 60분)을 +24시간 한 값으로 봐야 범위 안에 들어온다.
  const nowCandidates = [nowMin, nowMin + 1440];
  const nowInRange = nowCandidates.find((m) => m >= startMin && m <= endMin);

  return (
    <div className="week-grid" style={{ ["--hour-h" as string]: `${HOUR_HEIGHT}px` }}>
      {/* 헤더: 왼쪽 시간 칸은 비우고, 요일 7개를 나열 */}
      <div className="wg-corner" />
      {days.map((day, i) => (
        <div key={day.name} className={"wg-head" + (i === todayIdx ? " today" : "")}>
          {day.name.replace("요일", "")}
        </div>
      ))}

      {/* 본문: 시간 눈금 + 요일별 열 */}
      <div className="wg-times" style={{ height: gridHeight }}>
        {hourMarks.map((m) => (
          <span key={m} className="wg-time-label" style={{ top: `${toTopPercent(m)}%` }}>
            {/* 24시를 넘어간 시각(자정 넘김)은 0~시로 되돌려 표기 */}
            {toHHMM(m % 1440).slice(0, 2)}시
          </span>
        ))}
      </div>

      {days.map((day, dayIdx) => (
        <div
          key={day.name}
          className={"wg-col" + (dayIdx === todayIdx ? " today" : "")}
          style={{ height: gridHeight }}
          onClick={(e) => {
            // 빈 칸 클릭 → 클릭 지점의 시각(30분 단위로 스냅)으로 새 블록 추가.
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientY - rect.top) / rect.height;
            const raw = startMin + ratio * spanMin;
            const snapped = Math.round(raw / SNAP_MIN) * SNAP_MIN;
            // 그리드 밖으로 튀어나가지 않게 범위 안으로 가둔다.
            const clamped = Math.min(Math.max(snapped, startMin), endMin - SNAP_MIN);
            onAddBlockAt(dayIdx, toHHMM(clamped % 1440));
          }}
        >
          {layoutBlocks(day.blocks).map(({ block, lane, laneCount }) => {
            const top = toTopPercent(toMinutes(block.start));
            const bottom = toTopPercent(expandedEndMinutes(block.start, block.end));
            return (
              <button
                key={block.id}
                className={"wg-block " + block.color}
                style={{
                  top: `${top}%`,
                  height: `${bottom - top}%`,
                  // 겹치는 블록은 나란히 반씩 나눠 차지한다.
                  left: `${(lane / laneCount) * 100}%`,
                  width: `${100 / laneCount}%`,
                }}
                onClick={(e) => {
                  e.stopPropagation(); // 열(빈 칸) 클릭으로 번지지 않게
                  onEditBlock(dayIdx, block);
                }}
                title={`${block.start}–${block.end} ${block.label}`}
              >
                <span className="wg-block-label">{block.label}</span>
              </button>
            );
          })}

          {/* 오늘 열에만 현재 시각 가로선 */}
          {dayIdx === todayIdx && nowInRange !== undefined && (
            <div className="wg-now-line" style={{ top: `${toTopPercent(nowInRange)}%` }} />
          )}
        </div>
      ))}
    </div>
  );
}

/*
 * 겹치는 블록을 나란히 배치하기 위한 "레인(세로 줄)" 계산.
 *
 * 핵심은 "겹치는 무리(cluster)"끼리만 폭을 나눈다는 것이다.
 * 하루 전체를 기준으로 레인 수를 세면, 아침에 딱 한 번 겹쳤다는 이유로
 * 저녁의 멀쩡한 블록까지 반쪽 너비가 되어 버린다.
 * 그래서 시간이 끊기는 지점(앞선 블록들이 모두 끝난 시점)에서 무리를 잘라
 * 그 무리 안의 최대 레인 수로만 폭을 나눈다.
 */
function layoutBlocks(blocks: ScheduleBlock[]) {
  const sorted = [...blocks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  const result: { block: ScheduleBlock; lane: number; laneCount: number }[] = [];
  let cluster: { block: ScheduleBlock; lane: number }[] = [];
  let laneEnds: number[] = []; // 현재 무리에서 각 레인이 몇 분까지 차 있는지
  let clusterEnd = -Infinity;  // 현재 무리에 속한 블록들의 가장 늦은 종료 시각

  // 현재까지 모은 무리를 확정해 결과에 옮긴다.
  function flushCluster() {
    const laneCount = Math.max(1, laneEnds.length);
    for (const item of cluster) result.push({ ...item, laneCount });
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  }

  for (const block of sorted) {
    const start = toMinutes(block.start);
    const end = expandedEndMinutes(block.start, block.end);

    // 앞선 무리가 이미 다 끝난 뒤에 시작하는 블록이면, 그 무리와는 무관하므로 끊는다.
    if (start >= clusterEnd) flushCluster();

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) lane = laneEnds.length; // 빈 레인이 없으면 새 레인을 연다
    laneEnds[lane] = end;

    cluster.push({ block, lane });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flushCluster();

  return result;
}
