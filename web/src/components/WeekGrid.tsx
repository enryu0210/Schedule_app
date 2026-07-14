/*
 * 그래프형(에브리타임식) 주간 시간표.
 * - 세로축 = 시간, 가로축 = 요일 7개. 일주일 전체를 한 화면에서 본다.
 * - 세로 시간 범위는 프리셋에 실제로 들어있는 블록에 맞춰 자동으로 잡는다(computeGridRange).
 *   00~24시를 늘 그리면 새벽이 텅 비어 블록이 납작해지기 때문이다.
 * - 조작(편집 모드일 때만):
 *     블록 몸통 드래그  → 시간 이동 + 다른 요일로 이동
 *     블록 위/아래 손잡이 드래그 → 시작/종료 시각만 늘리고 줄이기
 *     블록 클릭        → 편집 모달
 *     빈 칸 클릭       → 그 시각으로 새 블록 추가
 * - 드래그 중에는 데이터를 건드리지 않고 "미리보기"만 그리다가, 손을 뗄 때 한 번 저장한다.
 *
 * - editable=false(기본)면 위 조작을 **전부** 막고 보기 전용이 된다.
 *   폰에서는 화면을 스크롤하려고 손가락을 대는 것만으로 블록이 끌려가 일정이 바뀌어 버렸다.
 *   "보다가 실수로 고쳐지는" 사고가 "고치려면 버튼 한 번 더 누르는" 번거로움보다 훨씬 나쁘다.
 */
import { useRef } from "react";
import type { DayPlan, ScheduleBlock } from "../types";
import { useBlockDrag, type DragPreview } from "../hooks/useBlockDrag";
import {
  computeGridRange,
  expandedEndMinutes,
  toHHMM,
  toMinutes,
} from "../lib/time";

// 1시간이 차지하는 세로 픽셀.
const HOUR_HEIGHT = 52;
const PX_PER_MIN = HOUR_HEIGHT / 60;
// 빈 칸을 눌러 추가할 때 시각을 몇 분 단위로 맞출지(스냅).
const SNAP_MIN = 30;

interface Props {
  days: DayPlan[];
  todayIdx: number; // 오늘 요일 (0=월 … 6=일)
  nowMin: number;   // 현재 시각(분)
  // 편집 모드 여부. false 면 보기 전용(드래그·추가·편집 모두 잠긴다).
  editable: boolean;
  onEditBlock: (dayIdx: number, block: ScheduleBlock) => void;
  onAddBlockAt: (dayIdx: number, start: string) => void;
  // 드래그로 블록을 옮기거나 길이를 바꿨을 때(요일이 바뀔 수도 있다).
  onMoveBlock: (
    fromDayIdx: number,
    blockId: string,
    toDayIdx: number,
    start: string,
    end: string
  ) => void;
}

