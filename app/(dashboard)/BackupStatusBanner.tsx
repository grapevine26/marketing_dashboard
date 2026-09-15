import { AlertTriangle } from "lucide-react";
import { listBackupFiles } from "@/lib/db/backup";

/**
 * 자동 백업이 멈춘 걸 대표 관리자에게 알리는 배너.
 *
 * Supabase 무료 요금제에는 자동 백업이 없어서 매일 새벽 3시(KST) 크론(`/api/cron/backup`)이
 * 유일한 방어선이다. 그런데 크론이 실패하면 console.error 만 남고 아무도 모른다.
 * 그래서 사람이 매일 보는 첫 화면에서 "최근 백업 파일이 있는가" 를 거꾸로 확인한다.
 * 크론이 성공했는지를 직접 보는 게 아니라 결과물을 보므로, 실패 원인이 무엇이든(권한·토큰·타임아웃)
 * 똑같이 잡힌다.
 *
 * 정상일 때는 아무것도 그리지 않는다. 평소에 조용해야 경고가 눈에 띈다.
 */

/** 이 시간을 넘으면 경고. 하루 한 번 도는 크론이 한 번 건너뛴 정도는 넘기고, 이틀 연속 실패면 알린다. */
const STALE_HOURS = 48;

/** 크론이 쓰는 파일 이름. 시각은 UTC 다 (`lib/db/backup.ts` 의 backupName). */
const BACKUP_NAME_RE = /^supabase-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/;

/**
 * stale: 마지막 백업이 너무 오래됨 / missing: 파일이 아예 없음 / unknown: 저장소 조회 실패.
 * 시각·경과일은 stale 에만 붙는 union 으로 둔다. optional 로 두면 "Invalid Date" 를 찍는 경로가 생긴다.
 */
export type BackupStatus =
  | { level: "stale"; latestAt: string; daysAgo: number }
  | { level: "missing" }
  | { level: "unknown" };

/**
 * 파일 하나의 백업 시각(ms). 이름에서 뽑는 걸 우선한다.
 * uploadedAt 은 저장소가 기록한 업로드 시각이라 백엔드(Blob/로컬 파일)마다 의미가 조금씩 다르고,
 * 파일을 옮기거나 다시 올리면 바뀐다. 이름에 박힌 시각이 "언제 시점의 DB 인가" 에 더 가깝다.
 */
function backupTimeMs(file: { key: string; uploadedAt: string }): number | null {
  const m = BACKUP_NAME_RE.exec(file.key);
  if (m) {
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  }
  // 이름 규칙이 바뀐 파일이라도 최신 여부는 봐야 한다. 못 읽으면 없는 셈 친다.
  const t = Date.parse(file.uploadedAt);
  return Number.isNaN(t) ? null : t;
}

/**
 * 백업 상태를 본다. 정상이면 null.
 *
 * **대표 관리자일 때만 부를 것.** 여기서 등급을 다시 보지 않는다(세션 조회를 한 번 더 하게 된다).
 * 부르는 쪽인 대시보드 페이지가 `isOwner` 로 막는다.
 *
 * 무슨 일이 있어도 예외를 밖으로 내보내지 않는다. 백업 점검 때문에 대시보드 전체가 500 이 나면
 * 원래 막으려던 사고보다 큰 사고가 된다.
 */
export async function getBackupStatus(): Promise<BackupStatus | null> {
  // 로컬 개발에는 크론이 돌지 않아 백업이 없는 게 정상이다.
  // 여기서 늘 경고가 떠 있으면 배포에서 진짜 경고가 떴을 때도 그냥 넘기게 된다.
  if (process.env.NODE_ENV !== "production") return null;

  try {
    const files = await listBackupFiles();
    const times = files.map(backupTimeMs).filter((t): t is number => t !== null);
    if (times.length === 0) return { level: "missing" };

    const latest = Math.max(...times);
    const hoursAgo = (Date.now() - latest) / 3_600_000;
    if (hoursAgo <= STALE_HOURS) return null;

    return {
      level: "stale",
      latestAt: new Date(latest).toISOString(),
      daysAgo: Math.floor(hoursAgo / 24),
    };
  } catch (err) {
    // 조회 자체가 안 되는 것도 "백업이 되고 있는지 모른다" 는 뜻이라 조용히 넘기지 않고 약하게 알린다.
    console.error("[backup-status] 백업 목록 조회 실패:", err);
    return { level: "unknown" };
  }
}

function formatKst(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BackupStatusBanner({ status }: { status: BackupStatus | null }) {
  if (!status) return null;

  const headline =
    status.level === "stale"
      ? `마지막 DB 백업이 ${status.daysAgo}일 전입니다 (${formatKst(status.latestAt)} 기준).`
      : status.level === "missing"
      ? "자동 DB 백업 파일이 하나도 없습니다."
      : "백업 상태를 확인할 수 없습니다 (저장소 조회 실패).";

  const detail =
    status.level === "unknown"
      ? "Vercel Blob 연결과 로그를 확인해 주세요."
      : "매일 새벽 3시 자동 백업이 실패하고 있을 수 있습니다. Vercel 로그에서 /api/cron/backup 을 확인하세요.";

  return (
    <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-warn-soft text-xs sm:text-sm flex items-start gap-2.5">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="space-y-1 min-w-0">
        <p className="font-bold leading-snug">{headline}</p>
        <p className="text-[11px] sm:text-xs text-warn-soft/80 leading-relaxed">
          {detail} 직접 백업을 받으려면 <code className="font-mono">npm run db:backup</code> 를 실행합니다 (자세한 내용은{" "}
          <code className="font-mono">docs/ops-backup.md</code>).
        </p>
      </div>
    </div>
  );
}
