/*
 * 팀원 시간표 겹쳐보기 — "모두 비는 시간"을 찾는 화면.
 *
 * 이 화면이 조직 기능의 핵심이다.
 * 관리자가 "누가 언제 일하는지" 몰라서 쓸모없는 미팅이 잡히는 문제를 직접 푼다.
 *
 * 그리는 방식:
 *   30분 칸마다 "그 시간에 바쁜 사람 수"를 센다.
 *   - 아무도 안 바쁨 → 초록(모두 가능). 여기에 회의를 잡으면 된다.
 *   - 바쁜 사람이 많을수록 → 진하게. 진한 칸은 피해야 할 시간이다.
 *   칸에 마우스를 올리면 누가 바쁜지 이름이 뜬다.
 *
 * 시간표를 공유하지 않은 사람은 아예 계산에서 빠진다.
 * (그 사람이 '한가하다'고 잘못 판단하면 안 되므로, 화면 위에 몇 명이 공유했는지 밝혀둔다)
 */
import type { OrgMember, SharedSchedule } from "../types";
import { computeGridRange, expandedEndMinutes, toHHMM, toMinutes } from "../lib/time";

// 한 칸 = 30분. 회의를 잡는 단위로 충분하고, 칸이 너무 잘게 쪼개지지 않는다.
const SLOT_MIN = 30;
const SLOT_HEIGHT = 22; // px

const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];

interface Props {
  members: OrgMember[];
  sharedSchedules: SharedSchedule[];
  todayIdx: number;
}

export function TeamOverlapGrid({ members, sharedSchedules, todayIdx }: Props) {
  // 공유한 사람이 없으면 겹쳐볼 것도 없다.
  if (sharedSchedules.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-emoji">🫥</div>
        <h2>아직 공유된 시간표가 없어요</h2>
        <p>
          팀원들이 자기 시간표를 조직에 공유하면
          <br />
          여기에 모두 비는 시간이 표시됩니다.
        </p>
      </div>
    );
  }

  // 세로 시간 범위는 "공유된 모든 시간표"를 합쳐서 잡는다.
  // 한 사람 기준으로 잡으면 다른 사람의 이른 아침/늦은 밤 일정이 화면 밖으로 잘린다.
  const mergedDays = DAY_NAMES.map((name, dayIdx) => ({
    name,
    tag: "",
    blocks: sharedSchedules.flatMap((s) => s.schedule.days[dayIdx]?.blocks ?? []),
  }));
  const { startMin, endMin } = computeGridRange(mergedDays);

  // 이름표. 공유는 했는데 멤버 목록에 없는 경우(방금 나간 사람 등)도 이름이 비지 않게 한다.
  const nameOf = (userId: string) =>
    members.find((m) => m.userId === userId)?.displayName || "이름 없음";

  const slotCount = Math.ceil((endMin - startMin) / SLOT_MIN);
  const sharedCount = sharedSchedules.length;

  // 특정 요일·시간 칸에 바쁜 사람들의 이름.
  function busyNamesAt(dayIdx: number, slotStart: number): string[] {
    const slotEnd = slotStart + SLOT_MIN;
    return sharedSchedules
      .filter((s) =>
        (s.schedule.days[dayIdx]?.blocks ?? []).some((b) => {
          const blockStart = toMinutes(b.start);
          // 자정을 넘기는 블록(예: 23:00~01:00)도 제대로 겹치게 만든다.
          const blockEnd = expandedEndMinutes(b.start, b.end);
          return blockStart < slotEnd && blockEnd > slotStart;
        })
      )
      .map((s) => nameOf(s.userId));
  }

  return (
    <div className="overlap">
      <div className="overlap-legend">
        <span className="overlap-legend-item">
          <i className="overlap-swatch free" /> 모두 가능
        </span>
        <span className="overlap-legend-item">
          <i className="overlap-swatch busy-1" /> 일부 바쁨
        </span>
        <span className="overlap-legend-item">
          <i className="overlap-swatch busy-3" /> 대부분 바쁨
        </span>
        <span className="overlap-note">
          {sharedCount}명 / 전체 {members.length}명이 공유함
        </span>
      </div>

      <div className="overlap-grid">
        {/* 왼쪽 시간 눈금 */}
        <div className="overlap-times">
          <div className="overlap-head" />
          {Array.from({ length: slotCount }, (_, i) => {
            const min = startMin + i * SLOT_MIN;
            // 정시에만 시각을 적는다. 30분마다 적으면 너무 빽빽하다.
            const isHour = min % 60 === 0;
            return (
              <div key={i} className="overlap-time" style={{ height: SLOT_HEIGHT }}>
                {isHour ? toHHMM(min) : ""}
              </div>
            );
          })}
        </div>

        {/* 요일 7열 */}
        {DAY_NAMES.map((dayName, dayIdx) => (
          <div key={dayName} className="overlap-col">
            <div className={"overlap-head" + (dayIdx === todayIdx ? " today" : "")}>
              {dayName}
            </div>
            {Array.from({ length: slotCount }, (_, i) => {
              const slotStart = startMin + i * SLOT_MIN;
              const names = busyNamesAt(dayIdx, slotStart);
              const busy = names.length;

              // 바쁜 정도를 4단계로 나눈다(0=모두 가능). 사람 수가 조직마다 다르므로 비율로 계산한다.
              const ratio = sharedCount > 0 ? busy / sharedCount : 0;
              const level =
                busy === 0 ? "free" : ratio <= 0.34 ? "busy-1" : ratio <= 0.67 ? "busy-2" : "busy-3";

              return (
                <div
                  key={i}
                  className={`overlap-cell ${level}`}
                  style={{ height: SLOT_HEIGHT }}
                  title={
                    busy === 0
                      ? `${dayName} ${toHHMM(slotStart)} — 모두 가능`
                      : `${dayName} ${toHHMM(slotStart)} — 바쁨: ${names.join(", ")}`
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
