/*
 * 프리셋 사이드바.
 * - 데스크톱: 화면 왼쪽에 항상 붙어 있는 레일(rail).
 * - 모바일: 평소엔 숨어 있다가 햄버거(☰)를 누르면 왼쪽에서 슬라이드로 나오는 드로어(drawer).
 *   → open 값에 따라 .open 클래스가 붙고, 실제 표시/숨김은 CSS 미디어쿼리에서 처리한다.
 * - 각 프리셋 항목의 ⋯ 메뉴로 이름 변경 / 복제 / 순서 이동 / 삭제를 할 수 있다.
 */
import { useState } from "react";
import type { Preset } from "../types";
import { NoticeToggle } from "./NoticeToggle";

interface Props {
  presets: Preset[];
  selectedId: string;
  open: boolean; // 모바일 드로어 열림 여부
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void; // -1=위로, +1=아래로
  onClose: () => void; // 드로어 닫기 (모바일)
}

export function PresetSidebar({
  presets,
  selectedId,
  open,
  onSelect,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
  onMove,
  onClose,
}: Props) {
  // 현재 ⋯ 메뉴가 열려 있는 프리셋 id (없으면 null)
  const [menuId, setMenuId] = useState<string | null>(null);

  return (
    <>
      {/* 모바일 드로어 뒤 어둑한 배경. 누르면 닫힌다. */}
      <div
        className={"sidebar-backdrop" + (open ? " show" : "")}
        onClick={onClose}
      />

      <aside className={"sidebar" + (open ? " open" : "")}>
        <div className="sidebar-head">
          <span className="sidebar-title">프리셋</span>
          {/* 모바일에서만 보이는 닫기 버튼 */}
          <button className="sidebar-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="sidebar-list">
          {presets.map((p, i) => (
            <div
              key={p.id}
              className={"preset-item" + (p.id === selectedId ? " active" : "")}
            >
              <button
                className="name"
                title={p.label}
                onClick={() => {
                  onSelect(p.id);
                  onClose(); // 모바일에선 선택 후 드로어를 닫아준다
                }}
              >
                {p.label}
              </button>

              <button
                className={"menu-btn" + (menuId === p.id ? " open" : "")}
                aria-label="프리셋 메뉴"
                onClick={() => setMenuId(menuId === p.id ? null : p.id)}
              >
                ⋯
              </button>

              {menuId === p.id && (
                <div className="preset-menu">
                  <button onClick={() => { setMenuId(null); onRename(p.id); }}>
                    이름 변경
                  </button>
                  <button onClick={() => { setMenuId(null); onDuplicate(p.id); }}>
                    복제
                  </button>
                  <button
                    disabled={i === 0}
                    onClick={() => { setMenuId(null); onMove(p.id, -1); }}
                  >
                    위로
                  </button>
                  <button
                    disabled={i === presets.length - 1}
                    onClick={() => { setMenuId(null); onMove(p.id, 1); }}
                  >
                    아래로
                  </button>
                  <button
                    className="danger"
                    onClick={() => { setMenuId(null); onDelete(p.id); }}
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <button className="btn sidebar-add" onClick={onAdd}>
          + 새 프리셋
        </button>

        {/* 상시 알림은 지금 보고 있는 시간표를 따라간다 (안드로이드 앱에서만 보임).
            무엇을 넘길지는 NoticeProvider 가 스스로 판단하므로 여기서 프리셋을 건네지 않는다. */}
        <NoticeToggle />
      </aside>
    </>
  );
}
