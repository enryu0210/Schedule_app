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
import { jsDayToMondayIndex, oneHourLater, toMinutes } from "../lib/time";
import { useNow } from "../hooks/useNow";
import { usePresets } from "../hooks/usePresetStore";
import { useSharedScheduleSync } from "../hooks/useSharedScheduleSync";
import { useViewMode } from "../hooks/useViewMode";
import { PresetSidebar } from "./PresetSidebar";
import { DayTabs } from "./DayTabs";
import { ScheduleCard } from "./ScheduleCard";
import { WeekGrid } from "./WeekGrid";
import { ViewToggle } from "./ViewToggle";
import { BlockEditor } from "./BlockEditor";
import { BlockDetail } from "./BlockDetail";
import { NameDialog } from "./NameDialog";
import { AuthBar } from "./AuthBar";
import { DownloadWidget } from "./DownloadWidget";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import {
  connectGoogleCalendar,
  isGoogleCalendarConfigured,
} from "../lib/googleCalendar";

interface Props {
  // 상단바의 작업 공간 전환에서 "조직 만들기 / 참여하기"를 골랐을 때.
  onAddOrg: () => void;
}

export function Planner({ onAddOrg }: Props) {
  const { presets, setPresets, selectedPresetId, setSelectedPresetId, loaded } =
    usePresets();

  // 조직에 공유해 둔 프리셋을 고쳤다면, 그 조직의 공유본도 따라 갱신한다.
  // (사람이 '공유 갱신' 버튼 누르는 걸 잊으면 관리자가 옛 시간표로 일정을 짜게 된다)
  useSharedScheduleSync(presets, loaded);

  // 현재 시각(30초마다 갱신) → 오늘 요일 / 지금 할 일 하이라이트에 사용.
  const now = useNow();
  const todayIdx = jsDayToMondayIndex(now.getDay());
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(todayIdx);

  // 보기 방식: 목록(차트형) / 시간표(그래프형). 기기별로 기억된다.
  const [viewMode, setViewMode] = useViewMode();

  // 시간표(그래프) 뷰의 편집 잠금. 기본은 "보기"다.
  //
  // 폰에서는 화면을 스크롤하려고 블록에 손가락을 대는 것만으로 드래그가 시작돼
  // 일정이 조용히 옮겨져 버렸다. 보다가 실수로 고쳐지는 쪽이, 고칠 때 버튼을
  // 한 번 더 누르는 쪽보다 훨씬 나쁘다 → 편집은 명시적으로 켜야 하는 것으로 바꿨다.
  //
  // 일부러 저장하지 않는다(기억시키지 않는다). 화면을 다시 열면 항상 잠긴 상태에서 시작한다.
  const [gridEditing, setGridEditing] = useState(false);

  // 모달/드로어 상태
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);
  const [showBlockEditor, setShowBlockEditor] = useState(false);
  // 그래프 뷰의 빈 칸을 눌러 추가할 때 미리 채워둘 시작 시각.
  const [editorStart, setEditorStart] = useState<string | undefined>(undefined);
  // 보기 전용 시간표에서 블록을 눌렀을 때 띄우는 상세(잘린 이름을 끝까지 읽기 위한 것).
  const [viewingBlock, setViewingBlock] = useState<{
    dayIdx: number;
    block: ScheduleBlock;
  } | null>(null);
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
        <div className="auth-row">
          <WorkspaceSwitcher onAddOrg={onAddOrg} />
          <AuthBar />
        </div>
        <div className="loading-hint">불러오는 중…</div>
      </div>
    );
  }

  // ── 빈 상태: 프리셋이 하나도 없는 신규 사용자 ──
  if (presets.length === 0) {
    return (
      <div className="wrap">
        <div className="auth-row">
          <WorkspaceSwitcher onAddOrg={onAddOrg} />
          <AuthBar />
        </div>
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
    closeBlockEditor();
  }

  function closeBlockEditor() {
    setShowBlockEditor(false);
    setEditingBlock(null);
    setEditorStart(undefined);
  }

  // 그래프 뷰에서 블록을 눌렀을 때. 그 블록이 속한 요일로 선택을 옮긴 뒤 편집 모달을 연다.
  // (편집/저장 로직은 "선택된 요일"을 기준으로 동작하므로 요일을 먼저 맞춰줘야 한다.)
  function handleGridEdit(dayIdx: number, block: ScheduleBlock) {
    setSelectedDayIdx(dayIdx);
    setEditingBlock(block);
    setEditorStart(undefined);
    setShowBlockEditor(true);
  }

  // 그래프 뷰에서 블록을 드래그해 옮기거나 길이를 바꿨을 때.
  // 요일이 바뀔 수 있으므로(가로 드래그) 원래 요일에서 빼고 옮겨간 요일에 넣는다.
  function handleMoveBlock(
    fromDayIdx: number,
    blockId: string,
    toDayIdx: number,
    start: string,
    end: string
  ) {
    setPresets((prev) =>
      prev.map((preset) => {
        if (preset.id !== currentPreset.id) return preset;

        // 각 요일의 blocks 배열을 새로 만들어(불변성) 옮기는 작업을 한다.
        const days = preset.days.map((d) => ({ ...d, blocks: [...d.blocks] }));
        const source = days[fromDayIdx];
        const idx = source.blocks.findIndex((b) => b.id === blockId);
        if (idx === -1) return preset; // 방어: 이미 사라진 블록

        const [block] = source.blocks.splice(idx, 1);
        const moved = { ...block, start, end };
        // fromDay 와 toDay 가 같아도 위에서 이미 빼냈으므로 그대로 다시 넣으면 된다.
        days[toDayIdx].blocks = sortBlocks([...days[toDayIdx].blocks, moved]);

        return { ...preset, days };
      })
    );
  }

  // 그래프 뷰의 빈 칸을 눌렀을 때. 누른 시각을 시작값으로 채운 추가 모달을 연다.
  function handleGridAdd(dayIdx: number, start: string) {
    setSelectedDayIdx(dayIdx);
    setEditingBlock(null);
    setEditorStart(start);
    setShowBlockEditor(true);
  }

  // 실제로 지웠으면 true. 편집 모달에서 부를 때 "확인창에서 취소를 눌렀는데도 모달이 닫히는"
  // 일을 막으려면, 지웠는지 여부를 호출한 쪽이 알아야 한다.
  function handleDeleteBlock(blockId: string): boolean {
    // 상시 편집이라 실수로 지우는 것을 막기 위해 한 번 확인한다.
    if (!window.confirm("이 블록을 삭제할까요?")) return false;
    updateDayBlocks(currentPreset.id, (blocks) => blocks.filter((b) => b.id !== blockId));
    return true;
  }

  // 구글 캘린더 연결 시작. (성공/실패는 구글·서버를 거쳐 돌아온 뒤 App 이 알림으로 처리한다)
  async function handleConnectGoogle() {
    try {
      await connectGoogleCalendar();
    } catch (e) {
      console.error("[Calendar] 구글 연결 시작 실패", e);
      alert(e instanceof Error ? e.message : "구글 캘린더 연결을 시작하지 못했습니다.");
    }
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
          <WorkspaceSwitcher onAddOrg={onAddOrg} />
          <DownloadWidget />
          {/* 구글 캘린더 연결 — 환경변수(VITE_GOOGLE_CLIENT_ID)가 있을 때만 노출.
              연결하면 등록한 일정이 서버에서 자동 동기화된다(달 뷰는 Phase 3). */}
          {isGoogleCalendarConfigured() && (
            <button
              className="google-connect-btn"
              onClick={handleConnectGoogle}
              title="구글 캘린더를 연결해 일정을 가져옵니다"
            >
              📅 캘린더 연결
            </button>
          )}
          <AuthBar />
        </div>

        <div className="top">
          <h1>{currentPreset.label} 주간 계획표</h1>
          <div className="clock">{clockText}</div>
        </div>

        <div className="view-row">
          {/* 편집 잠금 버튼은 시간표 뷰에서만 의미가 있다.
              목록 뷰는 드래그가 없어 실수로 바뀔 일이 없기 때문이다. */}
          {viewMode === "graph" && (
            <button
              className={"edit-toggle" + (gridEditing ? " on" : "")}
              onClick={() => setGridEditing((v) => !v)}
              aria-pressed={gridEditing}
            >
              {gridEditing ? "✓ 편집 중" : "✎ 편집"}
            </button>
          )}
          <ViewToggle value={viewMode} onChange={setViewMode} />
        </div>

        {viewMode === "chart" ? (
          <>
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
          </>
        ) : (
          <>
            <WeekGrid
              days={currentPreset.days}
              todayIdx={todayIdx}
              nowMin={nowMin}
              editable={gridEditing}
              onEditBlock={handleGridEdit}
              onViewBlock={(dayIdx, block) => setViewingBlock({ dayIdx, block })}
              onAddBlockAt={handleGridAdd}
              onMoveBlock={handleMoveBlock}
            />
            <div className="grid-hint">
              {gridEditing
                ? "블록을 끌어 옮기고, 위·아래 끝을 잡아 늘려보세요. 빈 칸을 누르면 새 블록이 추가돼요."
                : "보기 전용이에요. 고치려면 위의 '✎ 편집'을 누르세요."}
            </div>
          </>
        )}
      </div>

      {viewingBlock && (
        <BlockDetail
          block={viewingBlock.block}
          dayName={currentPreset.days[viewingBlock.dayIdx].name}
          onClose={() => setViewingBlock(null)}
          // 상세에서 바로 편집으로. 편집 모드를 함께 켜주지 않으면
          // 모달을 닫는 순간 다시 잠긴 화면으로 돌아와 사용자가 혼란스러워진다.
          onEdit={() => {
            setGridEditing(true);
            handleGridEdit(viewingBlock.dayIdx, viewingBlock.block);
            setViewingBlock(null);
          }}
        />
      )}

      {showBlockEditor && (
        <BlockEditor
          initial={editingBlock}
          defaultStart={editorStart}
          onSave={handleSaveBlock}
          onCancel={closeBlockEditor}
          // 시간표 뷰에는 줄마다 붙는 삭제 버튼이 없다 → 지우려면 이 모달뿐이다.
          onDelete={(blockId) => {
            if (handleDeleteBlock(blockId)) closeBlockEditor();
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
