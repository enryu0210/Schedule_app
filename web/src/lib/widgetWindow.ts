/*
 * 위젯 창(Tauri) 크기 조절 — 로그인할 때만 창을 키운다.
 *
 * 왜 필요한가:
 *   위젯 창은 300x230 이다. 카카오 로그인 페이지는 이 크기에 절대 안 들어간다.
 *   그렇다고 "브라우저에서 로그인하세요"로 우회할 수도 없다 — 브라우저와 위젯 웹뷰는
 *   저장소가 따로라, 브라우저에서 로그인해봐야 위젯에는 세션이 안 생긴다.
 *   → 로그인은 위젯 웹뷰 안에서 해야 하고, 그동안만 창을 크게 만든다.
 *
 * 원래 크기를 저장소에 적어두는 이유:
 *   로그인은 페이지가 통째로 카카오로 넘어갔다 돌아오는 흐름이라, 메모리에 든 값은 그때 날아간다.
 *   sessionStorage 가 아니라 localStorage 를 쓰는 건, 로그인 도중에 위젯을 꺼버리는 경우 때문이다.
 *   그러면 창 크기 기억 플러그인이 "커진 크기"를 저장해버려, 다음 실행 때도 큰 창으로 뜬다.
 *   localStorage 에 남겨두면 다음 실행에서 원래 크기로 되돌릴 수 있다.
 *
 * 이 파일의 모든 함수는 웹 브라우저에서 그냥 아무 일도 하지 않는다(Tauri 가 아니므로).
 */
const LOGIN_WIDTH = 420;
const LOGIN_HEIGHT = 640;

// 로그인 전 창 크기/위치를 담아둘 열쇠.
const BOUNDS_KEY = "schedule:widget-prelogin-bounds";

interface Bounds {
  width: number;
  height: number;
  x: number;
  y: number;
}

/** 지금 Tauri 위젯 창 안에서 돌고 있는가? (브라우저면 false) */
export function isTauriWidget(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Tauri 창 핸들. 웹 브라우저에서는 null 을 돌려 호출부가 조용히 지나가게 한다.
async function getWidgetWindow() {
  if (!isTauriWidget()) return null;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  } catch (e) {
    console.warn("[Widget] Tauri 창 API 를 불러오지 못했습니다.", e);
    return null;
  }
}

/**
 * 로그인 페이지가 보이도록 창을 키운다. (로그인 버튼을 누른 직후 호출)
 * 커진 창이 화면 밖으로 밀려나지 않도록 화면 중앙으로 옮긴다.
 */
export async function expandForLogin(): Promise<void> {
  const win = await getWidgetWindow();
  if (!win) return;

  try {
    const { LogicalSize } = await import("@tauri-apps/api/dpi");

    // 되돌릴 때 쓸 현재 크기/위치를 먼저 저장한다.
    // (사용자가 위젯을 직접 키워놨을 수 있으므로 고정값 300x230 으로 되돌리면 안 된다)
    const scale = await win.scaleFactor();
    const size = (await win.innerSize()).toLogical(scale);
    const pos = (await win.outerPosition()).toLogical(scale);
    const bounds: Bounds = { width: size.width, height: size.height, x: pos.x, y: pos.y };
    localStorage.setItem(BOUNDS_KEY, JSON.stringify(bounds));

    await win.setSize(new LogicalSize(LOGIN_WIDTH, LOGIN_HEIGHT));
    await win.center();
  } catch (e) {
    // 창을 못 키워도 로그인 자체는 진행시킨다. (작은 창에서 불편할 뿐)
    console.warn("[Widget] 로그인용 창 확대 실패", e);
  }
}

/**
 * 로그인 왕복이 끝나 앱이 다시 뜰 때, 원래 위젯 크기로 되돌린다. (앱 진입 시 1회 호출)
 *
 * 로그인 성공/취소를 구분하지 않는 이유:
 *   어느 쪽이든 "우리 페이지가 다시 떴다"는 건 로그인 흐름이 끝났다는 뜻이다.
 *   취소했는데 창이 커진 채로 남는 게 더 나쁘다.
 */
export async function restoreAfterLogin(): Promise<void> {
  let bounds: Bounds;
  try {
    const raw = localStorage.getItem(BOUNDS_KEY);
    if (!raw) return; // 창을 키운 적이 없다 → 되돌릴 것도 없다.
    bounds = JSON.parse(raw) as Bounds;
    localStorage.removeItem(BOUNDS_KEY);
  } catch {
    return;
  }

  const win = await getWidgetWindow();
  if (!win) return;

  try {
    const { LogicalSize, LogicalPosition } = await import("@tauri-apps/api/dpi");
    await win.setSize(new LogicalSize(bounds.width, bounds.height));
    await win.setPosition(new LogicalPosition(bounds.x, bounds.y));
  } catch (e) {
    console.warn("[Widget] 위젯 크기 복원 실패", e);
  }
}
