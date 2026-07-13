/*
 * 위젯 모드 판별 + 위젯 창을 "브라우저처럼 굴지 않게" 만드는 처리.
 *
 * 데스크탑 위젯(Tauri)은 배포된 웹앱을 "?widget=1" 로 그대로 띄운다.
 * 그런데 그 안은 결국 웹뷰라, 손대지 않으면 우클릭에 브라우저 컨텍스트 메뉴가 뜨는 등
 * "이건 앱이 아니라 웹페이지구나"가 티가 난다. 그 티를 지우는 게 이 파일의 역할이다.
 */
const WIDGET_MODE_KEY = "schedule:widget-mode";

/**
 * 지금 위젯 모드인가?
 *
 * 주소(?widget=1)만 믿으면 안 된다. 위젯 창에서 카카오 로그인을 하면
 * 카카오 → Supabase → 우리 사이트로 두 번 튕겨 돌아오는데, 이 왕복에서 쿼리가 떨어져 나가면
 * 위젯 창에 전체 앱 화면이 떠버린다(실제로 겪음). 그래서 이 탭(웹뷰)의 세션에도 기억시켜 둔다.
 */
export function isWidgetMode(): boolean {
  const fromUrl = new URLSearchParams(window.location.search).get("widget") === "1";

  // 시크릿 모드 등에서 sessionStorage 접근이 막힐 수 있으므로, 실패해도 앱은 계속 돌아야 한다.
  try {
    if (fromUrl) sessionStorage.setItem(WIDGET_MODE_KEY, "1");
    return fromUrl || sessionStorage.getItem(WIDGET_MODE_KEY) === "1";
  } catch {
    return fromUrl;
  }
}

/**
 * 위젯 창에서 어색한 브라우저 기본 동작을 끈다. (앱 진입 시 1회 호출)
 * - 배경 투명화 (Tauri 창이 둥근 카드처럼 보이도록)
 * - 우클릭 컨텍스트 메뉴 차단 ("이미지 저장", "새로고침" 같은 항목이 뜨면 위젯이 아니다)
 */
export function applyWidgetChrome(): void {
  document.body.classList.add("widget-body");

  document.addEventListener("contextmenu", (e) => e.preventDefault());
}
