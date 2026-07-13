/*
 * 로그인 상태 바. 상단 우측에 표시된다.
 * - 로그아웃 상태: "카카오 로그인" 버튼
 * - 로그인 상태: 사용자 표시 + "로그아웃"
 * - Supabase 미설정(로컬 전용): 아무것도 표시하지 않는다.
 */
import { useAuth } from "../hooks/useAuth";

export function AuthBar() {
  const { user, enabled, loading, signInWithKakao, signOut } = useAuth();

  // 클라우드 기능 자체가 꺼져 있으면(키 없음) 로그인 UI를 숨긴다.
  if (!enabled) return null;
  // 초기 세션 확인 중에는 깜빡임을 줄이기 위해 잠깐 비워둔다.
  if (loading) return null;

  if (!user) {
    return (
      <button className="kakao-login" onClick={signInWithKakao}>
        카카오 로그인
      </button>
    );
  }

  // 사용자 표시 이름: 소셜 프로필 이름 → 이메일 → "사용자" 순으로 골라 쓴다.
  const displayName =
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    "사용자";

  return (
    <div className="auth-user">
      <span className="auth-name" title={displayName}>{displayName}</span>
      <button className="auth-signout" onClick={signOut}>로그아웃</button>
    </div>
  );
}
