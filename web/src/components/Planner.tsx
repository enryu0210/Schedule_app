/*
 * 로그인한 사용자에게 보여주는 메인 계획표 화면.
 * - 왼쪽 사이드바(PresetSidebar)로 프리셋을 관리한다:
 *     데스크톱은 항상 보이는 레일, 모바일은 햄버거(☰)로 여는 드로어.
 * - 편집은 "상시 편집" 방식이다: 편집 모드 토글 없이 블록을 바로 눌러 수정하고,
 *   카드 하단 "빠른 추가" 한 줄로 즉시 블록을 만든다. (저장은 클라우드 자동 저장)
 * - 프리셋이 하나도 없으면(신규 사용자) "빈 상태" 안내와 첫 프리셋 만들기 버튼을 보여준다.
 */
import { useState } from "react";
import type { Preset, ScheduleBlock } from "../types";
import { createEmptyPreset } from "../data/defaultPreset";
import { createId } from "../lib/id";
import { jsDayToMondayIndex, toMinutes } from "../lib/time";
import { useNow } from "../hooks/useNow";
import { usePresetStore } from "../hooks/usePresetStore";
import { PresetSidebar } from "./PresetSidebar";
import { DayTabs } from "./DayTabs";
import { ScheduleCard } from "./ScheduleCard";
import { BlockEditor } from "./BlockEditor";
import { oneHourLater } from "./QuickAddRow";
import { NameDialog } from "./NameDialog";
import { AuthBar } from "./AuthBar";

