/*
 * 개인 ↔ 조직 작업 공간 전환.
 *
 * 이 전환은 단순한 화면 이동이 아니라 **프라이버시 경계선**이다.
 * 개인 공간의 프리셋은 조직에 절대 보이지 않는다. 조직에 보이는 것은
 * 사용자가 조직 공간에서 직접 "공유"를 누른 시간표뿐이다.
 * 그래서 지금 어느 공간에 있는지 항상 눈에 보여야 한다.
 */
import { useOrg } from "../hooks/useOrg";

interface Props {
  // "조직 만들기 / 참여하기" 를 눌렀을 때 (모달은 부모가 연다)
  onAddOrg: () => void;
}

export function WorkspaceSwitcher({ onAddOrg }: Props) {
  const { orgs, workspace, setWorkspace } = useOrg();

  const value = workspace.kind === "personal" ? "personal" : workspace.orgId;

  function handleChange(next: string) {
    if (next === "__add__") {
      onAddOrg();
      return;
    }
    if (next === "personal") {
      setWorkspace({ kind: "personal" });
      return;
    }
    setWorkspace({ kind: "org", orgId: next });
  }

  return (
    <label className="workspace-switcher">
      <span className="workspace-switcher-label">공간</span>
      <select
        className="workspace-select"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="작업 공간 선택"
      >
        <option value="personal">🔒 개인 계획표</option>
        {orgs.length > 0 && (
          <optgroup label="조직">
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                👥 {org.name}
              </option>
            ))}
          </optgroup>
        )}
        <option value="__add__">+ 조직 만들기 / 참여하기</option>
      </select>
    </label>
  );
}
