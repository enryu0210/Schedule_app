/*
 * 위젯 "환기" 트리거 훅.
 *
 * 두 순간에만 사용자의 주의를 끈다:
 *   1) 진행 중인 일정이 바뀔 때 (블록이 시작되거나 끝날 때)
 *   2) 정시(매시 00분)가 지날 때 — 진행 중인 일정이 없어도 뜬다.
 *      (처음엔 '일정이 있을 때만' 이었다. 빈 시간에 배너가 성가실까 봐 막아뒀는데,
 *       오히려 일정이 비어 있을 때가 시간 가는 줄 모르는 때라 매시 알리는 쪽으로 바꿨다)
 *
 * 왜 훅으로 빼는가:
 *   화면을 그리는 WidgetBody 는 "지금 무엇을 보여줄까"에만 집중하게 두고,
 *   "언제 주의를 끌까"라는 시간에 얽힌 판단은 여기 한곳에 모은다.
 *
 * 위젯을 처음 열었을 때는 울리지 않는다 — 여는 순간 배너가 튀어나오면 놀란다.
 * 오직 '상태가 바뀌는' 순간에만 반응한다.
 */
import { useEffect, useRef, useState } from "react";

/** 환기 배너를 왜 띄웠는지. 'block'=일정이 바뀜, 'hour'=정시가 지남 */
export type AttentionReason = "block" | "hour";

export interface Attention {
  reason: AttentionReason;
  /**
   * 트리거될 때마다 1씩 증가한다.
   * 같은 배너를 다시 띄울 때 CSS 애니메이션을 처음부터 재생시키는 열쇠(React key)로 쓴다.
   */
  nonce: number;
}

/** 진행 중인 일정이 없을 때 currentKey 에 넣는 표식. (실제 블록 id 와 겹치지 않는 값) */
export const IDLE_KEY = "idle";

/** 배너가 화면에 머무는 시간(ms). 너무 길면 일정을 가리고, 너무 짧으면 놓친다. */
const VISIBLE_MS = 6000;

export interface UseScheduleAttentionResult {
  /** 지금 띄워야 할 환기 정보. 없으면 null */
  attention: Attention | null;
  /** 배너를 눌러 즉시 닫을 때 부른다. */
  dismiss: () => void;
}

/**
 * @param currentKey 진행 중인 블록의 id. 진행 중인 일정이 없으면 IDLE_KEY.
 * @param hour       현재 '시'(0~23). 정시가 지났는지는 이 값의 변화로 안다.
 */
export function useScheduleAttention(
  currentKey: string,
  hour: number
): UseScheduleAttentionResult {
  const [attention, setAttention] = useState<Attention | null>(null);

  // 직전 값 기억. 첫 렌더를 '변화'로 오해하지 않으려고 ref 로 들고 있는다.
  const prevKey = useRef(currentKey);
  const prevHour = useRef(hour);
  const initialized = useRef(false);
  const nonce = useRef(0);
  const timerId = useRef<number | null>(null);

  useEffect(() => {
    // 첫 렌더: 기준값만 잡고 아무것도 울리지 않는다.
    if (!initialized.current) {
      initialized.current = true;
      prevKey.current = currentKey;
      prevHour.current = hour;
      return;
    }

    const keyChanged = currentKey !== prevKey.current;
    const hourChanged = hour !== prevHour.current;

    // 무엇을 띄울지 결정. 일정 변화가 더 구체적이므로 우선한다.
    // (블록이 정각에 시작하면 키와 시(hour)가 동시에 바뀌는데, 이때는 'block' 하나만 띄운다)
    let reason: AttentionReason | null = null;
    if (keyChanged) reason = "block";
    else if (hourChanged) reason = "hour";

    if (reason) {
      nonce.current += 1;
      setAttention({ reason, nonce: nonce.current });
      // 이전 타이머를 지우고 새로 건다 → 배너가 항상 마지막 트리거로부터 VISIBLE_MS 만큼 유지된다.
      if (timerId.current) window.clearTimeout(timerId.current);
      timerId.current = window.setTimeout(() => setAttention(null), VISIBLE_MS);
    }

    prevKey.current = currentKey;
    prevHour.current = hour;
  }, [currentKey, hour]);

  // 언마운트 시 타이머 정리 (메모리 누수 방지)
  useEffect(() => {
    return () => {
      if (timerId.current) window.clearTimeout(timerId.current);
    };
  }, []);

  function dismiss() {
    if (timerId.current) window.clearTimeout(timerId.current);
    setAttention(null);
  }

  return { attention, dismiss };
}