export function Planner() {
  const { presets, setPresets, selectedPresetId, setSelectedPresetId, loaded } =
    usePresetStore();

  // 현재 시각(30초마다 갱신) → 오늘 요일 / 지금 할 일 하이라이트에 사용.
  const now = useNow();
  const todayIdx = jsDayToMondayIndex(now.getDay());
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(todayIdx);

  // 모달/드로어 상태
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);
  const [showBlockEditor, setShowBlockEditor] = useState(false);
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null); // 이름 변경 중인 프리셋
  const [sidebarOpen, setSidebarOpen] = useState(false);             // 모바일 드로어 열림 여부

  // ── 프리셋 조작 ─────────────────────────────
  function handleAddPreset(label: string) {
    const preset = createEmptyPreset(label);
    setPresets((prev) => [...prev, preset]);
    setSelectedPresetId(preset.id); // 새로 만든 프리셋으로 바로 전환
    setShowPresetDialog(false);
  }

  // 프리셋 이름 변경.
  function handleRenamePreset(label: string) {
    if (!renamingId) return;
    setPresets((prev) =>
      prev.map((p) => (p.id === renamingId ? { ...p, label } : p))
    );
    setRenamingId(null);
  }

  // 프리셋 복제. days/blocks 를 깊게 복사하면서 새 id 를 부여해 원본과 독립시킨다.
  function handleDuplicatePreset(id: string) {
    const src = presets.find((p) => p.id === id);
    if (!src) return;
    const copy: Preset = {
      id: createId(),
      label: src.label + " 복사본",
      days: src.days.map((d) => ({
        ...d,
        blocks: d.blocks.map((b) => ({ ...b, id: createId() })),
      })),
    };
    // 원본 바로 아래에 끼워 넣는다.
    setPresets((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setSelectedPresetId(copy.id); // 복제본으로 전환
  }

  // 프리셋 순서 이동. dir: -1(위로) / +1(아래로). 이웃과 자리를 맞바꾼다.
  function handleMovePreset(id: string, dir: -1 | 1) {
    setPresets((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  // 프리셋 삭제. (실수 방지를 위해 한 번 확인)
  function handleDeletePreset(id: string) {
    const target = presets.find((p) => p.id === id);
    if (!target) return;
    const ok = window.confirm(`'${target.label}' 프리셋을 삭제할까요? 되돌릴 수 없습니다.`);
    if (!ok) return;
    setPresets((prev) => prev.filter((p) => p.id !== id));
    // 선택 중이던 프리셋을 지웠다면 선택을 비운다.
    // (아래 렌더에서 남은 프리셋의 첫 번째가 자동으로 선택되고, 없으면 빈 상태로 전환됨)
    if (id === selectedPresetId) setSelectedPresetId(null);
  }

  // 특정 요일의 blocks 를 업데이트하는 공통 헬퍼. 불변성을 지켜 새 객체로 갈아끼운다.
  function updateDayBlocks(
    presetId: string,
    updater: (blocks: ScheduleBlock[]) => ScheduleBlock[]
  ) {
    setPresets((prev) =>
      prev.map((p) => {
        if (p.id !== presetId) return p;
        const days = p.days.map((d, i) =>
          i === selectedDayIdx ? { ...d, blocks: updater(d.blocks) } : d
        );
        return { ...p, days };
      })
    );
  }

  const clockText =
    now.toLocaleDateString("ko-KR", { month: "long", day: "numeric" }) +
    "  " +
    now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

  // 클라우드 로딩 중에는 잠깐 로딩 표시 (빈 화면 깜빡임 방지)
  if (!loaded) {
    return (
      <div className="wrap">
        <div className="auth-row"><AuthBar /></div>
        <div className="loading-hint">불러오는 중…</div>
      </div>
    );
  }

  // ── 빈 상태: 프리셋이 하나도 없는 신규 사용자 ──
  if (presets.length === 0) {
    return (
      <div className="wrap">
        <div className="auth-row"><AuthBar /></div>
        <div className="empty-state">
          <div className="empty-state-emoji">🗓️</div>
          <h2>아직 계획표가 없어요</h2>
          <p>상황별(방학·학기중·휴가 등) 주간 시간표를<br />프리셋으로 만들어 관리해보세요.</p>
          <button className="btn primary" onClick={() => setShowPresetDialog(true)}>
            + 첫 프리셋 만들기
          </button>
        </div>
        {showPresetDialog && (
          <NameDialog
            title="새 프리셋 이름"
            placeholder="예: 방학, 학기중, 휴가"
            onSubmit={handleAddPreset}
            onCancel={() => setShowPresetDialog(false)}
          />
        )}
      </div>
    );
  }

  // ── 정상 상태: 선택된 프리셋의 시간표를 보여준다 ──
  const currentPreset = presets.find((p) => p.id === selectedPresetId) ?? presets[0];
  const currentDay = currentPreset.days[selectedDayIdx];
  // 이름 변경 대화상자에 채워 넣을 현재 이름.
  const renamingPreset = renamingId ? presets.find((p) => p.id === renamingId) : null;

  function handleSaveBlock(block: ScheduleBlock) {
    updateDayBlocks(currentPreset.id, (blocks) => {
      const exists = blocks.some((b) => b.id === block.id);
      const next = exists
        ? blocks.map((b) => (b.id === block.id ? block : b))
        : [...blocks, block];
      return sortBlocks(next);
    });
    setShowBlockEditor(false);
    setEditingBlock(null);
  }

  function handleDeleteBlock(blockId: string) {
    // 상시 편집이라 실수로 지우는 것을 막기 위해 한 번 확인한다.
    if (!window.confirm("이 블록을 삭제할까요?")) return;
    updateDayBlocks(currentPreset.id, (blocks) => blocks.filter((b) => b.id !== blockId));
  }

  // 빠른 추가: 시작 시각 + 이름만 받아 종료(=시작+1시간)/색상 기본값으로 블록을 만든다.
  function handleQuickAdd(start: string, label: string) {
    const block: ScheduleBlock = {
      id: createId(),
      start,
      end: oneHourLater(start),
      label,
      color: "neutral",
    };
    updateDayBlocks(currentPreset.id, (blocks) => sortBlocks([...blocks, block]));
  }

  return (
    <div className="app-shell">
      <PresetSidebar
        presets={presets}
        selectedId={currentPreset.id}
        open={sidebarOpen}
        onSelect={setSelectedPresetId}
        onAdd={() => { setSidebarOpen(false); setShowPresetDialog(true); }}
        onRename={(id) => setRenamingId(id)}
        onDuplicate={handleDuplicatePreset}
        onDelete={handleDeletePreset}
        onMove={handleMovePreset}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="wrap">
        <div className="auth-row">
          {/* 모바일에서만 보이는 사이드바 열기 버튼 */}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(true)}
            aria-label="프리셋 열기"
          >
            ☰
          </button>
          <AuthBar />
        </div>

        <div className="top">
          <h1>{currentPreset.label} 주간 계획표</h1>
          <div className="clock">{clockText}</div>
        </div>

        <DayTabs
          days={currentPreset.days}
          selectedIdx={selectedDayIdx}
          todayIdx={todayIdx}
          onSelect={setSelectedDayIdx}
        />

        <ScheduleCard
          day={currentDay}
          dayId={`${currentPreset.id}:${selectedDayIdx}`}
          isToday={selectedDayIdx === todayIdx}
          nowMin={nowMin}
          onEditBlock={(b) => {
            setEditingBlock(b);
            setShowBlockEditor(true);
          }}
          onDeleteBlock={handleDeleteBlock}
          onQuickAdd={handleQuickAdd}
        />

        <div className="actions">
          {/* 색상·종료 시각까지 지정하는 상세 추가는 모달로 */}
          <button
            className="btn"
            onClick={() => {
              setEditingBlock(null);
              setShowBlockEditor(true);
            }}
          >
            + 상세 추가
          </button>
        </div>
      </div>

      {showBlockEditor && (
        <BlockEditor
          initial={editingBlock}
          onSave={handleSaveBlock}
          onCancel={() => {
            setShowBlockEditor(false);
            setEditingBlock(null);
          }}
        />
      )}

      {showPresetDialog && (
        <NameDialog
          title="새 프리셋 이름"
          placeholder="예: 학기중, 휴가"
          onSubmit={handleAddPreset}
          onCancel={() => setShowPresetDialog(false)}
        />
      )}

      {renamingPreset && (
        <NameDialog
          title="프리셋 이름 변경"
          initial={renamingPreset.label}
          onSubmit={handleRenamePreset}
          onCancel={() => setRenamingId(null)}
        />
      )}
    </div>
  );
}

// 블록을 시작 시각 순으로 정렬한다.
function sortBlocks(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return [...blocks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}
