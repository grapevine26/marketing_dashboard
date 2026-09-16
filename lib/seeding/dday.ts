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

/**
 * "YYYY-MM-DD" 를 연·월·일로 쪼갠다. 형식이 어긋나면 null.
 *
 * 예전에는 `split("-").map(Number)` 결과를 그대로 `Date.UTC` 에 넣었다. 값이 모자라면
 * NaN 이 되어 화면에 **"D-NaN"** 이 찍혔는데, 그게 날짜가 없다는 뜻인지 깨졌다는 뜻인지
 * 알 수 없었다. 판단을 여기 한 곳으로 모아서 호출자가 "못 읽었다" 를 구분할 수 있게 한다.
 */
function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const matched = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!matched) return null;
  // 정규식이 통과했으므로 세 자리 모두 숫자다.
  return { y: Number(matched[1]), m: Number(matched[2]), d: Number(matched[3]) };
}

/**
 * 오늘로부터 마감까지 남은 날수. 둘 중 하나라도 "YYYY-MM-DD" 가 아니면 NaN.
 * (NaN 을 돌려주는 것은 예전 그대로다. 화면에 쓰는 쪽은 {@link calculateDDay} 를 쓸 것.)
 */
export function daysUntilDeadline(deadlineStr: string, todayKstStr?: string): number {
  const today = parseYmd(todayKstStr || toKstDateString());
  const deadline = parseYmd(deadlineStr);
  if (!today || !deadline) return NaN;

  const tDate = Date.UTC(today.y, today.m - 1, today.d);
  const dDate = Date.UTC(deadline.y, deadline.m - 1, deadline.d);

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
  // split 은 최소 한 조각을 돌려주므로 [0] 은 반드시 있다.
  const days = daysUntilDeadline(deadlineStr.split("T")[0] ?? "", todayKstStr);
  // 날짜를 못 읽었으면 "없음" 과 같게 다룬다. 화면에 "D-NaN" 이 뜨는 것보다 낫다.
  if (Number.isNaN(days)) {
    return { dday: null, label: "-", isOverdue: false };
  }
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

/**
 * "YYYY-MM" 을 연·월로 쪼갠다. 형식이 어긋나면 **오늘이 속한 달**로 물러선다.
 * 달력은 어떤 값이 와도 무언가는 그려야 하는 화면이라 null 을 돌려줄 자리가 없다.
 */
function parseMonth(month: string): { y: number; m: number } {
  const matched = /^(\d{4})-(\d{1,2})$/.exec(month);
  if (!matched) {
    const today = toKstDateString();
    return { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) };
  }
  return { y: Number(matched[1]), m: Number(matched[2]) };
}

/** "YYYY-MM"에 delta개월을 더한 "YYYY-MM" */
export function shiftMonth(month: string, delta: number): string {
  const { y, m } = parseMonth(month);
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
  const { y, m } = parseMonth(month);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leadingBlanks = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const cells: MonthGridCell[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ dayNum: d, dateStr, isToday: dateStr === todayKst });
  }
  return { leadingBlanks, cells };
}
