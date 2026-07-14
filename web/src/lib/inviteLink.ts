/*
 * 조직 초대 링크.
 *
 * 왜 링크인가: 8자리 코드를 사람이 불러주고 받아 적게 하는 건 번거롭다.
 *   카톡방에 링크 하나 던지면 끝나야 한다.
 *
 * 왜 그래도 승인이 필요한가: **링크는 아는 사람이면 누구나 쓸 수 있다.**
 *   카톡방에 뿌린 링크가 밖으로 새면 모르는 사람이 팀 시간표를 본다.
 *   그래서 링크로 들어오면 '가입'이 아니라 '가입 신청'이 되고, 관리자가 승인해야 조직원이 된다.
 *   (승인 판정은 화면이 아니라 DB 의 RLS 가 한다 — org-schema.sql 의 is_org_member)
 */

// 링크에 코드를 싣는 쿼리 이름. AndroidManifest 처럼 여러 곳에 흩어지지 않게 한곳에 둔다.
const JOIN_PARAM = "join";

/** 초대 링크를 만든다. (예: https://…/?join=A1B2C3D4) */
export function buildInviteLink(inviteCode: string): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set(JOIN_PARAM, inviteCode);
  return url.toString();
}

/** 지금 주소에 초대 코드가 실려 있으면 꺼낸다. */
export function readInviteCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get(JOIN_PARAM);
  return code ? code.trim().toUpperCase() : null;
}

/**
 * 주소창에서 초대 코드를 지운다.
 * 처리한 뒤에도 남겨두면, 새로고침할 때마다 가입 신청이 다시 나가고
 * 뒤로가기로도 계속 되돌아온다.
 */
export function clearInviteCodeFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(JOIN_PARAM);
  window.history.replaceState({}, "", url.toString());
}

/**
 * 초대 링크를 공유한다.
 *
 * 카카오 SDK 를 쓰지 않는 이유:
 *   앱 키 발급/도메인 등록/스크립트 로딩이 붙는데, 폰에서는 Web Share 를 띄우면
 *   **공유 대상 목록에 카카오톡이 그대로 나온다.** 목적(카톡으로 보내기)은 이미 달성된다.
 *   PC 나 미지원 브라우저에서는 클립보드 복사로 떨어진다.
 *
 * @returns 어떻게 처리됐는지 (화면에 알려주기 위함)
 */
export async function shareInviteLink(
  orgName: string,
  inviteCode: string
): Promise<"shared" | "copied" | "failed"> {
  const link = buildInviteLink(inviteCode);
  const text = `[일정공방] '${orgName}' 조직에 초대합니다.\n아래 링크로 참여해주세요.`;

  // 1) 폰: 공유 시트 (여기에 카카오톡이 뜬다)
  if (navigator.share) {
    try {
      await navigator.share({ title: "일정공방 조직 초대", text, url: link });
      return "shared";
    } catch (e) {
      // 사용자가 공유 시트를 닫은 것도 여기로 온다 — 실패가 아니므로 복사로 넘어가지 않는다.
      if (e instanceof Error && e.name === "AbortError") return "shared";
      // 그 외 오류는 복사로 대체한다.
    }
  }

  // 2) PC: 클립보드 복사
  try {
    await navigator.clipboard.writeText(`${text}\n${link}`);
    return "copied";
  } catch (e) {
    console.error("[Org] 초대 링크 복사 실패", e);
    return "failed";
  }
}
