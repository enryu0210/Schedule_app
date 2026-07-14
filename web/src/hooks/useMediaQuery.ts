/*
 * CSS 미디어 쿼리를 자바스크립트에서 구독한다.
 *
 * 왜 필요한가:
 *   대부분의 반응형은 CSS 로 끝나지만, 그래프형 시간표는 "1시간이 몇 px 인가"를
 *   JS 가 알아야 한다(블록 위치·그리드 높이를 픽셀로 계산하기 때문).
 *   그래서 화면이 좁은지를 CSS 가 아니라 JS 가 알아야 하는 예외가 생긴다.
 */
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    // 화면 회전·창 크기 변경에 따라가야 한다.
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    // 구독을 붙이는 사이에 값이 바뀌었을 수 있으니 한 번 맞춰준다.
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
