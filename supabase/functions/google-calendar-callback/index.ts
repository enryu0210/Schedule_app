/*
 * 구글 OAuth 콜백 (Supabase Edge Function, Deno).
 *
 * 흐름:
 *   웹 클라이언트가 "구글 캘린더 연결"을 누르면 구글 동의화면으로 보낸다.
 *   동의가 끝나면 구글이 이 함수로 ?code=&state= 를 붙여 리다이렉트한다.
 *   이 함수가 (서버에서만) code 를 토큰으로 바꾸고, refresh_token 을 DB 에 저장한 뒤
 *   앱으로 다시 돌려보낸다.
 *
 * 왜 서버(여기)에서 하나:
 *   client_secret 과 refresh_token 은 절대 브라우저로 내보내면 안 된다(탈취 시 캘린더 무기한 접근).
 *   그래서 코드 교환·토큰 저장을 전부 이 함수(service_role) 안에서 끝낸다.
 *
 * ⚠️ 배포 시 반드시 --no-verify-jwt 로 배포한다.
 *    구글이 이 주소로 리다이렉트할 때는 Supabase JWT 가 없어서, 기본(verify_jwt=true)이면
 *    우리 코드가 실행되기도 전에 차단된다.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// 연결 시작 시 클라이언트가 계산하는 값과 반드시 똑같아야 한다(구글이 일치를 검사한다).
function redirectUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-callback`;
}

// state 가 너무 오래됐으면(연결을 시작만 하고 방치) 거절한다.
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error"); // 사용자가 동의를 거부한 경우 등

  const appUrl = Deno.env.get("APP_URL") ?? "";
  // 결과를 앱으로 돌려보내는 헬퍼. (성공/실패 모두 화면에 무언가를 보여줘야 한다)
  const back = (result: "connected" | "error", reason = "") =>
    Response.redirect(
      `${appUrl}/?google=${result}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`,
      302,
    );

  try {
    if (oauthError) return back("error", oauthError);
    if (!code || !state) return back("error", "missing_code_or_state");

    // service_role 클라이언트 — RLS 를 우회해 서버 전용 테이블을 다룬다.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) state 검증 → 어떤 사용자의 연결인지 알아낸다. (그리고 재사용 못 하게 즉시 삭제)
    const { data: stateRow } = await admin
      .from("google_oauth_states")
      .select("user_id, created_at")
      .eq("state", state)
      .maybeSingle();
    // 일회성: 있든 없든 지워서 재사용/누적을 막는다.
    await admin.from("google_oauth_states").delete().eq("state", state);
    if (!stateRow) return back("error", "invalid_state");
    if (Date.now() - new Date(stateRow.created_at).getTime() > STATE_MAX_AGE_MS) {
      return back("error", "state_expired");
    }
    const userId = stateRow.user_id as string;

    // 2) code → 토큰 교환 (client_secret 은 서버 환경변수에서만 읽는다)
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();

    // prompt=consent 로 요청하므로 정상적이면 refresh_token 이 온다.
    // 없으면(재동의가 아니었음 등) 저장할 게 없어 실패로 본다.
    if (!tokenRes.ok || !tokens.refresh_token) {
      console.error("토큰 교환 실패", tokenRes.status, tokens?.error);
      return back("error", "token_exchange_failed");
    }

    // 3) refresh_token 저장 (서버 전용 테이블)
    const { error: tokenErr } = await admin.from("google_calendar_tokens").upsert({
      user_id: userId,
      refresh_token: tokens.refresh_token,
      connected_at: new Date().toISOString(),
    });
    if (tokenErr) {
      console.error("토큰 저장 실패", tokenErr);
      return back("error", "store_failed");
    }

    // 4) "연결됨" 신호용 자리표시 행. (이미 동기화된 데이터가 있으면 덮지 않는다)
    //    실제 이벤트 채우기는 동기화 함수(Phase 3)가 한다.
    await admin.from("calendar_schedules").upsert(
      {
        user_id: userId,
        schedule: { events: [], rangeStart: "", rangeEnd: "", syncedAt: 0 },
        synced_at: new Date().toISOString(),
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

    return back("connected");
  } catch (e) {
    console.error("콜백 처리 중 예외", e);
    return back("error", "exception");
  }
});
