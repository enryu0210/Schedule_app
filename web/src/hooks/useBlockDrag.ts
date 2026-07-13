/*
 * 그래프(주간 그리드) 뷰에서 블록을 드래그로 옮기거나 늘리는 로직.
 *
 * 왜 훅으로 뺐나: 포인터 좌표 → 시각 변환, 스냅, 경계 처리 같은 계산이 제법 길어서
 * WeekGrid 안에 두면 렌더링 코드와 뒤엉킨다. 여기서 상태만 만들어 넘겨준다.
 *
 * 마우스와 터치를 따로 다루지 않도록 Pointer Event 하나로 처리한다.
 */
import { useEffect, useRef, useState } from "react";
import type { ScheduleBlock } from "../types";
import { expandedEndMinutes, toHHMM, toMinutes } from "../lib/time";

// 드래그 중 시각을 몇 분 단위로 맞출지. 10분이면 미세 조정과 편안함의 절충점.
const SNAP_MIN = 10;
// 블록이 0분이 되어 사라지는 걸 막는 최소 길이.
const MIN_DURATION_MIN = 10;
// 이 픽셀 이상 움직여야 "드래그"로 본다. (손가락/마우스가 살짝 흔들려도 클릭은 클릭으로)
const DRAG_THRESHOLD_PX = 4;

export type DragMode = "move" | "resize-start" | "resize-end";

// 드래그 중 화면에 미리 보여줄 위치. (실제 데이터는 손을 뗄 때 한 번만 바꾼다)
export interface DragPreview {
  blockId: string;
  dayIdx: number;  // 옮겨갈 요일
  startMin: number;
  endMin: number;
}

interface Options {
  pxPerMin: number;                            // 세로 1분이 몇 픽셀인지
  rangeStart: number;                          // 그리드 위쪽 끝 시각(분)
  rangeEnd: number;                            // 그리드 아래쪽 끝 시각(분)
  dayIdxAtX: (clientX: number) => number | null; // 가로 좌표 → 요일 인덱스 (열 밖이면 null)
  onCommit: (
    fromDayIdx: number,
    blockId: string,
    toDayIdx: number,
    start: string,
    end: string
  ) => void;
}

// 드래그를 시작할 때 붙잡아 두는 값들.
interface DragState {
  blockId: string;
  fromDayIdx: number;
  mode: DragMode;
  pointerX: number;
  pointerY: number;
  origStart: number; // 분
  origEnd: number;   // 분 (자정 넘김은 펼친 값)
}

export function useBlockDrag({ pxPerMin, rangeStart, rangeEnd, dayIdxAtX, onCommit }: Options) {
  const [preview, setPreview] = useState<DragPreview | null>(null);

  const dragRef = useRef<DragState | null>(null);
  const previewRef = useRef<DragPreview | null>(null); // 손 뗄 때 최신값을 읽기 위한 사본
  const movedRef = useRef(false);                      // 실제로 움직였는가(= 클릭이 아닌가)
  const suppressClickRef = useRef(false);              // 드래그 직후 따라오는 click 을 한 번 무시

  // 옵션은 매 렌더 새로 만들어지므로 ref 에 담아 최신값을 리스너에서 읽는다.
  // (리스너를 매번 붙였다 뗐다 하지 않아도 되게)
  const optsRef = useRef({ pxPerMin, rangeStart, rangeEnd, dayIdxAtX, onCommit });
  optsRef.current = { pxPerMin, rangeStart, rangeEnd, dayIdxAtX, onCommit };

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const { pxPerMin, rangeStart, rangeEnd, dayIdxAtX } = optsRef.current;

      const dx = e.clientX - drag.pointerX;
      const dy = e.clientY - drag.pointerY;
      if (!movedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      movedRef.current = true;

      // 세로 이동량 → 분. 스냅 단위로 반올림한다.
      const deltaMin = Math.round(dy / pxPerMin / SNAP_MIN) * SNAP_MIN;

      let startMin = drag.origStart;
      let endMin = drag.origEnd;

      if (drag.mode === "move") {
        // 길이는 그대로 두고 통째로 이동. 그리드 밖으로 나가지 않게 가둔다.
        const duration = drag.origEnd - drag.origStart;
        startMin = clamp(drag.origStart + deltaMin, rangeStart, rangeEnd - duration);
        endMin = startMin + duration;
      } else if (drag.mode === "resize-start") {
        // 위쪽 손잡이: 시작만 움직이되 최소 길이는 남긴다.
        startMin = clamp(drag.origStart + deltaMin, rangeStart, drag.origEnd - MIN_DURATION_MIN);
      } else {
        // 아래쪽 손잡이: 종료만 움직인다.
        endMin = clamp(drag.origEnd + deltaMin, drag.origStart + MIN_DURATION_MIN, rangeEnd);
      }

      // 가로로 끌면 다른 요일로 옮긴다. (길이를 바꾸는 중일 땐 요일은 고정)
      const overDay = dayIdxAtX(e.clientX);
      const dayIdx =
        drag.mode === "move" && overDay !== null ? overDay : preview?.dayIdx ?? drag.fromDayIdx;

      const next: DragPreview = { blockId: drag.blockId, dayIdx, startMin, endMin };
      previewRef.current = next;
      setPreview(next);
    }

    function handleUp() {
      const drag = dragRef.current;
      const next = previewRef.current;
      dragRef.current = null;
      previewRef.current = null;
      setPreview(null);

      // 움직이지 않았다면 클릭(=편집 열기)이므로 데이터는 건드리지 않는다.
      if (!drag || !movedRef.current || !next) return;

      // 브라우저는 pointerup 직후 click 을 한 번 더 쏜다. 드래그였다면 그 click 이
      // 편집 모달을 열어버리므로 딱 한 번만 무시한다.
      // (setTimeout 0 은 click 이 처리된 뒤에 실행되므로 플래그를 안전하게 되돌린다)
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);

      onCommitSafely(drag, next);
    }

    function onCommitSafely(drag: DragState, next: DragPreview) {
      const { onCommit } = optsRef.current;
      // 자정을 넘겨 펼쳐둔 값(예: 1500분)을 다시 "HH:MM"(01:00)으로 되돌린다.
      onCommit(
        drag.fromDayIdx,
        drag.blockId,
        next.dayIdx,
        toHHMM(next.startMin % 1440),
        toHHMM(next.endMin % 1440)
      );
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
    // preview 는 요일 유지용으로만 읽으므로 의존성에 넣어 최신 클로저를 유지한다.
  }, [preview]);

  // 블록(또는 손잡이)에서 포인터를 누르면 호출한다.
  function beginDrag(
    e: React.PointerEvent,
    dayIdx: number,
    block: ScheduleBlock,
    mode: DragMode
  ) {
    e.stopPropagation(); // 빈 칸 클릭(추가)로 번지지 않게
    dragRef.current = {
      blockId: block.id,
      fromDayIdx: dayIdx,
      mode,
      pointerX: e.clientX,
      pointerY: e.clientY,
      origStart: toMinutes(block.start),
      origEnd: expandedEndMinutes(block.start, block.end),
    };
    movedRef.current = false;
  }

  // 방금 드래그가 끝났는지. true 면 뒤따라오는 click 을 무시해야 한다(편집 모달 방지).
  function shouldIgnoreClick() {
    return suppressClickRef.current;
  }

  return { preview, beginDrag, shouldIgnoreClick };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
