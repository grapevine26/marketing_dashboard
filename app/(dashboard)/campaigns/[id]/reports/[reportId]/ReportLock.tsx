"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * 이 보고서 화면이 **하나만** 들고 있는 낙관적 잠금 기준 시각.
 *
 * **왜 공유하나** — 제목과 총평은 `reports` 의 **같은 행**을 고치고, 한 화면에 나란히 있다.
 * `updated_at` 은 어느 쪽으로 고쳐도 DB 트리거가 새로 찍으므로(마이그레이션 0009),
 * 기준 시각을 따로 들고 있으면 이렇게 된다:
 *
 *   - 제목을 바꾼 직후 총평을 저장하면 → 총평 쪽 기준은 옛 값이라 **자기 자신과 충돌**한다.
 *     "다른 사람이 먼저 저장했습니다" 라고 하는데 그 다른 사람이 자기 자신이다.
 *   - 반대로 총평을 저장한 뒤 제목을 바꾸면 → 제목 쪽이 거부된다.
 *
 * 그래서 두 편집기가 같은 값을 보고, 어느 쪽이든 저장에 성공하면 그 자리에서 새 값으로 옮긴다.
 *
 * `null` 은 "잠그지 않는다" 는 뜻이다. 사용자가 충돌 안내에서 **덮어쓰기를 고른** 경우에만 그렇게 된다.
 */
interface ReportLock {
  baseline: string | null;
  setBaseline: (next: string | null) => void;
}

const ReportLockContext = createContext<ReportLock | null>(null);

export function ReportLockProvider({
  initialUpdatedAt,
  children,
}: {
  /** 서버가 이 화면을 그릴 때의 `report.updated_at`. */
  initialUpdatedAt: string;
  children: ReactNode;
}) {
  const [baseline, setBaseline] = useState<string | null>(initialUpdatedAt);
  const value = useMemo(() => ({ baseline, setBaseline }), [baseline]);
  return <ReportLockContext.Provider value={value}>{children}</ReportLockContext.Provider>;
}

export function useReportLock(): ReportLock {
  const ctx = useContext(ReportLockContext);
  if (!ctx) throw new Error("ReportLockProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}
