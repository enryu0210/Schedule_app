/*
 * 로그인 화면. 로그인하지 않은 사용자에게 가장 먼저 보인다.
 * - "일정공방" 브랜드 로고 + 소개 문구 + 카카오 로그인 버튼.
 */
import { useAuth } from "../hooks/useAuth";

export function LoginScreen() {
  const { enabled, signInWithKakao } = useAuth();

  return (
    <div className="login-screen">
      <div className="login-card">
        {/* 앱 로고 (web/public/app-icon.svg) */}
        <img className="login-logo" src="/app-icon.svg" alt="일정공방" width={88} height={88} />
        <h1 className="login-title">일정공방</h1>
        <p className="login-tagline">
          상황별 주간 시간표를 프리셋으로 만들고<br />
          지금 할 일을 한눈에.
        </p>

        {enabled ? (
          <button className="kakao-login-lg" onClick={signInWithKakao}>
            카카오로 시작하기
          </button>
        ) : (
          // Supabase 키가 없는 경우(설정 누락) 대비 안내.
          <p className="login-warn">
            로그인 기능이 아직 설정되지 않았습니다.<br />
            (Supabase 환경변수 필요)
          </p>
        )}

        <p className="login-note">로그인하면 시간표가 클라우드에 저장돼<br />여러 기기에서 볼 수 있어요.</p>
      </div>
    </div>
  );
}
