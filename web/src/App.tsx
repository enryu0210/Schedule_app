/*
 * 앱의 최상위 컴포넌트. 상태(프리셋 목록/선택/편집)를 소유하고 하위 컴포넌트에 내려준다.
 *
 * 데이터 흐름 요약:
 *   presets(전체) → 선택된 preset → 선택된 요일(day) → 블록들
 *   상태가 바뀔 때마다 localStorage 에 자동 저장(useEffect).
 */
import { useEffect, useMemo, useState } from "react";
import type { Preset, ScheduleBlock } from "./types";
import { loadState, saveState } from "./lib/storage";
import { createEmptyPreset } from "./data/defaultPreset";
import { jsDayToMondayIndex, toMinutes } from "./lib/time";
import { useNow } from "./hooks/useNow";
import { PresetBar } from "./components/PresetBar";
import { DayTabs } from "./components/DayTabs";
import { ScheduleCard } from "./components/ScheduleCard";
import { BlockEditor } from "./components/BlockEditor";
import { NameDialog } from "./components/NameDialog";

export default function App() {
  // 최초 1회 localStorage 에서 상태를 읽어온다.
  const initial = useMemo(() => loadState(), []);
  const [presets, setPresets] = useState<Preset[]>(initial.presets);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(initial.selectedPresetId);

  // 현재 시각(30초마다 갱신) → 오늘 요일 / 지금 할 일 하이라이트에 사용.
  const now = useNow();
  const todayIdx = jsDayToMondayIndex(now.getDay());
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // 선택된 요일 (기본값은 오늘 요일)
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(todayIdx);

  // 편집 모드 및 열려 있는 모달 상태
  const [editMode, setEditMode] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);
  const [showBlockEditor, setShowBlockEditor] = useState(false);
  const [showPresetDialog, setShowPresetDialog] = useState(false);

  // 상태가 바뀔 때마다 저장. (로컬 우선 저장 지점)
  useEffect(() => {
    saveState(presets, selectedPresetId);
  }, [presets, selectedPresetId]);

  // 현재 선택된 프리셋. (없을 경우 방어적으로 첫 번째 사용)
  const currentPreset = presets.find((p) => p.id === selectedPresetId) ?? presets[0];
  const currentDay = currentPreset.days[selectedDayIdx];

  // ── 프리셋 조작 ─────────────────────────────
  function handleAddPreset(label: string) {
    const preset = createEmptyPreset(label);
    setPresets((prev) => [...prev, preset]);
    setSelectedPresetId(preset.id); // 새로 만든 프리셋으로 바로 전환
    setShowPresetDialog(false);
  }

  // ── 블록 조작 (선택된 프리셋의 선택된 요일에 반영) ──
  // 특정 요일의 blocks 를 업데이트하는 공통 헬퍼. 불변성을 지켜 새 객체로 갈아끼운다.
  function updateDayBlocks(updater: (blocks: ScheduleBlock[]) => ScheduleBlock[]) {
    setPresets((prev) =>
      prev.map((p) => {
        if (p.id !== currentPreset.id) return p;
        const days = p.days.map((d, i) =>
          i === selectedDayIdx ? { ...d, blocks: updater(d.blocks) } : d
        );
        return { ...p, days };
      })
    );
  }

  function handleSaveBlock(block: ScheduleBlock) {
    updateDayBlocks((blocks) => {
      const exists = blocks.some((b) => b.id === block.id);
      // 편집이면 교체, 신규면 추가한 뒤 시작시간 순으로 정렬한다.
      const next = exists
        ? blocks.map((b) => (b.id === block.id ? block : b))
        : [...blocks, block];
      return sortBlocks(next);
    });
    setShowBlockEditor(false);
    setEditingBlock(null);
  }

  function handleDeleteBlock(blockId: string) {
    updateDayBlocks((blocks) => blocks.filter((b) => b.id !== blockId));
  }

  function openAddBlock() {
    setEditingBlock(null);
    setShowBlockEditor(true);
  }

  function openEditBlock(block: ScheduleBlock) {
    setEditingBlock(block);
    setShowBlockEditor(true);
  }

  // 시계 문자열 (예: "7월 13일  09:24")
  const clockText =
    now.toLocaleDateString("ko-KR", { month: "long", day: "numeric" }) +
    "  " +
    now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="wrap">
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
        onEditBlock={openEditBlock}
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
          <button className="btn" onClick={openAddBlock}>+ 블록 추가</button>
        )}
      </div>

      {/* 블록 추가/편집 모달 */}
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

      {/* 새 프리셋 이름 입력 모달 */}
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

// 블록을 시작 시각 순으로 정렬한다. (시간 계산은 lib/time 의 toMinutes 재사용)
function sortBlocks(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return [...blocks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}
