/*
 * 앱 전역에서 쓰는 데이터 타입 정의.
 * 데이터 구조를 한 파일에 모아두면 Supabase 테이블 설계로 옮길 때 기준이 된다.
 */

// 블록에 칠할 수 있는 색상 이름. tokens.css 의 팔레트와 1:1로 대응한다.
export type BlockColor =
  | "gray"
  | "purple"
  | "teal"
  | "coral"
  | "pink"
  | "neutral";

// 시간표의 최소 단위인 "시간 블록" 하나.
export interface ScheduleBlock {
  id: string;          // 고유 id (편집/삭제 시 식별용)
  start: string;       // 시작 시각 "HH:MM" (24시간제)
  end: string;         // 종료 시각 "HH:MM" (자정 넘김은 24:00~ 로 표현)
  label: string;       // 할 일 이름 (예: "논문준비")
  color: BlockColor;   // 블록 색상
}

// 하루치 계획. blocks 는 시작시간 순으로 정렬되어 있다고 가정한다.
export interface DayPlan {
  name: string;              // "월요일" 등
  tag: string;               // "근로일" 같은 부가 설명 (없으면 빈 문자열)
  blocks: ScheduleBlock[];
}

// 프리셋 하나 = 라벨을 붙인 일주일 전체 시간표.
// (예: "방학", "학기중", "휴가")
export interface Preset {
  id: string;
  label: string;      // 프리셋 이름
  days: DayPlan[];    // 항상 길이 7 (월~일)
}
