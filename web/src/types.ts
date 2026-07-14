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

// 시간표를 보는 방식.
// - chart: 하루씩 "시간 + 할 일" 목록으로 보는 기존 방식
// - graph: 일주일 전체를 에브리타임식 세로 그리드로 한눈에 보는 방식
export type ViewMode = "chart" | "graph";

// 프리셋 하나 = 라벨을 붙인 일주일 전체 시간표.
// (예: "방학", "학기중", "휴가")
export interface Preset {
  id: string;
  label: string;      // 프리셋 이름
  days: DayPlan[];    // 항상 길이 7 (월~일)
}

/* ------------------------------------------------------------
 * 조직(팀/기업) 워크스페이스
 * ------------------------------------------------------------ */

// 조직 안에서의 권한.
// - admin:  조직 공용 시간표를 배포할 수 있다
// - member: 자기 시간표를 공유하고, 배포된 시간표를 본다
export type OrgRole = "admin" | "member";

// 가입 상태.
// - pending: 초대 링크로 신청했지만 관리자 승인 전 → 조직의 어떤 시간표도 못 본다(RLS 가 막는다)
// - active:  승인된 조직원
export type OrgMemberStatus = "pending" | "active";

export interface Organization {
  id: string;
  name: string;
  // 8자리 초대 코드. 카카오 사용자는 이메일이 없을 수 있어 이메일 초대를 못 쓴다.
  inviteCode: string;
}

export interface OrgMember {
  userId: string;
  role: OrgRole;
  displayName: string;
  status: OrgMemberStatus;
}

// 팀원이 조직에 공유한 시간표(사본). 개인 프리셋 원본이 아니다.
export interface SharedSchedule {
  userId: string;
  schedule: Preset;
}

// 지금 보고 있는 작업 공간.
// 이 구분이 곧 프라이버시 경계선이다 — personal 의 데이터는 조직에 절대 노출되지 않는다.
export type Workspace =
  | { kind: "personal" }
  | { kind: "org"; orgId: string };
