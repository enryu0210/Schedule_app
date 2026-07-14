/*
 * 블록 상세 보기 (읽기 전용).
 *
 * 왜 필요한가:
 *   폰에서는 요일 7열이 좁아 블록 안의 일정 이름이 두세 글자 만에 잘린다
 *   ("국가근로(Argos 개발…"). 시간표가 보기 전용이 된 뒤로는 눌러도 아무 일이
 *   없어서, 잘린 이름을 끝까지 읽을 방법이 아예 없었다.
 *
 * 여기서 바로 '편집'으로 넘어갈 수 있게 해서, 잠금 때문에 편집이 번거로워지는 것을 막는다.
 */
import type { ScheduleBlock } from "../types";

interface Props {
  block: ScheduleBlock;
  dayName: string;
  onEdit: () => void;   // 편집 모드를 켜고 편집 모달로 넘어간다
  onClose: () => void;
}

export function BlockDetail({ block, dayName, onEdit, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="block-detail-day">{dayName}</div>
        {/* 잘리지 않게 온전히 보여주는 것이 이 화면의 존재 이유다 */}
        <h2 className="block-detail-label">{block.label}</h2>
        <div className="block-detail-time">
          {block.start} ~ {block.end}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>닫기</button>
          <button className="btn primary" onClick={onEdit}>편집</button>
        </div>
      </div>
    </div>
  );
}
