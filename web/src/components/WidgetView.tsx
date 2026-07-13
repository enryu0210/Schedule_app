/*
 * 위젯 컨테이너 (?widget=1).
 *
 * 하는 일: 로그인 확인 → 오늘 블록을 골라 WidgetBody 에 넘기기.
 * 편집 기능은 일부러 없다. 위젯은 "보기 전용"이며 클라우드에 절대 쓰지 않는다.
 */
import { useWidgetPresets } from "../hooks/useWidgetPresets";
import { useAuth } from "../hooks/useAuth";
import { useNow } from "../hooks/useNow";
import { jsDayToMondayIndex } from "../lib/time";
import { expandForLogin } from "../lib/widgetWindow";
import { WidgetBody } from "./WidgetBody";

export function WidgetView() {
  const { user, loading, signInWithKakao } = useAuth();
  const { presets, selectedPresetId, loaded } = useWidgetPresets();
  const now = useNow(30000);

  // 1) 로그인 확인 중 / 데이터 로딩 중
  if (loading || (user && !loaded)) {
    return <div className="widget widget-center">불러오는 중…</div>;
  }

  // 2) 비로그인 — 위젯에서도 바로 로그인할 수 있게 버튼을 둔다.
  //    카카오 로그인 페이지는 위젯 크기(300x230)에 안 들어가므로, 로그인 동안만 창을 키운다.
  //    (원래 크기로는 로그인 흐름이 끝나 앱이 다시 뜰 때 되돌아온다 — lib/widgetWindow.ts)
  async function handleLogin() {
    await expandForLogin();
    await signInWithKakao();
  }

  if (!user) {
    return (
      <div className="widget widget-center">
        <p className="widget-empty">로그인하면 오늘 일정이 보여요</p>
        <button className="widget-login" onClick={handleLogin}>
          카카오로 로그인
        </button>
      </div>
    );
  }

  // 선택된 프리셋이 없으면(예: 삭제됨) 첫 번째 프리셋으로 대체한다.
  const preset = presets.find((p) => p.id === selectedPresetId) ?? presets[0] ?? null;

  const todayIdx = jsDayToMondayIndex(now.getDay());
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const blocks = preset?.days[todayIdx]?.blocks ?? [];

  return <WidgetBody todayIdx={todayIdx} nowMin={nowMin} blocks={blocks} />;
}
