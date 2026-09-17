import { db, unwrap, unwrapMaybe } from "./client";
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

/**
 * 더 보기 커서. 마지막으로 받은 행을 가리킨다.
 *
 * `offset` 대신 이걸 쓰는 이유: 감사 로그는 거의 모든 쓰기에서 한 줄씩 쌓인다.
 * 화면을 열어둔 사이에 새 로그가 맨 위에 끼면 창이 그만큼 밀려서, offset 은
 * 이미 본 행을 다시 가리키고(중복 + React key 충돌) 밀려난 만큼은 그 세션에서 영영 못 본다.
 * 마지막 행을 기준으로 "이 행보다 아래" 를 달라고 하면 위쪽이 아무리 늘어나도 창이 밀리지 않는다.
 */
export interface AuditLogCursor {
  /** 마지막으로 받은 행의 id. */
  id: string;
  /**
   * 그 행의 created_at.
   *
   * 화면까지 내려간 값은 밀리초까지만 남아 있다(mappers 의 `ts()` 가 Date 를 거치면서 자른다).
   * timestamptz 는 마이크로초까지 가지므로 잘린 값으로 자르면 같은 밀리초 안의 기록을 건너뛴다.
   * 그래서 서버가 이 id 로 원본 created_at 을 다시 읽고, 이 값은 그 조회가 비었을 때의 대비책으로만 쓴다.
   */
  created_at: string;
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
  /**
   * 더 보기. 앞에서 건너뛸 개수.
   *
   * 새 로그가 끼면 창이 밀리므로 쓰지 않는 것이 맞다. 옛 호출부 호환으로만 남겨 둔다.
   * `cursor` 가 있으면 이 값은 무시한다.
   */
  offset?: number;
  /** 더 보기. 이 행 **다음**부터 준다. 거르기 조건이 바뀌면 반드시 버려야 한다. */
  cursor?: AuditLogCursor | null;
}

// 커서는 화면(클라이언트)에서 그대로 돌아오므로 쿼리에 넣기 전에 모양을 확인한다.
// 아래 두 값은 PostgREST 의 `or(...)` 문자열에 그대로 들어가서, 쉼표·괄호가 섞이면 조건 자체가 뒤틀린다.
const CURSOR_ID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const CURSOR_AT_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * 커서가 가리키는 행의 **원본** created_at 을 찾는다.
 *
 * 감사 로그는 지우지 않는(fk 도 없다) 표라 id 로 찾으면 거의 항상 있다. 혹시 없으면
 * 넘어온 값을 그대로 쓴다 — 기준점이 이미 사라진 상황이라 밀리초까지의 정확도로 충분하다.
 */
async function resolveCursorPoint(cursor: AuditLogCursor): Promise<{ at: string; id: string }> {
  if (!CURSOR_ID_RE.test(cursor.id)) {
    throw new Error("[db] 활동 기록 커서가 올바르지 않습니다.");
  }
  const row = unwrapMaybe(
    await db()
      .from("audit_logs")
      .select("created_at")
      .eq("id", cursor.id)
      .maybeSingle<{ created_at: string }>()
  );
  const raw = row?.created_at ?? cursor.created_at;
  if (!raw || !CURSOR_AT_RE.test(raw)) {
    throw new Error("[db] 활동 기록 커서가 올바르지 않습니다.");
  }
  // `+` 는 쿼리 문자열에서 공백으로 읽힐 여지가 있어 같은 뜻의 `Z` 로 바꾼다. 값 자체는 그대로다.
  return { at: raw.replace(/\+00:00$/, "Z"), id: cursor.id };
}

export async function getAuditLogs(filter?: AuditLogFilter): Promise<AuditLogEntry[]> {
  const { rows } = await queryAuditLogs(filter);
  return rows;
}

/**
 * 목록과 "더 볼 게 남았는지", 그리고 다음 쪽을 받을 커서를 함께 준다. 활동 기록 화면의 더 보기에 쓴다.
 *
 * 전체 개수를 세지 않는 이유: 로그는 상한 없이 쌓이는데 매번 count 를 내면 갈수록 느려진다.
 * 한 건 더 받아보고 남았는지만 판단한다.
 */
export async function queryAuditLogs(
  filter?: AuditLogFilter
): Promise<{ rows: AuditLogEntry[]; hasMore: boolean; nextCursor: AuditLogCursor | null }> {
  const limit = filter?.limit ?? 50;

  let q = db()
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    // 동점을 id 로 고정한다. 한 요청이 로그를 여러 줄 남기면 created_at 이 같을 수 있는데,
    // 그때 순서가 매번 달라지면 커서든 offset 이든 기준점이 없어 중복·누락이 난다.
    .order("id", { ascending: false });
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
  if (filter?.cursor) {
    const point = await resolveCursorPoint(filter.cursor);
    // (created_at, id) 를 한 쌍으로 비교한다 — "created_at 이 더 이르거나, 같은데 id 가 더 작은" 행.
    // PostgREST 에는 행 비교((a,b) < (x,y)) 가 없어서 or 로 푼다.
    // 위의 검색 조건도 or 인데, 서로 다른 조건으로 각각 걸려서 AND 로 묶인다(서로 덮어쓰지 않는다).
    q = q.or(`created_at.lt.${point.at},and(created_at.eq.${point.at},id.lt.${point.id})`);
    q = q.limit(limit + 1);
  } else {
    const offset = filter?.offset ?? 0;
    q = q.range(offset, offset + limit);
  }

  const raw = unwrap(await q.returns<AuditLogRow[]>());
  const hasMore = raw.length > limit;
  const page = raw.slice(0, limit);
  const last = page[page.length - 1];
  return {
    rows: page.map(rowToAuditLog),
    hasMore,
    // created_at 은 DB 원본 그대로 넘긴다(rowToAuditLog 를 거치면 마이크로초가 잘린다).
    nextCursor: last ? { id: last.id, created_at: last.created_at } : null,
  };
}
