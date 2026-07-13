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
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

// 다른 곳에서 "지금 클라우드 기능을 쓸 수 있는가?"를 쉽게 확인하기 위한 플래그.
export const isSupabaseEnabled = supabase !== null;

// 개발 편의: 키가 없으면 콘솔에 안내를 남긴다. (배포 시엔 값이 있으므로 안 뜸)
if (!isSupabaseEnabled) {
  console.info(
    "[Supabase] 환경변수(VITE_SUPABASE_URL/ANON_KEY)가 없어 로컬 전용 모드로 동작합니다."
  );
}
