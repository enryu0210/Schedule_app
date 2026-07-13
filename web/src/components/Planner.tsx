/*
 * 로그인한 사용자에게 보여주는 메인 계획표 화면.
 * - 프리셋/요일/블록 상태를 다루고 편집 기능을 제공한다.
 * - 프리셋이 하나도 없으면(신규 사용자) "빈 상태" 안내와 첫 프리셋 만들기 버튼을 보여준다.
 */
import { useState } from "react";
import type { ScheduleBlock } from "../types";
import { createEmptyPreset } from "../data/defaultPreset";
import { jsDayToMondayIndex, toMinutes } from "../lib/time";
import { useNow } from "../hooks/useNow";
import { usePresetStore } from "../hooks/usePresetStore";
import { PresetBar } from "./PresetBar";
import { DayTabs } from "./DayTabs";
import { ScheduleCard } from "./ScheduleCard";
import { BlockEditor } from "./BlockEditor";
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

  // 편집 모드 및 모달 상태
  const [editMode, setEditMode] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);
  const [showBlockEditor, setShowBlockEditor] = useState(false);
  const [showPresetDialog, setShowPresetDialog] = useState(false);

  // ── 프리셋 조작 ─────────────────────────────
  function handleAddPreset(label: string) {
    const preset = createEmptyPreset(label);
    setPresets((prev) => [...prev, preset]);
    setSelectedPresetId(preset.id); // 새로 만든 프리셋으로 바로 전환
    setShowPresetDialog(false);
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
    updateDayBlocks(currentPreset.id, (blocks) => blocks.filter((b) => b.id !== blockId));
  }

  // 현재 프리셋 삭제. (실수 방지를 위해 한 번 확인)
  function handleDeletePreset() {
    const ok = window.confirm(`'${currentPreset.label}' 프리셋을 삭제할까요? 되돌릴 수 없습니다.`);
    if (!ok) return;
    setPresets((prev) => prev.filter((p) => p.id !== currentPreset.id));
    // 선택을 비우면 아래에서 남은 프리셋의 첫 번째가 자동으로 선택된다.
    // (남은 게 없으면 빈 상태 화면으로 전환됨)
    setSelectedPresetId(null);
  }

  return (
    <div className="wrap">
      <div className="auth-row"><AuthBar /></div>

      <div className="top">
        <h1>{currentPreset.label} 주간 계획표</h1>
        <div className="clock">{clockText}</div>
      </div>

      <PresetBar
        presets={presets}
        selectedId={currentPreset.id}
        onSelect={setSelectedPresetId}
        onAdd={() => setShowPresetDialog(true)}
      />

      <DayTabs
        days={currentPreset.days}
        selectedIdx={selectedDayIdx}
        todayIdx={todayIdx}
        onSelect={setSelectedDayIdx}
      />

      <ScheduleCard
        day={currentDay}
        isToday={selectedDayIdx === todayIdx}
        nowMin={nowMin}
        editMode={editMode}
        onEditBlock={(b) => {
          setEditingBlock(b);
          setShowBlockEditor(true);
        }}
        onDeleteBlock={handleDeleteBlock}
      />

      <div className="actions">
        <button
          className={"btn" + (editMode ? " primary" : "")}
          onClick={() => setEditMode((v) => !v)}
        >
          {editMode ? "편집 완료" : "편집"}
        </button>
        {editMode && (
          <button
            className="btn"
            onClick={() => {
              setEditingBlock(null);
              setShowBlockEditor(true);
            }}
          >
            + 블록 추가
          </button>
        )}
        {editMode && (
          // 편집 모드에서만 프리셋 삭제 노출 (실수 방지)
          <button className="btn ghost danger" onClick={handleDeletePreset}>
            프리셋 삭제
          </button>
        )}
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
    </div>
  );
}

// 블록을 시작 시각 순으로 정렬한다.
function sortBlocks(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return [...blocks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}
