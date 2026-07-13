/*
 * 앱 진입점. React 앱을 #root 에 마운트한다.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";
import { isWidgetMode, applyWidgetChrome } from "./lib/widgetMode";
import "./styles/tokens.css";
import "./styles/app.css";

// 위젯 모드는 배경 투명화·우클릭 차단처럼 body 단위 처리가 필요해 진입 시점에 한 번만 적용한다.
if (isWidgetMode()) {
  applyWidgetChrome();
}

const rootEl = document.getElementById("root");
// 방어 코드: index.html 이 바뀌어 #root 가 없을 때 원인을 명확히 알려준다.
if (!rootEl) {
  throw new Error("#root 요소를 찾을 수 없습니다. index.html 을 확인하세요.");
}

createRoot(rootEl).render(
  <StrictMode>
    {/* AuthProvider 로 앱 전체를 감싸 어디서든 로그인 상태를 쓸 수 있게 한다. */}
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
