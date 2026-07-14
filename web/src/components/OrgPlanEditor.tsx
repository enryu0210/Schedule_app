/*
 * 조직 공용 시간표 편집기 (관리자 전용).
 *
 * 왜 여기서 직접 짜게 하는가:
 *   처음에는 "개인 프리셋을 만들어 조직에 배포"하는 방식이었는데,
 *   조직 시간표를 짜려고 내 개인 계획표에 먼저 만들어야 하는 건 순서가 억지스럽다.
 *   (내 개인 프리셋 목록이 조직용 초안으로 지저분해지기도 한다)
 *   → 조직 페이지에서 바로 짜고, 고치는 즉시 배포되게 한다.
 *
 * 저장 방식: 개인 계획표와 똑같이 **자동 저장**이다. 별도의 '배포' 버튼이 없다.
 *   단, 서버에 매 키 입력마다 쓰지 않도록 잠깐 모았다가(디바운스) 한 번 보낸다.
 */
import { useEffect, useRef, useState } from "react";
import type { Preset, ScheduleBlock } from "../types";
import { createEmptyPreset } from "../data/defaultPreset";
import { toMinutes } from "../lib/time";
import { BlockEditor } from "./BlockEditor";
import { WeekGrid } from "./WeekGrid";

// 편집을 멈춘 뒤 이만큼 지나면 저장한다. 드래그 한 번에 여러 번 저장되는 것을 막는다.
const SAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "failed";

interface Props {
  // 이미 배포된 조직 시간표. 아직 없으면 null (빈 시간표부터 시작한다).
  plan: Preset | null;
  todayIdx: number;
  nowMin: number;
  onSave: (plan: Preset) => Promise<void>;
}

export function OrgPlanEditor({ plan, todayIdx, nowMin, onSave }: Props) {
  // 화면에서 편집 중인 초안. 서버 값(plan)을 그대로 쓰면 타이핑할 때마다 되돌아간다.
  const [draft, setDraft] = useState<Preset>(
    () => plan ?? createEmptyPreset("조직 시간표")
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);
  const [editorStart, setEditorStart] = useState<string | undefined>(undefined);
  const [editingDayIdx, setEditingDayIdx] = useState(0);
  const [showEditor, setShowEditor] = useState(false);

  // 내가 고친 적이 있는지. 서버에서 새 값이 내려와도 편집 중이면 덮어쓰지 않는다.
  // (다른 관리자가 동시에 고치는 상황에서 내 입력이 사라지면 최악이다)
  const dirty = useRef(false);
  const saveTimer = useRef<number | null>(null);

  // 아직 한 번도 안 고쳤다면 서버 값을 따라간다(다른 기기에서 고친 내용 반영).
  useEffect(() => {
    if (dirty.current) return;
    if (plan) setDraft(plan);
  }, [plan]);

  // 초안이 바뀌면 잠깐 기다렸다가 저장한다.
  useEffect(() => {
    if (!dirty.current) return;

    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    setSaveState("saving");

    saveTimer.current = window.setTimeout(() => {
      onSave(draft)
        .then(() => setSaveState("saved"))
        .catch((e) => {
          // 저장 실패를 조용히 넘기면 관리자는 배포된 줄 알고 화면을 닫는다.
          console.error("[Org] 조직 시간표 저장 실패", e);
          setSaveState("failed");
        });
    }, SAVE_DELAY_MS);

    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [draft, onSave]);

  // 초안을 고치는 유일한 통로. 여기를 거쳐야 dirty 표시와 자동 저장이 걸린다.
  function updateDraft(next: (prev: Preset) => Preset) {
    dirty.current = true;
    setDraft(next);
  }

  function updateDayBlocks(
    dayIdx: number,
    updater: (blocks: ScheduleBlock[]) => ScheduleBlock[]
  ) {
    updateDraft((prev) => ({
      ...prev,
      days: prev.days.map((d, i) =>
        i === dayIdx ? { ...d, blocks: updater(d.blocks) } : d
      ),
    }));
  }

  function handleSaveBlock(block: ScheduleBlock) {
    updateDayBlocks(editingDayIdx, (blocks) => {
      const exists = blocks.some((b) => b.id === block.id);
      const next = exists
        ? blocks.map((b) => (b.id === block.id ? block : b))
        : [...blocks, block];
      return sortBlocks(next);
    });
    closeEditor();
  }

  function handleDeleteBlock(blockId: string) {
    updateDayBlocks(editingDayIdx, (blocks) => blocks.filter((b) => b.id !== blockId));
    closeEditor();
  }

  // 드래그로 옮기거나 길이를 바꿨을 때. 요일이 바뀔 수 있어 원래 요일에서 빼고 새 요일에 넣는다.
  function handleMoveBlock(
    fromDayIdx: number,
    blockId: string,
    toDayIdx: number,
    start: string,
    end: string
  ) {
    updateDraft((prev) => {
      const days = prev.days.map((d) => ({ ...d, blocks: [...d.blocks] }));
      const idx = days[fromDayIdx].blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return prev; // 방어: 이미 사라진 블록

      const [block] = days[fromDayIdx].blocks.splice(idx, 1);
      days[toDayIdx].blocks = sortBlocks([
        ...days[toDayIdx].blocks,
        { ...block, start, end },
      ]);
      return { ...prev, days };
    });
  }

  function closeEditor() {
    setShowEditor(false);
    setEditingBlock(null);
    setEditorStart(undefined);
  }

  return (
    <section>
      <div className="org-plan-bar">
        <input
          className="org-plan-title"
          value={draft.label}
          onChange={(e) =>
            updateDraft((prev) => ({ ...prev, label: e.target.value }))
          }
          placeholder="조직 시간표 이름"
          aria-label="조직 시간표 이름"
        />
        <span className={"save-state " + saveState}>
          {saveState === "saving"
            ? "저장 중…"
            : saveState === "saved"
            ? "배포됨 ✓"
            : saveState === "failed"
            ? "저장 실패 — 다시 시도해주세요"
            : ""}
        </span>
      </div>

      <p className="org-hint">
        빈 칸을 눌러 일정을 추가하고, 블록을 끌어 옮기세요.
        고치는 즉시 팀원 화면에 반영됩니다.
      </p>

      <WeekGrid
        days={draft.days}
        todayIdx={todayIdx}
        nowMin={nowMin}
        onEditBlock={(dayIdx, block) => {
          setEditingDayIdx(dayIdx);
          setEditingBlock(block);
          setEditorStart(undefined);
          setShowEditor(true);
        }}
        onAddBlockAt={(dayIdx, start) => {
          setEditingDayIdx(dayIdx);
          setEditingBlock(null);
          setEditorStart(start);
          setShowEditor(true);
        }}
        onMoveBlock={handleMoveBlock}
      />

      {showEditor && (
        <BlockEditor
          initial={editingBlock}
          defaultStart={editorStart}
          onSave={handleSaveBlock}
          onDelete={handleDeleteBlock}
          onCancel={closeEditor}
        />
      )}
    </section>
  );
}

// 블록을 시작 시각 순으로 정렬한다. (WeekGrid 가 정렬된 순서를 가정한다)
function sortBlocks(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return [...blocks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}
