/**
 * KST(UTC+9) 고정 날짜 유틸.
 * 서버가 어느 타임존에서 돌든(Vercel은 UTC) "오늘"과 D-day가 한국 기준으로 계산되도록 한다.
 * 클라이언트에서 new Date()로 계산하지 말고, 서버에서 계산한 결과를 props로 내려보낼 것.
 */

const KST_OFFSET_MS = 9 * 3600000;

/** Date → KST 기준 YYYY-MM-DD */
export function toKstDateString(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ISO 문자열 → KST 기준 YYYY-MM-DD. 파싱 실패 시 null */
export function isoToKstDateString(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return toKstDateString(new Date(t));
}

/** ISO 문자열 → "2026-09-15 18:00" (KST). 파싱 실패 시 null */
export function formatKstDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const kst = new Date(t + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

/** ISO 문자열 → <input type="datetime-local"> 값 ("YYYY-MM-DDTHH:mm", KST) */
export function isoToKstLocalInput(iso: string | null | undefined): string {
  const s = formatKstDateTime(iso);
  return s ? s.replace(" ", "T") : "";
}

/**
 * <input type="datetime-local"> 값("YYYY-MM-DDTHH:mm", 타임존 없음)을 KST로 해석해 ISO(UTC)로 변환.
 * 이미 타임존이 붙은 ISO 문자열이면 그대로 정규화한다. 빈 값이면 null.
 */
export function kstLocalInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const t = Date.parse(`${trimmed}${trimmed.length === 16 ? ":00" : ""}+09:00`);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const t = Date.parse(trimmed);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function daysUntilDeadline(deadlineStr: string, todayKstStr?: string): number {
  const today = todayKstStr || toKstDateString();
  const [ty, tm, td] = today.split("-").map(Number);
  const [dy, dm, dd] = deadlineStr.split("-").map(Number);

  const tDate = Date.UTC(ty, tm - 1, td);
  const dDate = Date.UTC(dy, dm - 1, dd);

  return Math.round((dDate - tDate) / 86400000);
}

export function formatDday(days: number): string {
  if (days === 0) return "D-DAY";
  if (days > 0) return `D-${days}`;
  return `D+${Math.abs(days)}`;
}

export function ddayToneClass(days: number): string {
  if (days < 0) return "text-red-400 font-bold";
  if (days <= 1) return "text-amber-400 font-bold";
  if (days <= 3) return "text-yellow-300 font-semibold";
  return "text-zinc-400";
}

export function calculateDDay(
  deadlineStr?: string | null,
  todayKstStr?: string
): {
  dday: number | null;
  label: string;
  isOverdue: boolean;
} {
  if (!deadlineStr) {
    return { dday: null, label: "-", isOverdue: false };
  }
  const days = daysUntilDeadline(deadlineStr.split("T")[0], todayKstStr);
  return {
    dday: days,
    label: formatDday(days),
    isOverdue: days < 0,
  };
}

/** "YYYY-MM" 형식이면 그대로, 아니면 fallback(오늘이 속한 달)을 돌려준다. */
export function parseMonthParam(value: string | undefined | null, fallbackKstToday: string): string {
  if (typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    const year = Number(value.slice(0, 4));
    if (year >= 2000 && year <= 2100) return value;
  }
  return fallbackKstToday.slice(0, 7);
}

/** "YYYY-MM"에 delta개월을 더한 "YYYY-MM" */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface MonthGridCell {
  dayNum: number;
  dateStr: string; // YYYY-MM-DD
  isToday: boolean;
}

/** 해당 월의 날짜 셀 목록과 1일의 요일(0=일)을 돌려준다. */
export function buildMonthGrid(month: string, todayKst: string): { leadingBlanks: number; cells: MonthGridCell[] } {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leadingBlanks = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const cells: MonthGridCell[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ dayNum: d, dateStr, isToday: dateStr === todayKst });
  }
  return { leadingBlanks, cells };
}
