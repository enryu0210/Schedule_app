/*
 * 앱의 최상위 라우터.
 * - 인증 상태에 따라 화면을 나눈다:
 *     세션 확인 중 → 로딩 / 비로그인 → 로그인 화면 / 로그인 → 계획표(Planner)
 * - "로그인 후 사용" 정책에 맞춰, 로그인 전에는 어떤 스케줄도 보여주지 않는다.
 */
import { useAuth } from "./hooks/useAuth";
import { LoginScreen } from "./components/LoginScreen";
import { Planner } from "./components/Planner";
import { WidgetView } from "./components/WidgetView";
import { isWidgetMode } from "./lib/widgetMode";

export default function App() {
  const { user, loading } = useAuth();

  // 위젯 모드는 로딩/로그인 화면까지 자체적으로 처리하므로 가장 먼저 분기한다.
  if (isWidgetMode()) return <WidgetView />;

  // 1) 앱 시작 시 기존 세션을 확인하는 동안 잠깐 로딩 표시.
  if (loading) {
    return (
      <div className="wrap">
        <div className="loading-hint">불러오는 중…</div>
      </div>
    );
  }

  // 2) 로그인하지 않았으면 로그인 화면.
  if (!user) return <LoginScreen />;

  // 3) 로그인 완료 → 메인 계획표.
  return <Planner />;
}
