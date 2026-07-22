/*
 * 구글 캘린더 '연결' 클라이언트 로직.
 *
 * 클라이언트가 하는 일은 딱 두 가지뿐이다:
 *   1) 연결 시작 — 나를 식별할 state 를 서버에 남기고, 구글 동의화면으로 보낸다.
 *   2) 결과 읽기 — 돌아왔을 때 주소의 ?google= 를 읽어 성공/실패를 안다.
 *
 * 민감한 일(코드↔토큰 교환, refresh_token 저장)은 전부 Edge Function(서버)이 한다.
 * 여기서는 client_secret 도 refresh_token 도 절대 만지지 않는다. (docs/구글-캘린더-연동.md)
 */
import { supabase } from "./supabaseClient";

// 읽기 전용 스코프만 요청한다 — 우리는 일정을 '읽어서 보여줄' 뿐, 쓰지 않는다.
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

/** 이 빌드에서 구글 캘린더 연동을 쓸 수 있는가(환경변수가 채워졌는가). */
export function isGoogleCalendarConfigured(): boolean {
  return Boolean(CLIENT_ID && SUPABASE_URL && supabase);
}

/**
 * 구글 캘린더 연결 시작.
 * 성공/실패 판정은 여기서 하지 않는다 — 구글·서버를 거쳐 돌아온 뒤 readGoogleConnectResult 가 읽는다.
 */
export async function connectGoogleCalendar(): Promise<void> {
  if (!supabase || !CLIENT_ID || !SUPABASE_URL) {
    throw new Error("구글 캘린더 연동이 설정되지 않았습니다. (환경변수 필요)");
  }

  // 내 로그인 토큰(access_token)을 state 로 실어 보낸다.
  //   콜백(서버)이 이 토큰을 검증해 '누구의 연결인지'를 안다 → 별도 DB 기록이 필요 없다.
  //   토큰 자체가 신원 증명이자 위조 방지(CSRF) 역할을 한다(남이 위조 못 함).
  //   ※ 이건 짧게 사는(약 1시간) Supabase 세션 토큰이다. 구글 refresh 토큰은
  //     여전히 서버(Edge Function)에만 저장되고 클라이언트로는 내려오지 않는다.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("로그인이 필요합니다.");

  // 구글 동의화면으로 이동.
  //   access_type=offline + prompt=consent 여야 백그라운드 동기화용 refresh_token 을 준다.
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${SUPABASE_URL}/functions/v1/google-calendar-callback`,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: accessToken,
  });
  window.location.href = `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export type GoogleConnectResult = "connected" | "error";

/**
 * 연결 후 돌아온 주소의 ?google= 결과를 읽고, 주소를 깨끗이 지운다.
 * @returns { result, reason } 또는 결과가 없으면 null
 *
 * 주소를 지우는 이유: 남겨두면 새로고침할 때마다 같은 알림이 다시 뜨고,
 *   뒤로가기로도 계속 되돌아온다(초대 링크 처리와 같은 이유).
 */
export function readGoogleConnectResult():
  | { result: GoogleConnectResult; reason: string | null }
  | null {
  const query = new URLSearchParams(window.location.search);
  const raw = query.get("google");
  if (raw !== "connected" && raw !== "error") return null;

  const reason = query.get("reason");

  // 주소에서 google/reason 만 걷어내고 나머지(?widget=1 등)는 지킨다.
  const url = new URL(window.location.href);
  url.searchParams.delete("google");
  url.searchParams.delete("reason");
  window.history.replaceState({}, "", url.toString());

  return { result: raw, reason };
}
