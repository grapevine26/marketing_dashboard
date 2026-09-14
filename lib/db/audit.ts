import { db, unwrap } from "./client";
import { rowToAuditLog, type AuditLogRow } from "./mappers";
import type { AuditActorType, AuditLogEntry } from "./types";
import { getActor } from "../auth/context";

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
  // 행위자 이름을 따로 주지 않으면 현재 로그인한 사용자를 쓴다.
  // 공개 라우트(지원폼·사전조사·승인 링크)에는 로그인이 없어 비어 있고, 그때는 이름 없이 남는다.
  const actorName = entry.actor_name ?? getActor()?.display_name ?? null;
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
        actor_name: actorName,
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
