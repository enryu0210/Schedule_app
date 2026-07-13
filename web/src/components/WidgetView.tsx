/*
 * 위젯 화면 (?widget=1).
 *
 * 바탕화면 위에 항상 떠 있는 작은 창에 들어갈 내용이다.
 *   - 지금 진행 중인 일정을 "크게"
 *   - 다음 일정 2개를 작게
 * 편집 기능은 일부러 넣지 않았다. 위젯은 "보기 전용"이고, 클라우드에 절대 쓰지 않는다.
 */
import { useWidgetPresets } from "../hooks/useWidgetPresets";
import { useAuth } from "../hooks/useAuth";
import { useNow } from "../hooks/useNow";
import {
  formatRange,
  isNowInBlock,
  jsDayToMondayIndex,
  toMinutes,
} from "../lib/time";
import type { ScheduleBlock } from "../types";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
// 다음 일정을 몇 개까지 보여줄지. 창이 작으므로 2개가 한계다.
const UPCOMING_COUNT = 2;

export function WidgetView() {
  const { user, loading, signInWithKakao } = useAuth();
  const { presets, selectedPresetId, loaded } = useWidgetPresets();
  const now = useNow(30000);

  // 1) 로그인 확인 중 / 데이터 로딩 중
  if (loading || (user && !loaded)) {
    return <div className="widget widget-center">불러오는 중…</div>;
  }

  // 2) 비로그인 — 위젯에서는 안내만 하고, 로그인 자체는 여기서도 가능하게 둔다.
  if (!user) {
    return (
      <div className="widget widget-center">
        <p className="widget-empty">로그인하면 오늘 일정이 보여요</p>
        <button className="widget-login" onClick={signInWithKakao}>
          카카오로 로그인
        </button>
      </div>
    );
  }

  const preset =
    presets.find((p) => p.id === selectedPresetId) ?? presets[0] ?? null;

  const todayIdx = jsDayToMondayIndex(now.getDay());
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const blocks = preset?.days[todayIdx]?.blocks ?? [];

  const current = blocks.find((b) => isNowInBlock(nowMin, b.start, b.end)) ?? null;
  // "다음 일정" = 아직 시작하지 않은 블록들. 시작 시각 순으로 앞에서 2개.
  const upcoming: ScheduleBlock[] = blocks
    .filter((b) => toMinutes(b.start) > nowMin)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    .slice(0, UPCOMING_COUNT);

  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  return (
    <div className="widget">
      {/* 상단: 요일 + 현재 시각. 창을 끄는 손잡이(Tauri drag region)도 겸한다. */}
      <header className="widget-head" data-tauri-drag-region>
        <span className="widget-day">{WEEKDAYS[todayIdx]}요일</span>
        <span className="widget-clock">{clock}</span>
      </header>

      {current ? (
        <div className={`widget-now ${current.color}`}>
          <span className="widget-now-time">
            {formatRange(current.start, current.end)}
          </span>
          <strong className="widget-now-label">{current.label}</strong>
        </div>
      ) : (
        <div className="widget-now widget-now-idle">
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