export function WeekGrid({
  days,
  todayIdx,
  nowMin,
  editable,
  onEditBlock,
  onAddBlockAt,
  onMoveBlock,
}: Props) {
  // 시간 범위는 "원래 데이터"로만 계산한다. 드래그 미리보기까지 넣으면
  // 끌고 가는 동안 그리드 높이가 출렁여서 블록이 커서에서 떨어져 나간다.
  const { startMin, endMin } = computeGridRange(days);
  const spanMin = endMin - startMin;
  const gridHeight = spanMin * PX_PER_MIN;

  // 요일 열의 DOM. 가로 좌표가 어느 요일 위에 있는지 판단하는 데 쓴다.
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { preview, beginDrag, shouldIgnoreClick } = useBlockDrag({
    pxPerMin: PX_PER_MIN,
    rangeStart: startMin,
    rangeEnd: endMin,
    dayIdxAtX: (clientX) => {
      const idx = colRefs.current.findIndex((el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right;
      });
      return idx === -1 ? null : idx;
    },
    onCommit: onMoveBlock,
  });

  // 드래그 중이면 미리보기가 반영된 모습으로 그린다.
  const shownDays = preview ? applyPreview(days, preview) : days;

  // 세로축에 그릴 정시 눈금들 (맨 아래 끝 시각은 라벨을 생략한다).
  const hourMarks: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hourMarks.push(m);

  // 그리드 안에서 특정 시각(분)이 위에서 몇 % 지점인지.
  const toTopPercent = (minute: number) => ((minute - startMin) / spanMin) * 100;

  // "지금" 가로선 위치. 그리드가 자정을 넘겨 이어지는 경우(예: 22시~26시)에는
  // 새벽 시각(예: 01:00 = 60분)을 +24시간 한 값으로 봐야 범위 안에 들어온다.
  const nowInRange = [nowMin, nowMin + 1440].find((m) => m >= startMin && m <= endMin);

  return (
    <div
      className={"week-grid" + (editable ? " editable" : "")}
      style={{ ["--hour-h" as string]: `${HOUR_HEIGHT}px` }}
    >
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

      {shownDays.map((day, dayIdx) => (
        <div
          key={day.name}
          ref={(el) => { colRefs.current[dayIdx] = el; }}
          className={"wg-col" + (dayIdx === todayIdx ? " today" : "")}
          style={{ height: gridHeight }}
          onClick={(e) => {
            if (!editable) return; // 보기 전용 — 빈 칸을 눌러도 아무 일도 일어나지 않는다
            // 드래그가 막 끝난 직후의 click 은 무시한다(빈 칸 추가가 튀어나오지 않게).
            if (shouldIgnoreClick()) return;
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
            const blockStart = toMinutes(block.start);
            const blockEnd = expandedEndMinutes(block.start, block.end);
            const top = toTopPercent(blockStart);
            const bottom = toTopPercent(blockEnd);
            const isDragging = preview?.blockId === block.id;

            return (
              <div
                key={block.id}
                className={"wg-block " + block.color + (isDragging ? " dragging" : "")}
                style={{
                  top: `${top}%`,
                  height: `${bottom - top}%`,
                  // 겹치는 블록은 나란히 나눠 차지한다.
                  left: `${(lane / laneCount) * 100}%`,
                  width: `${100 / laneCount}%`,
                }}
                // 보기 전용일 때는 드래그를 시작조차 하지 않는다.
                // (여기서 막아야 화면 스크롤이 정상적으로 먹는다)
                onPointerDown={
                  editable ? (e) => beginDrag(e, dayIdx, block, "move") : undefined
                }
                onClick={(e) => {
                  e.stopPropagation(); // 열(빈 칸) 클릭으로 번지지 않게
                  if (!editable) return;
                  if (shouldIgnoreClick()) return; // 드래그였으면 편집을 열지 않는다
                  onEditBlock(dayIdx, block);
                }}
                // 드래그 때문에 button 이 아닌 div 로 그리므로, 키보드 조작은 직접 열어준다.
                role={editable ? "button" : undefined}
                tabIndex={editable ? 0 : undefined}
                onKeyDown={(e) => {
                  if (!editable) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEditBlock(dayIdx, block);
                  }
                }}
                title={`${block.start}–${block.end} ${block.label}`}
              >
                {/* 위/아래 손잡이: 길이만 조절한다 (편집 모드에서만 존재) */}
                {editable && (
                  <div
                    className="wg-handle top"
                    onPointerDown={(e) => beginDrag(e, dayIdx, block, "resize-start")}
                  />
                )}
                <span className="wg-block-label">{block.label}</span>
                {/* 드래그 중에는 지금 몇 시가 되는지 바로 보여준다 */}
                {isDragging && (
                  <span className="wg-block-time">
                    {toHHMM(blockStart % 1440)}–{toHHMM(blockEnd % 1440)}
                  </span>
                )}
                {editable && (
                  <div
                    className="wg-handle bottom"
                    onPointerDown={(e) => beginDrag(e, dayIdx, block, "resize-end")}
                  />
                )}
              </div>
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
 * 드래그 미리보기를 반영한 요일 배열을 만든다.
 * 끌고 있는 블록을 원래 요일에서 빼고, 옮겨갈 요일에 새 시각으로 끼워 넣는다.
 * (원본 데이터는 그대로 두고 화면만 바꾸기 위한 것)
 */
function applyPreview(days: DayPlan[], preview: DragPreview): DayPlan[] {
  const dragged = days
    .flatMap((day) => day.blocks)
    .find((b) => b.id === preview.blockId);
  if (!dragged) return days; // 방어: 못 찾으면 원본 그대로

  const moved: ScheduleBlock = {
    ...dragged,
    start: toHHMM(preview.startMin % 1440),
    end: toHHMM(preview.endMin % 1440),
  };

  return days.map((day, i) => {
    const rest = day.blocks.filter((b) => b.id !== preview.blockId);
    return { ...day, blocks: i === preview.dayIdx ? [...rest, moved] : rest };
  });
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
