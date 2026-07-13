/*
 * 앱 진입점. React 앱을 #root 에 마운트한다.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";
import "./styles/tokens.css";
import "./styles/app.css";

// 위젯 모드에서는 배경을 투명하게 만들어야 한다(Tauri 창이 둥근 카드처럼 보이도록).
// CSS만으로는 body 배경색을 덮을 수 없어, 진입 시점에 클래스를 붙여 구분한다.
if (new URLSearchParams(window.location.search).get("widget") === "1") {
  document.body.classList.add("widget-body");
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
