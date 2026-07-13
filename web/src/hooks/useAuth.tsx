/*
 * 인증(로그인) 상태 관리 훅 + Provider.
 * - Supabase 세션을 구독해 로그인 여부/사용자 정보를 앱 전체에 제공한다.
 * - 카카오 로그인 / 로그아웃 함수를 노출한다.
 * - Supabase 키가 없으면(로컬 전용 모드) 로그인 기능은 조용히 비활성화된다.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseEnabled } from "../lib/supabaseClient";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;          // 초기 세션 확인 중인지
  enabled: boolean;          // 클라우드/로그인 기능 사용 가능 여부
  signInWithKakao: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Supabase 미설정이면 로그인 확인 없이 바로 로딩 종료.
    if (!supabase) {
      setLoading(false);
      return;
    }

    // 1) 앱 시작 시 기존 세션이 있는지 확인.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // 2) 이후 로그인/로그아웃 등 상태 변화를 실시간 구독.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    // 컴포넌트 정리 시 구독 해제 (메모리 누수 방지)
    return () => sub.subscription.unsubscribe();
  }, []);

  // 카카오 OAuth 로그인 시작. 로그인 후 현재 페이지로 다시 돌아온다.
  async function signInWithKakao() {
    if (!supabase) {
      alert("클라우드 기능이 아직 설정되지 않았습니다. (Supabase 키 필요)");
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: window.location.origin,
        // 카카오의 이메일(account_email)·프로필사진(profile_image) 동의항목은
        // 비즈니스 앱 검수를 받아야 사용할 수 있다. 검수 전에 이들을 요청하면
        // KOE205(동의항목 불일치) 오류가 난다.
        // 앱에서 실제로 필요한 건 표시용 '닉네임'뿐이므로 그것만 요청한다.
        scopes: "profile_nickname",
      },
    });
    if (error) {
      console.error("[Auth] 카카오 로그인 실패", error);
      alert("카카오 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  const value: AuthContextValue = {
    user: session?.user ?? null,
    session,
    loading,
    enabled: isSupabaseEnabled,
    signInWithKakao,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// 앱 어디서나 인증 상태를 꺼내 쓰는 훅.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth 는 <AuthProvider> 안에서만 사용할 수 있습니다.");
  }
  return ctx;
}
