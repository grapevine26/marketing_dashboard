import { db, unwrap } from "./client";
import { rowToAuditLog, type AuditLogRow } from "./mappers";
import type { AuditActorType, AuditLogEntry } from "./types";

export interface AuditLogInput {
  campaign_id?: string | null;
  account_id?: string | null;
  entity_type: AuditLogEntry["entity_type"];
  entity_id: string;
  action: string;
  actor_type: AuditActorType;
  actor_name?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
}

/**
 * 감사 로그 한 줄을 남긴다. 다른 DB 모듈이 쓰기 뒤에 부른다.
 * 옛 JSON 시절의 1000건 상한은 없다. 인덱스로 조회 비용을 잡는다.
 */
export async function insertAuditLog(entry: AuditLogInput): Promise<AuditLogEntry> {
  const row = unwrap(
    await db()
      .from("audit_logs")
      .insert({
        campaign_id: entry.campaign_id || null,
        account_id: entry.account_id || null,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        action: entry.action,
        actor_type: entry.actor_type,
        actor_name: entry.actor_name || null,
        summary: entry.summary,
        details: entry.details || null,
      })
      .select("*")
      .single<AuditLogRow>()
  );
  return rowToAuditLog(row);
}

export async function recordAuditLog(entry: AuditLogInput): Promise<AuditLogEntry> {
  return insertAuditLog(entry);
}

export async function getAuditLogs(filter?: {
  campaign_id?: string;
  account_id?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  let q = db().from("audit_logs").select("*").order("created_at", { ascending: false });
  if (filter?.campaign_id) q = q.eq("campaign_id", filter.campaign_id);
  if (filter?.account_id) q = q.eq("account_id", filter.account_id);
  q = q.limit(filter?.limit || 50);
  const rows = unwrap(await q.returns<AuditLogRow[]>());
  return rows.map(rowToAuditLog);
}
