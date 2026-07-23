/*
 * 위젯의 "화면" 부분 (순수 컴포넌트).
 *
 * 로그인/데이터 로딩은 WidgetView 가 맡고, 여기서는 받은 블록만 그린다.
 * 이렇게 나눠두면 로그인 게이트 없이도 이 컴포넌트만 따로 띄워 눈으로 확인할 수 있다.
 */
import { formatRange } from "../lib/time";
import {
  pickCurrentBlock,
  pickUpcomingBlocks,
  type WidgetBlock,
} from "../lib/widgetBlocks";
import {
  IDLE_KEY,
  useScheduleAttention,
  type AttentionReason,
} from "../hooks/useScheduleAttention";
import type { ScheduleBlock } from "../types";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
// 다음 일정을 몇 개까지 보여줄지. 창이 작으므로 2개가 한계다.
const UPCOMING_COUNT = 2;

// 환기 배너에 띄울 한 줄 문구. 창이 작으므로 최대한 짧게.
function attentionMessage(
  reason: AttentionReason,
  current: ScheduleBlock | null,
  hour: number
): string {
  if (reason === "block") {
    // 새 일정이 시작됐거나(있음), 하던 일정이 끝났거나(없음).
    return current ? `🔔 지금부터 · ${current.label}` : "☕ 일정이 끝났어요";
  }
  // 'hour' — 정시 환기. 이 경우는 진행 중인 일정이 있을 때만 온다.
  return `🕐 ${hour}시 · ${current?.label ?? ""} 중`;
}

interface Props {
  todayIdx: number;          // 0=월 ... 6=일
  nowMin: number;            // 0시 기준 현재 분
  // 오늘 화면에 올릴 블록들. 어제에서 자정을 넘겨 넘어온 블록이 섞여 있을 수 있다
  // (lib/widgetBlocks 의 buildWidgetBlocks 가 만들어준다)
  blocks: WidgetBlock[];
  // 조직 시간표를 보여주는 중이면 그 조직 이름. 개인 계획표면 null.
  // 지금 보이는 게 내 일정인지 조직 일정인지 헷갈리면 안 된다.
  sourceLabel?: string | null;
  offline?: boolean;         // 클라우드를 못 읽어 캐시를 보여주는 중인지
  lastSyncedAt?: number | null; // 캐시를 만든 시각(ms)
}

// 캐시가 언제 것인지 짧게 표시한다. 오늘이면 "14:20 기준", 어제 이전이면 "7/12 기준".
// 창이 작아 문구가 길면 줄이 넘치므로 최대한 짧게 만든다.
function formatSyncedAt(savedAt: number): string {
  const saved = new Date(savedAt);
  const isToday = new Date().toDateString() === saved.toDateString();

  if (isToday) {
    const hh = String(saved.getHours()).padStart(2, "0");
    const mm = String(saved.getMinutes()).padStart(2, "0");
    return `${hh}:${mm} 기준`;
  }
  return `${saved.getMonth() + 1}/${saved.getDate()} 기준`;
}

export function WidgetBody({
  todayIdx,
  nowMin,
  blocks,
  sourceLabel = null,
  offline = false,
  lastSyncedAt = null,
}: Props) {
  const current = pickCurrentBlock(blocks, nowMin);
  const upcoming = pickUpcomingBlocks(blocks, nowMin, UPCOMING_COUNT);

  const hour = Math.floor(nowMin / 60);
  const clock = `${String(hour).padStart(2, "0")}:${String(
    nowMin % 60
  ).padStart(2, "0")}`;

  // 일정이 바뀌거나(진행 중인 시간 구간 변화) 정시가 지나면(hour 변화) 잠깐 환기 배너를 띄운다.
  //
  // 기준이 블록 id 가 아니라 '시간 구간'인 이유:
  //   위젯은 Realtime 으로 웹의 변경을 즉시 따라간다. id 를 기준으로 삼으면
  //   웹에서 프리셋만 바꿔도(=같은 시간대의 다른 블록) id 가 달라져,
  //   시각은 그대로인데 "🔔 지금부터" 배너가 거짓으로 떴다.
  //   진짜 알려야 할 순간은 "지금 진행 중인 시간대가 바뀌는 때"다.
  const currentKey = current ? `${current.start}-${current.end}` : IDLE_KEY;
  const { attention, dismiss } = useScheduleAttention(currentKey, hour);

  return (
    <div className="widget">
      {/* 환기 배너 — 위젯 맨 위에 잠깐 떠서 시선을 끈다. 누르면 바로 닫힌다.
          key 에 nonce 를 주면 다시 뜰 때마다 슬라이드-인 애니메이션이 처음부터 재생된다. */}
      {attention && (
        <button
          type="button"
          className="widget-attn"
          key={attention.nonce}
          onClick={dismiss}
          title="눌러서 닫기"
        >
          {attentionMessage(attention.reason, current, hour)}
        </button>
      )}

      {/* 상단: 요일 + 현재 시각. Tauri 에서는 이 영역을 잡고 창을 옮긴다. */}
      <header className="widget-head" data-tauri-drag-region>
        <span className="widget-day">{WEEKDAYS[todayIdx]}요일</span>

        {/* 조직 시간표를 보고 있다면 반드시 밝힌다.
            내 일정인 줄 알고 믿는 게 제일 위험하다. */}
        {sourceLabel && (
          <span className="widget-source" title={`${sourceLabel} 조직 시간표`}>
            👥 {sourceLabel}
          </span>
        )}

        {/* 오프라인이면 지금 보이는 게 "옛날 일정"일 수 있음을 알려준다.
            숨기면 사용자가 이미 지난 시간표를 최신인 줄 알고 믿게 된다. */}
        {offline && (
          <span className="widget-offline" title="인터넷에 연결되지 않아 저장된 일정을 보여주는 중입니다">
            오프라인{lastSyncedAt ? ` · ${formatSyncedAt(lastSyncedAt)}` : ""}
          </span>
        )}

        <span className="widget-clock">{clock}</span>
      </header>

      {current ? (
        <div
          className={`widget-now ${current.color}${
            attention ? " widget-now--pulse" : ""
          }`}
        >
          <span className="widget-now-time">
            {formatRange(current.start, current.end)}
          </span>
          <strong className="widget-now-label">{current.label}</strong>
        </div>
      ) : (
        <div
          className={`widget-now widget-now-idle${
            attention ? " widget-now--pulse" : ""
          }`}
        >
          <strong className="widget-now-label">지금은 일정이 없어요</strong>
        </div>
      )}

      {upcoming.length > 0 && (
        <ul className="widget-next">
          {upcoming.map((block) => (
            <li key={block.id} className="widget-next-item">
              <span className={`widget-dot ${block.color}`} />
              <span className="widget-next-time">{block.start}</span>
              <span className="widget-next-label">{block.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
