/*
 * 안드로이드 앱(Capacitor)에서의 카카오 로그인.
 *
 * 웹/데스크탑과 무엇이 다른가:
 *   웹에서는 그냥 현재 창을 카카오로 넘겼다가 되돌아오면 끝이다(location 이동).
 *   앱에서는 그럴 수 없다. 앱 화면은 파일에서 띄운 웹뷰(http://localhost)라
 *   외부 사이트로 넘어가 버리면 "앱이 사라지고 웹페이지가 된" 꼴이 되고,
 *   카카오는 인앱 웹뷰 로그인을 제한하기도 한다.
 *
 * 그래서 표준 방식(크롬 커스텀탭 + 딥링크)을 쓴다:
 *   1) 로그인 URL 만 받아온다 (skipBrowserRedirect: 화면은 넘기지 않는다)
 *   2) 시스템 브라우저(커스텀탭)로 연다 → 폰에 이미 로그인된 카카오 세션을 그대로 쓸 수 있다
 *   3) 로그인이 끝나면 Supabase 가 ilgongbang://auth-callback 으로 되돌려준다
 *   4) 앱이 그 주소를 받아(App.appUrlOpen) 토큰을 꺼내 세션을 세운다 → 브라우저를 닫는다
 *
 * 사전 준비(둘 다 안 하면 4)에서 막힌다):
 *   - Supabase 대시보드 Redirect URLs 에 ilgongbang://auth-callback 등록
 *   - AndroidManifest 의 intent-filter (이미 넣어둠)
 */
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabaseClient";

// 로그인 후 앱으로 되돌아올 주소. AndroidManifest 의 scheme/host 와 반드시 같아야 한다.
export const NATIVE_REDIRECT_URL = "ilgongbang://auth-callback";

/** 지금 안드로이드/iOS 앱 안에서 도는 중인가? (브라우저면 false) */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * 앱에서 카카오 로그인 시작.
 * 성공/실패 판정은 여기서 하지 않는다 — 결과는 딥링크로 돌아오며 handleAuthDeepLink 가 받는다.
 */
export async function signInWithKakaoNative(): Promise<void> {
  if (!supabase) throw new Error("Supabase 클라이언트가 설정되지 않았습니다.");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: NATIVE_REDIRECT_URL,
      // 웹뷰를 카카오로 넘기지 않고, 열어야 할 주소만 문자열로 받는다.
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    throw error ?? new Error("카카오 로그인 주소를 받지 못했습니다.");
  }

  await Browser.open({ url: data.url });
}

/**
 * 딥링크로 돌아온 주소에서 세션을 세운다.
 * @returns 이 주소가 로그인 콜백이어서 처리했으면 true
 */
async function handleAuthDeepLink(url: string): Promise<boolean> {
  if (!url.startsWith(NATIVE_REDIRECT_URL) || !supabase) return false;

  try {
    // 커스텀 스킴은 표준 URL 파서가 쿼리/해시를 제대로 안 잘라주는 경우가 있어 직접 나눈다.
    const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
    const query = url.includes("?")
      ? url.slice(url.indexOf("?") + 1, hash ? url.indexOf("#") : undefined)
      : "";

    const hashParams = new URLSearchParams(hash);
    const queryParams = new URLSearchParams(query);

    // 카카오/Supabase 가 거절한 경우(동의 취소 등)
    const errorDescription =
      queryParams.get("error_description") ?? hashParams.get("error_description");
    if (errorDescription) throw new Error(errorDescription);

    // 1) implicit 흐름 — 토큰이 # 뒤에 실려 온다. (supabase-js 기본값)
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
      return true;
    }

    // 2) PKCE 흐름 — ?code= 로 온다. 나중에 flowType 을 바꿔도 앱이 깨지지 않도록 같이 받아둔다.
    const code = queryParams.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return true;
    }

    throw new Error("로그인 응답에 토큰이 없습니다.");
  } catch (e) {
    console.error("[NativeAuth] 로그인 콜백 처리 실패", e);
    alert("로그인에 실패했습니다. 잠시 후 다시 시도해주세요.");
    return true; // 콜백인 건 맞으므로 브라우저는 닫아준다.
  }
}

/**
 * 딥링크 수신 등록. 앱 진입 시 한 번만 부른다.
 * 앱이 아닐 때(브라우저/위젯)는 아무것도 하지 않는다.
 */
export function initNativeAuth(): void {
  if (!isNativeApp()) return;

  void App.addListener("appUrlOpen", async ({ url }) => {
    const handled = await handleAuthDeepLink(url);
    // 로그인 창(커스텀탭)이 앱 위에 남아 있으면 안 된다.
    if (handled) await Browser.close().catch(() => {});
  });
}
