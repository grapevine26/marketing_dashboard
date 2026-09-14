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

export interface AuditLogFilter {
  campaign_id?: string;
  account_id?: string;
  /** 대상 유형. 비우면 전부. */
  entity_types?: AuditLogEntry["entity_type"][];
  /** 행위자 구분. 비우면 전부. */
  actor_types?: AuditActorType[];
  /** 이 시각 이후만. ISO 문자열. */
  since?: string;
  /** 요약 문구와 행위자 이름에서 찾는다. */
  search?: string;
  limit?: number;
  /** 더 보기. 앞에서 건너뛸 개수. */
  offset?: number;
}

export async function getAuditLogs(filter?: AuditLogFilter): Promise<AuditLogEntry[]> {
  const { rows } = await queryAuditLogs(filter);
  return rows;
}

/**
 * 목록과 "더 볼 게 남았는지" 를 함께 준다. 활동 기록 화면의 더 보기에 쓴다.
 *
 * 전체 개수를 세지 않는 이유: 로그는 상한 없이 쌓이는데 매번 count 를 내면 갈수록 느려진다.
 * 한 건 더 받아보고 남았는지만 판단한다.
 */
export async function queryAuditLogs(
  filter?: AuditLogFilter
): Promise<{ rows: AuditLogEntry[]; hasMore: boolean }> {
  const limit = filter?.limit ?? 50;
  const offset = filter?.offset ?? 0;

  let q = db().from("audit_logs").select("*").order("created_at", { ascending: false });
  if (filter?.campaign_id) q = q.eq("campaign_id", filter.campaign_id);
  if (filter?.account_id) q = q.eq("account_id", filter.account_id);
  if (filter?.entity_types?.length) q = q.in("entity_type", filter.entity_types);
  if (filter?.actor_types?.length) q = q.in("actor_type", filter.actor_types);
  if (filter?.since) q = q.gte("created_at", filter.since);

  const search = filter?.search?.trim();
  if (search) {
    // 쉼표·괄호는 PostgREST 의 or 문법을 깨뜨리므로 뺀다.
    const safe = search.replace(/[,()*]/g, " ").trim();
    if (safe) q = q.or(`summary.ilike.%${safe}%,actor_name.ilike.%${safe}%`);
  }

  // 한 건 더 받아 다음 쪽이 있는지 본다.
  q = q.range(offset, offset + limit);

  const rows = unwrap(await q.returns<AuditLogRow[]>());
  const hasMore = rows.length > limit;
  return { rows: rows.slice(0, limit).map(rowToAuditLog), hasMore };
}
