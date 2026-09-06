import { describe, it, expect } from "vitest";
import {
  toKstDateString,
  isoToKstDateString,
  formatKstDateTime,
  kstLocalInputToIso,
  isoToKstLocalInput,
  daysUntilDeadline,
  formatDday,
  calculateDDay,
  parseMonthParam,
  shiftMonth,
  buildMonthGrid,
} from "@/lib/seeding/dday";

describe("KST 날짜 유틸", () => {
  it("UTC 자정 직전은 KST로 다음 날이다", () => {
    expect(toKstDateString(new Date("2026-09-15T15:30:00Z"))).toBe("2026-09-16");
    expect(toKstDateString(new Date("2026-09-15T14:59:00Z"))).toBe("2026-09-15");
    expect(isoToKstDateString("2026-09-15T15:30:00Z")).toBe("2026-09-16");
    expect(isoToKstDateString("garbage")).toBeNull();
  });

  it("datetime-local 입력을 KST로 해석해 ISO로 바꾸고 되돌린다", () => {
    const iso = kstLocalInputToIso("2026-09-15T18:00");
    expect(iso).toBe("2026-09-15T09:00:00.000Z");
    expect(formatKstDateTime(iso)).toBe("2026-09-15 18:00");
    expect(isoToKstLocalInput(iso)).toBe("2026-09-15T18:00");
    expect(kstLocalInputToIso("")).toBeNull();
    expect(kstLocalInputToIso("2026-09-15T09:00:00.000Z")).toBe("2026-09-15T09:00:00.000Z");
  });

  it("D-day 계산과 라벨", () => {
    expect(daysUntilDeadline("2026-09-02", "2026-09-02")).toBe(0);
    expect(daysUntilDeadline("2026-09-05", "2026-09-02")).toBe(3);
    expect(daysUntilDeadline("2026-08-30", "2026-09-02")).toBe(-3);
    expect(formatDday(0)).toBe("D-DAY");
    expect(formatDday(3)).toBe("D-3");
    expect(formatDday(-2)).toBe("D+2");
    expect(calculateDDay(null)).toEqual({ dday: null, label: "-", isOverdue: false });
    expect(calculateDDay("2026-09-01T00:00:00Z", "2026-09-02")).toMatchObject({ dday: -1, isOverdue: true });
  });

  it("month 파라미터는 형식이 틀리면 오늘 달로 폴백한다", () => {
    expect(parseMonthParam("2026-08", "2026-09-06")).toBe("2026-08");
    expect(parseMonthParam("abc", "2026-09-06")).toBe("2026-09");
    expect(parseMonthParam("2026-13", "2026-09-06")).toBe("2026-09");
    expect(parseMonthParam(undefined, "2026-09-06")).toBe("2026-09");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("월 그리드는 요일 오프셋과 오늘 표시를 갖는다", () => {
    const grid = buildMonthGrid("2026-09", "2026-09-06");
    expect(grid.leadingBlanks).toBe(2); // 2026-09-01 은 화요일
    expect(grid.cells).toHaveLength(30);
    expect(grid.cells.find((c) => c.dateStr === "2026-09-06")?.isToday).toBe(true);
  });
});
