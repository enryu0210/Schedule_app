/*
 * 보기 방식(목록/시간표) 상태를 기억하는 훅.
 * - 이건 "내 데이터"가 아니라 "이 기기에서 보는 취향"이라 클라우드가 아닌
 *   localStorage 에 저장한다. (폰은 목록, PC는 시간표처럼 기기별로 다를 수 있음)
 */
import { useEffect, useState } from "react";
import type { ViewMode } from "../types";

const STORAGE_KEY = "schedule-app:view-mode";

export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      // 저장된 값이 우리가 아는 두 값 중 하나일 때만 사용한다(오염된 값 방어).
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === "graph" || saved === "chart" ? saved : "chart";
    } catch {
      // 사생활 보호 모드 등에서 localStorage 접근이 막힐 수 있다 → 기본값으로.
      return "chart";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // 저장 실패해도 앱 동작에는 지장이 없으므로 조용히 넘어간다.
    }
  }, [mode]);

  return [mode, setMode];
}
