/*
 * 이름 하나만 입력받는 간단한 모달. (새 프리셋 이름 입력 등에 재사용)
 */
import { useState } from "react";

interface Props {
  title: string;
  placeholder?: string;
  initial?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function NameDialog({ title, placeholder, initial, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initial ?? "");

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return; // 빈 이름은 무시
    onSubmit(trimmed);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="field">
          <input
            type="text"
            value={value}
            placeholder={placeholder}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>취소</button>
          <button className="btn primary" onClick={handleSubmit}>확인</button>
        </div>
      </div>
    </div>
  );
}
