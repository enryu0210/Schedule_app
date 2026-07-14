/*
 * 조직 만들기 / 초대 코드로 참여하기 모달.
 *
 * 초대를 이메일로 하지 않는 이유:
 *   카카오 로그인은 이메일 없이도 가입이 된다(콘솔에서 "이메일 없는 사용자 허용"을 켜뒀다).
 *   즉 이메일이 아예 없는 사용자가 존재한다 → 이메일 초대는 그 사람들을 배제한다.
 *   그래서 8자리 초대 코드를 알려주고 입력하게 하는 방식을 쓴다.
 */
import { useState } from "react";
import { useOrg } from "../hooks/useOrg";

type Tab = "create" | "join";

interface Props {
  onClose: () => void;
}

export function OrgDialog({ onClose }: Props) {
  const { createOrg, joinOrg } = useOrg();

  const [tab, setTab] = useState<Tab>("create");
  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  // 서버 왕복 중 버튼을 두 번 눌러 조직이 두 개 생기는 사고를 막는다.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      if (tab === "create") {
        if (!orgName.trim()) throw new Error("조직 이름을 입력해주세요.");
        await createOrg(orgName.trim(), displayName.trim());
      } else {
        if (!inviteCode.trim()) throw new Error("초대 코드를 입력해주세요.");
        await joinOrg(inviteCode.trim(), displayName.trim());
      }
      onClose();
    } catch (err) {
      // 실패 원인을 그대로 보여준다 — "초대 코드가 올바르지 않습니다" 같은 메시지는
      // DB 함수가 한국어로 돌려주므로 사용자가 바로 이해할 수 있다.
      const message =
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>조직 워크스페이스</h3>

        <div className="org-tabs">
          <button
            type="button"
            className={"org-tab" + (tab === "create" ? " active" : "")}
            onClick={() => { setTab("create"); setError(null); }}
          >
            새로 만들기
          </button>
          <button
            type="button"
            className={"org-tab" + (tab === "join" ? " active" : "")}
            onClick={() => { setTab("join"); setError(null); }}
          >
            초대 코드로 참여
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {tab === "create" ? (
            <label className="field">
              <span>조직 이름</span>
              <input
                autoFocus
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="예: 연구실, 마케팅팀"
              />
            </label>
          ) : (
            <label className="field">
              <span>초대 코드</span>
              <input
                autoFocus
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="예: A1B2C3D4"
                maxLength={8}
              />
            </label>
          )}

          <label className="field">
            <span>조직에서 쓸 내 이름</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="예: 김민수 (비우면 기본값)"
            />
          </label>

          {error && <div className="org-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              취소
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "처리 중…" : tab === "create" ? "조직 만들기" : "참여하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
