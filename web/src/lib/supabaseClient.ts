/*
 * Supabase 클라이언트 초기화.
 *
 * 핵심 설계: 환경변수(키)가 없으면 client 를 null 로 둔다.
 *   → 키가 없어도 앱이 죽지 않고 "로컬 전용 모드"로 동작한다. (로컬 우선 철학)
 *   → 로그인/클라우드 저장 기능만 비활성화되고 나머지는 그대로 쓸 수 있다.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// URL과 키가 모두 있을 때만 실제 클라이언트를 만든다.
//
// flowType: 'pkce' 를 명시하는 이유(보안):
//   supabase-js 기본값은 implicit 플로우라, 로그인 후 access_token/refresh_token 이
//   복귀 URL 의 해시(#)에 그대로 실려 온다. 안드로이드 앱은 이 복귀 주소가 커스텀 스킴
//   (ilgongbang://auth-callback)이라, 같은 스킴을 등록한 다른(악성) 앱이 그 토큰을
//   가로챌 수 있다 → 세션 탈취.
//   PKCE 는 URL 에 짧은 '코드(?code=)'만 노출하고, 그 코드를 세션으로 바꾸려면
//   정품 앱의 localStorage 안에만 있는 code_verifier 가 필요하다. 코드가 새도 무용지물이다.
//   (nativeAuth.ts 가 이미 ?code= → exchangeCodeForSession 경로를 처리한다)
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, { auth: { flowType: "pkce" } })
    : null;

// 다른 곳에서 "지금 클라우드 기능을 쓸 수 있는가?"를 쉽게 확인하기 위한 플래그.
export const isSupabaseEnabled = supabase !== null;

// 개발 편의: 키가 없으면 콘솔에 안내를 남긴다. (배포 시엔 값이 있으므로 안 뜸)
if (!isSupabaseEnabled) {
  console.info(
    "[Supabase] 환경변수(VITE_SUPABASE_URL/ANON_KEY)가 없어 로컬 전용 모드로 동작합니다."
  );
}
