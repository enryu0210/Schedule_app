/*
 * 앱을 처음 켰을 때 보여줄 기본 프리셋("방학").
 * - 참고용 assets/오늘의_계획표.html 의 요일별 데이터를 그대로 옮겨왔다.
 * - 사용자가 아무것도 저장하지 않았을 때의 시작점 역할을 한다.
 */
import type { Preset, ScheduleBlock, BlockColor } from "../types";
import { createId } from "../lib/id";

// [start, end, label, color] 4개짜리 짧은 배열로 적어두고,
// 아래에서 id를 붙여 ScheduleBlock 으로 변환한다. (원본 데이터를 읽기 쉽게 유지)
type RawBlock = [string, string, string, BlockColor];

function block([start, end, label, color]: RawBlock): ScheduleBlock {
  return { id: createId(), start, end, label, color };
}

const RAW_DAYS: { name: string; tag: string; blocks: RawBlock[] }[] = [
  {
    name: "월요일", tag: "근로일", blocks: [
      ["07:30", "16:00", "국가근로", "gray"],
      ["16:00", "18:30", "Argos 개발", "purple"],
      ["18:30", "19:00", "휴식", "neutral"],
      ["19:00", "20:00", "저녁식사", "neutral"],
      ["20:00", "21:30", "논문준비", "teal"],
      ["21:30", "22:30", "유튜브 촬영", "coral"],
      ["22:30", "23:00", "휴식", "neutral"],
      ["23:00", "23:30", "취침준비", "neutral"],
    ],
  },
  {
    name: "화요일", tag: "근로일", blocks: [
      ["07:30", "16:00", "국가근로", "gray"],
      ["16:00", "18:30", "Argos 개발", "purple"],
      ["18:30", "19:00", "휴식", "neutral"],
      ["19:00", "20:00", "저녁식사", "neutral"],
      ["20:00", "21:30", "논문준비", "teal"],
      ["21:30", "22:30", "유튜브 편집", "coral"],
      ["22:30", "23:00", "휴식", "neutral"],
      ["23:00", "23:30", "취침준비", "neutral"],
    ],
  },
  {
    name: "수요일", tag: "근로일", blocks: [
      ["07:30", "16:00", "국가근로", "gray"],
      ["16:00", "18:30", "Argos 개발", "purple"],
      ["18:30", "19:00", "휴식", "neutral"],
      ["19:00", "20:00", "저녁식사", "neutral"],
      ["20:00", "21:30", "유튜브 촬영", "coral"],
      ["21:30", "22:30", "논문준비", "teal"],
      ["22:30", "23:00", "휴식 · 정리", "neutral"],
      ["23:00", "23:30", "취침준비", "neutral"],
    ],
  },
  {
    name: "목요일", tag: "근로일", blocks: [
      ["07:30", "16:00", "국가근로", "gray"],
      ["16:00", "18:30", "Argos 개발", "purple"],
      ["18:30", "19:00", "휴식", "neutral"],
      ["19:00", "20:00", "저녁식사", "neutral"],
      ["20:00", "21:30", "논문준비", "teal"],
      ["21:30", "23:00", "유튜브 편집", "coral"],
      ["23:00", "23:30", "취침준비", "neutral"],
    ],
  },
  {
    name: "금요일", tag: "비근로일 · 생방송", blocks: [
      ["08:30", "09:30", "기상 · 아침식사", "neutral"],
      ["09:30", "12:00", "Argos 개발", "purple"],
      ["12:00", "13:00", "점심", "neutral"],
      ["13:00", "15:00", "논문준비", "teal"],
      ["15:00", "15:30", "휴식", "neutral"],
      ["15:30", "17:30", "생방송", "pink"],
      ["17:30", "19:00", "유튜브 편집", "coral"],
      ["19:00", "20:00", "저녁식사", "neutral"],
      ["20:00", "21:30", "휴식", "neutral"],
      ["21:30", "22:30", "Argos 개발 보충", "purple"],
      ["22:30", "24:30", "자유시간 · 취침준비", "neutral"],
    ],
  },
  {
    name: "토요일", tag: "비근로일 · 생방송", blocks: [
      ["09:00", "10:00", "기상 · 아침식사", "neutral"],
      ["10:00", "12:30", "Argos 개발", "purple"],
      ["12:30", "13:30", "점심", "neutral"],
      ["13:30", "15:30", "논문준비", "teal"],
      ["15:30", "16:00", "휴식", "neutral"],
      ["16:00", "18:30", "유튜브 편집", "coral"],
      ["18:30", "19:00", "방송준비", "neutral"],
      ["19:00", "20:00", "저녁식사", "neutral"],
      ["20:00", "22:00", "생방송", "pink"],
      ["22:00", "23:00", "방송정리 · 소통", "neutral"],
      ["23:00", "24:00", "휴식 · 취침준비", "neutral"],
    ],
  },
  {
    name: "일요일", tag: "비근로일 · 재정비", blocks: [
      ["09:00", "10:00", "기상 · 아침식사", "neutral"],
      ["10:00", "12:00", "Argos 개발", "purple"],
      ["12:00", "13:00", "점심", "neutral"],
      ["13:00", "15:00", "논문준비", "teal"],
      ["15:00", "16:00", "휴식", "neutral"],
      ["16:00", "17:30", "유튜브 편집(다음주 준비)", "coral"],
      ["17:30", "19:00", "휴식 · 재충전", "neutral"],
      ["19:00", "20:00", "저녁식사", "neutral"],
      ["20:00", "21:00", "다음주 계획 정리", "neutral"],
      ["21:00", "22:30", "자유시간", "neutral"],
      ["22:30", "24:00", "취침준비", "neutral"],
    ],
  },
];

// 기본 프리셋을 만드는 함수. (매번 새 id를 부여하기 위해 함수로 제공)
export function createDefaultPreset(): Preset {
  return {
    id: createId(),
    label: "방학",
    days: RAW_DAYS.map((d) => ({
      name: d.name,
      tag: d.tag,
      blocks: d.blocks.map(block),
    })),
  };
}

// 빈 프리셋(요일 골격만 있고 블록은 비어 있음)을 만드는 함수.
// 새 프리셋을 "처음부터" 만들 때 사용한다.
const DAY_NAMES = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
export function createEmptyPreset(label: string): Preset {
  return {
    id: createId(),
    label,
    days: DAY_NAMES.map((name) => ({ name, tag: "", blocks: [] })),
  };
}
