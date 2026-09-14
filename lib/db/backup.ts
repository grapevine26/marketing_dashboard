import { db, unwrap } from "./client";
import { putFile, listFiles, deleteFilesByPrefixes, type StoredFile } from "./storage";

/**
 * DB 전체를 JSON 한 덩어리로 받아 저장소에 둔다. 크론이 매일 부른다.
 *
 * - 파일이 아니라 저장소(배포는 Vercel Blob)에 쓴다. 서버리스 디스크는 요청이 끝나면 사라진다.
 * - supabase-js 로 읽는다. pg 는 devDependency 라 배포 번들에 없다.
 * - PostgREST 는 한 번에 최대 1000행을 주므로 range 로 나눠 읽는다.
 * - 날짜(date)는 문자열로 오기 때문에, pg 로 읽을 때 생기는 하루 밀림 문제가 없다.
 *   (scripts/db-backup.mjs 의 주석 참고)
 */

/** 부모 → 자식 순서. 복원할 때 이 순서로 넣어야 외래키가 걸리지 않는다. */
export const BACKUP_TABLES = [
  "campaigns",
  "pre_survey_template",
  "pre_survey_responses",
  "form_configs",
  "applicants",
  "seeding_records",
  "reports",
  "ppt_templates",
  "hidden_builtin_templates",
  "events",
  "event_invitees",
  "event_checklist_items",
  "event_plans",
  "sns_accounts",
  "sns_intake_template",
  "sns_intake_responses",
  "sns_plans",
  "sns_contents",
  "audit_logs",
] as const;

const PAGE = 1000;

export interface BackupDump {
  created_at: string;
  source: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export interface BackupResult {
  key: string;
  bytes: number;
  rows: number;
  counts: Record<string, number>;
  removed: string[];
}

async function readTable(table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = unwrap(
      await db()
        .from(table)
        .select("*")
        .range(from, from + PAGE - 1)
        .returns<Record<string, unknown>[]>()
    );
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function buildBackupDump(): Promise<BackupDump> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = await readTable(table);
  }
  let source = "unknown";
  try {
    source = new URL(process.env.SUPABASE_URL ?? "").hostname;
  } catch {
    /* URL 이 없으면 이름만 비운다 */
  }
  return { created_at: new Date().toISOString(), source, tables };
}

function backupName(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `supabase-${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}-${pad(
    at.getUTCHours()
  )}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}.json`;
}

/**
 * 백업을 하나 만들고, 보관 개수를 넘은 옛 것을 지운다.
 * 정리에 실패해도 백업 자체는 성공으로 본다. 지우는 것보다 남기는 게 안전하다.
 */
export async function runBackup(keep = 30): Promise<BackupResult> {
  const dump = await buildBackupDump();
  const text = JSON.stringify(dump);
  const key = backupName(new Date(dump.created_at));

  await putFile(key, Buffer.from(text, "utf-8"), "application/json", "backups");

  const counts: Record<string, number> = {};
  let rows = 0;
  for (const [t, r] of Object.entries(dump.tables)) {
    if (r.length) counts[t] = r.length;
    rows += r.length;
  }

  let removed: string[] = [];
  try {
    const all = (await listFiles("backups")).filter((f) => f.key.startsWith("supabase-"));
    const stale = all.slice(keep);
    if (stale.length > 0) {
      await deleteFilesByPrefixes(
        stale.map((f) => f.key),
        "backups"
      );
      removed = stale.map((f) => f.key);
    }
  } catch (err) {
    console.warn("[backup] 옛 백업 정리 실패 (백업 자체는 성공):", err);
  }

  return { key, bytes: text.length, rows, counts, removed };
}

export async function listBackupFiles(): Promise<StoredFile[]> {
  return (await listFiles("backups")).filter((f) => f.key.startsWith("supabase-"));
}
