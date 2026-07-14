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
  const {
    presets,
    selectedPresetId,
    orgPlan,
    orgName,
    loaded,
    offline,
    lastSyncedAt,
  } = useWidgetPresets();
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

  // 3) 오프라인인데 보여줄 캐시조차 없는 경우 (예: 새 PC 에 설치하자마자 인터넷이 끊김).
  //    이때 빈 시간표를 그리면 "일정이 없다"는 오해를 준다 — 못 읽었다고 분명히 알린다.
  if (offline && presets.length === 0 && !orgPlan) {
    return (
      <div className="widget widget-center">
        <p className="widget-empty">일정을 불러오지 못했어요</p>
        <p className="widget-empty widget-hint">인터넷 연결을 확인해 주세요</p>
      </div>
    );
  }

  // 무엇을 보여줄지는 **웹에서 마지막으로 보던 것**을 따라간다.
  // (위젯은 창이 작아 고르는 UI 를 넣을 자리가 없다 — 프리셋 선택도 이미 같은 방식이다)
  //
  // 조직을 보는 중인데 아직 배포된 조직 시간표가 없거나, 조직에서 나가 못 읽게 됐다면
  // orgPlan 이 null 이다. 그때는 조용히 개인 계획표로 떨어진다 — 빈 화면보다 낫다.
  const personalPreset =
    presets.find((p) => p.id === selectedPresetId) ?? presets[0] ?? null;
  const preset = orgPlan ?? personalPreset;
  // 조직 시간표를 보여줄 때만 이름표를 붙인다. 개인 일정과 헷갈리면 안 된다.
  const sourceLabel = orgPlan ? orgName : null;

  const todayIdx = jsDayToMondayIndex(now.getDay());
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const blocks = preset?.days[todayIdx]?.blocks ?? [];

  return (
    <WidgetBody
      todayIdx={todayIdx}
      nowMin={nowMin}
      blocks={blocks}
      sourceLabel={sourceLabel}
      offline={offline}
      lastSyncedAt={lastSyncedAt}
    />
  );
}
