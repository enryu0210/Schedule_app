/*
 * 현재 시각을 주기적으로 갱신해주는 훅.
 * - 30초마다 리렌더를 유발해 "지금 할 일" 하이라이트가 자동으로 따라 움직이게 한다.
 * - 컴포넌트가 사라질 때 타이머를 정리(clearInterval)해 메모리 누수를 막는다.
 */
import { useEffect, useState } from "react";

export function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
