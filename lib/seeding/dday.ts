export function calculateDDay(deadlineStr?: string | null): {
  dday: number | null;
  label: string;
  isOverdue: boolean;
} {
  if (!deadlineStr) {
    return { dday: null, label: "-", isOverdue: false };
  }

  const deadline = new Date(deadlineStr);
  const now = new Date();

  // Reset time to start of day for comparison
  const deadlineDate = new Date(
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate()
  );
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = deadlineDate.getTime() - nowDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { dday: 0, label: "D-Day", isOverdue: false };
  } else if (diffDays > 0) {
    return { dday: diffDays, label: `D-${diffDays}`, isOverdue: false };
  } else {
    return { dday: diffDays, label: `D+${Math.abs(diffDays)} (지연)`, isOverdue: true };
  }
}
