/*
 * 조직 초대 모달.
 *
 * 왜 모달인가:
 *   초대는 가끔 하는 동작인데 링크·코드·버튼을 헤더에 상시로 붙여뒀더니
 *   긴 링크가 제목·시계와 같은 줄을 밀어내 **레이아웃이 깨졌다**(실제로 겪음).
 *   헤더에는 버튼 하나만 두고, 내용은 눌렀을 때만 펼친다.
 *
 * 여기서 지키는 원칙:
 *   - 링크를 **항상 눈에 보이게** 둔다. 공유·복사가 어떤 이유로든 실패해도
 *     손으로 복사할 길이 남아야 한다(http 접속·권한 차단이면 클립보드 API 자체가 없다).
 *   - 어떤 결과든 화면에 말해준다. 조용히 끝나는 경로가 있으면 버튼이 고장 난 줄 안다.
 */
import { useState } from "react";
import type { Organization } from "../types";
import { buildInviteLink, shareInviteLink } from "../lib/inviteLink";

interface Props {
  org: Organization;
  onClose: () => void;
}

export function InviteDialog({ org, onClose }: Props) {
  const [message, setMessage] = useState("");
  const link = buildInviteLink(org.inviteCode);

  async function handleShare() {
    const result = await shareInviteLink(org.name, org.inviteCode);
    setMessage(
      result === "shared"
        ? "공유했어요."
        : result === "cancelled"
        ? "공유를 취소했어요."
        : result === "copied"
        ? "초대 링크를 복사했어요. 카카오톡에 붙여넣으세요."
        : "복사에 실패했어요. 아래 링크를 직접 복사해 주세요."
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{org.name} 초대하기</h3>

        <p className="org-hint">
          링크를 받은 사람은 <b>참여 신청</b>만 할 수 있고,
          관리자가 승인해야 팀 시간표를 볼 수 있습니다.
        </p>

        <label className="field">
          <span>초대 링크</span>
          <input
            className="invite-link"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>

        <div className="invite-code-row">
          링크가 막히면 초대 코드를 직접 알려주세요: <code>{org.inviteCode}</code>
        </div>

        {message && <div className="invite-msg">{message}</div>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button className="btn primary" onClick={handleShare}>
            카카오톡으로 초대
          </button>
        </div>
      </div>
    </div>
  );
}
