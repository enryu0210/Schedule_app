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

  // 사용자 표시 이름 고르기.
  // 카카오는 프로필 정보를 user_metadata 에 담아주는데, 필드 이름이
  // name / nickname / full_name / user_name 등으로 제공자마다 다를 수 있어
  // 있는 것부터 순서대로 사용한다. (없으면 이메일 → "사용자")
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const displayName =
    meta.name ??
    meta.nickname ??
    meta.full_name ??
    meta.user_name ??
    meta.preferred_username ??
    user.email ??
    "사용자";

  return (
    <div className="auth-user">
      <span className="auth-name" title={displayName}>{displayName}</span>
      <button className="auth-signout" onClick={signOut}>로그아웃</button>
    </div>
  );
}
