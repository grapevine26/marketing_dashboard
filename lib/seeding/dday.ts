export function toKstDateString(date: Date = new Date()): string {
  // UTC+9 계산
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

export function calculateDDay(deadlineStr?: string | null): {
  dday: number | null;
  label: string;
  isOverdue: boolean;
} {
  if (!deadlineStr) {
    return { dday: null, label: "-", isOverdue: false };
  }
  const days = daysUntilDeadline(deadlineStr.split("T")[0]);
  return {
    dday: days,
    label: formatDday(days),
    isOverdue: days < 0,
  };
}