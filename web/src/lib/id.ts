/*
 * 간단한 고유 id 생성기.
 * - crypto.randomUUID 가 있으면 그걸 쓰고, 구형 환경이면 시간+난수로 대체한다.
 * - 별도 라이브러리(uuid 등) 없이 처리해 의존성을 최소화했다.
 */
export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
