/**
 * 행사 모듈.
 *
 * 인플루언서 행사(events)와 그에 딸린 초대 명단(event_invitees), 준비 체크리스트(event_checklist_items),
 * PPT 운영안(event_plans)의 조회·생성·수정·삭제를 맡는다.
 *
 * - 행사를 지우면 초대·체크리스트·운영안은 DB fk cascade 가 함께 지운다. 코드에서 따로 걸러내지 않는다.
 * - 초대의 applicant_id 는 fk `on delete set null` 이라 지원자가 지워져도 초대 기록은 남는다.
 * - 운영안은 행사당 하나(event_id unique)라 upsert 로 저장한다.
 *
 * 캠페인·지원자 행은 다른 도메인 모듈을 거치지 않고 직접 조회한다(순환 의존 방지).
 * 유일한 예외는 운영안 템플릿 확인이다. 내장 템플릿은 DB 가 아니라 코드에 있어서
 * `ppt-templates` 모듈이 합쳐 주는 결과를 써야 한다.
 */
import { insertAuditLog } from "./audit";
import { db, unwrap, unwrapMaybe } from "./client";
import {
  rowToEvent,
  rowToEventChecklistItem,
  rowToEventInvitee,
  rowToEventPlan,
  type ApplicantRow,
  type EventChecklistItemRow,
  type EventInviteeRow,
  type EventPlanRow,
  type EventRow,
} from "./mappers";
import { getPptTemplateById } from "./ppt-templates";
import {
  EVENT_STATUS_LABELS,
  type EventChecklistItem,
  type EventInvitee,
  type EventPlan,
  type EventRsvpStatus,
  type EventStatus,
  type MarketingEvent,
} from "./types";
import {
  cleanFieldValues,
  EVENT_STATUSES,
  isUuid,
  nowIso,
  oneOf,
  optionalDate,
  optionalIsoDateTime,
  optionalText,
  optionalUrl,
  requireText,
  RSVP_STATUSES,
  ValidationError,
} from "./validation";

// ---------- 내부 헬퍼 ----------

/**
 * id 형식 가드.
 * 모든 id 컬럼이 uuid 라서, URL 파라미터 같은 엉뚱한 문자열이 그대로 쿼리에 닿으면
 * Postgres 타입 에러(22P02)로 500 이 난다. 옛 JSON 구현처럼 "없음" 으로 처리하려면
 * 쿼리 전에 걸러야 한다. 각 함수는 형식이 틀리면 null / false / 빈 배열 / ValidationError 를 돌려준다.
 */

/**
 * 감사 로그에 쓰는 행사 최소 정보.
 * 초대·체크리스트·운영안은 행사 id 만 알고 캠페인 id 와 행사명을 모른다.
 * 로그의 campaign_id(캠페인 상세가 이걸로 거른다)와 행사명 문구를 채우려면 이 세 컬럼이 필요하다.
 */
type EventBrief = Pick<EventRow, "id" | "campaign_id" | "name">;

/** 감사 로그 문구에 쓰는 RSVP 상태 이름. 화면(EventDetailClient)의 선택지 문구와 맞춘다. */
const RSVP_STATUS_LABELS: Record<EventRsvpStatus, string> = {
  pending: "미응답",
  attending: "참석",
  not_attending: "불참",
};

/**
 * 행사가 있는지 확인하고 로그용 최소 정보를 돌려준다. 없으면 ValidationError.
 * 초대·체크리스트·운영안 생성 전에 부른다. 어차피 하던 존재 확인 조회라 쿼리는 늘지 않는다.
 */
async function requireEventBrief(eventId: string): Promise<EventBrief> {
  if (!isUuid(eventId)) throw new ValidationError("행사를 찾을 수 없습니다.");
  const row = unwrapMaybe(
    await db()
      .from("events")
      .select("id, campaign_id, name")
      .eq("id", eventId)
      .maybeSingle<EventBrief>()
  );
  if (!row) throw new ValidationError("행사를 찾을 수 없습니다.");
  return row;
}

/** 위와 같지만 없으면 null. 초대·체크리스트 수정/삭제처럼 던지지 않는 함수에서 쓴다. */
async function getEventBrief(eventId: string): Promise<EventBrief | null> {
  if (!isUuid(eventId)) return null;
  return unwrapMaybe(
    await db()
      .from("events")
      .select("id, campaign_id, name")
      .eq("id", eventId)
      .maybeSingle<EventBrief>()
  );
}

// ---------- 행사 ----------

/** 캠페인의 행사 목록. 생성 순(created_at asc). */
export async function getEventsByCampaignId(campaignId: string): Promise<MarketingEvent[]> {
  if (!isUuid(campaignId)) return [];
  const rows = unwrap(
    await db()
      .from("events")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .returns<EventRow[]>()
  );
  return rows.map(rowToEvent);
}

/** 전체 행사 목록. 생성 순(created_at asc). */
export async function getAllEvents(): Promise<MarketingEvent[]> {
  const rows = unwrap(
    await db().from("events").select("*").order("created_at", { ascending: true }).returns<EventRow[]>()
  );
  return rows.map(rowToEvent);
}

export async function getEventById(eventId: string): Promise<MarketingEvent | null> {
  if (!isUuid(eventId)) return null;
  const row = unwrapMaybe(
    await db().from("events").select("*").eq("id", eventId).maybeSingle<EventRow>()
  );
  return row ? rowToEvent(row) : null;
}

/** 행사를 새로 만든다. 연계 캠페인이 없으면 ValidationError. 상태는 항상 "preparing" 으로 시작한다. */
export async function createEvent(data: {
  campaign_id: string;
  name: string;
  event_at: string | null;
  venue: string | null;
  memo: string | null;
}): Promise<MarketingEvent> {
  const name = requireText(data.name, "행사명", 200);
  const eventAt = optionalIsoDateTime(data.event_at, "행사 일시");

  if (!isUuid(data.campaign_id)) throw new ValidationError("연계할 캠페인을 찾을 수 없습니다.");
  const campaign = unwrapMaybe(
    await db().from("campaigns").select("id").eq("id", data.campaign_id).maybeSingle<{ id: string }>()
  );
  if (!campaign) throw new ValidationError("연계할 캠페인을 찾을 수 없습니다.");

  const row = unwrap(
    await db()
      .from("events")
      .insert({
        campaign_id: data.campaign_id,
        name,
        event_at: eventAt,
        venue: optionalText(data.venue, 300),
        memo: optionalText(data.memo, 3000),
        status: "preparing",
        created_at: nowIso(),
      })
      .select("*")
      .single<EventRow>()
  );
  const event = rowToEvent(row);

  await insertAuditLog({
    campaign_id: event.campaign_id,
    entity_type: "event",
    entity_id: event.id,
    action: "event.created",
    actor_type: "agency",
    summary: `[${event.name}] 행사를 만들었습니다.`,
  });
  return event;
}

/**
 * 행사 부분 수정. 준 필드만 바꾼다. 행사가 없으면 null.
 * 바꿀 필드가 하나도 없으면 update 를 보내지 않고 현재 행을 그대로 돌려준다
 * (PostgREST 는 빈 본문 update 를 거부한다).
 */
export async function updateEvent(
  eventId: string,
  patch: { name?: string; event_at?: string | null; venue?: string | null; memo?: string | null; status?: EventStatus }
): Promise<MarketingEvent | null> {
  if (!isUuid(eventId)) return null;
  const changes: Partial<Pick<EventRow, "name" | "event_at" | "venue" | "memo" | "status">> = {};
  if (patch.name !== undefined) changes.name = requireText(patch.name, "행사명", 200);
  if (patch.event_at !== undefined) changes.event_at = optionalIsoDateTime(patch.event_at, "행사 일시");
  if (patch.venue !== undefined) changes.venue = optionalText(patch.venue, 300);
  if (patch.memo !== undefined) changes.memo = optionalText(patch.memo, 3000);
  if (patch.status !== undefined) changes.status = oneOf(patch.status, EVENT_STATUSES, "행사 상태");

  if (Object.keys(changes).length === 0) return getEventById(eventId);

  const row = unwrapMaybe(
    await db().from("events").update(changes).eq("id", eventId).select("*").maybeSingle<EventRow>()
  );
  if (!row) return null;
  const event = rowToEvent(row);

  // 상태를 함께 보냈으면 어떤 상태가 됐는지 문구에 드러낸다(준비중/행사완료/취소됨).
  await insertAuditLog({
    campaign_id: event.campaign_id,
    entity_type: "event",
    entity_id: event.id,
    action: "event.updated",
    actor_type: "agency",
    summary: changes.status
      ? `[${event.name}] 행사 상태를 [${EVENT_STATUS_LABELS[event.status]}](으)로 변경했습니다.`
      : `[${event.name}] 행사 정보를 수정했습니다.`,
    details: changes.status ? { status: event.status } : null,
  });
  return event;
}

/** 행사 삭제. 초대·체크리스트·운영안은 fk cascade 로 함께 지워진다. 지운 행이 없으면 false. */
export async function deleteEvent(eventId: string): Promise<boolean> {
  if (!isUuid(eventId)) return false;
  // 지우고 나면 행사명·캠페인 id 를 읽을 수 없어서 먼저 조회하고 로그부터 남긴다.
  const ev = await getEventBrief(eventId);
  if (!ev) return false;

  await insertAuditLog({
    campaign_id: ev.campaign_id,
    entity_type: "event",
    entity_id: ev.id,
    action: "event.deleted",
    actor_type: "agency",
    summary: `[${ev.name}] 행사를 삭제했습니다.`,
  });

  const rows = unwrap(
    await db().from("events").delete().eq("id", eventId).select("id").returns<{ id: string }[]>()
  );
  return rows.length > 0;
}

// ---------- 초대 명단 ----------

/** 행사의 초대 명단. 추가 순(created_at asc). */
export async function getEventInvitees(eventId: string): Promise<EventInvitee[]> {
  if (!isUuid(eventId)) return [];
  const rows = unwrap(
    await db()
      .from("event_invitees")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true })
      .returns<EventInviteeRow[]>()
  );
  return rows.map(rowToEventInvitee);
}

/**
 * 캠페인 지원자를 초대 명단으로 가져온다.
 * - 행사가 없으면 ValidationError.
 * - 행사가 속한 캠페인의 지원자만 받는다. 다른 캠페인 id 가 섞여 있으면 조용히 무시한다.
 * - 이미 초대된 지원자는 건너뛴다. 실제로 새로 추가된 초대만 돌려준다.
 * - uuid 형식이 아닌 지원자 id 는 옛 구현에서 아무것도 매치하지 않던 것과 같게 조용히 버린다.
 */
export async function addEventInviteesFromApplicants(
  eventId: string,
  applicantIds: string[]
): Promise<EventInvitee[]> {
  if (!isUuid(eventId)) throw new ValidationError("행사를 찾을 수 없습니다.");
  const ev = unwrapMaybe(
    await db().from("events").select("*").eq("id", eventId).maybeSingle<EventRow>()
  );
  if (!ev) throw new ValidationError("행사를 찾을 수 없습니다.");

  const validIds = applicantIds.filter(isUuid);
  if (validIds.length === 0) return [];

  const applicants = unwrap(
    await db()
      .from("applicants")
      .select("*")
      .in("id", validIds)
      .eq("campaign_id", ev.campaign_id)
      .order("applied_at", { ascending: true })
      .returns<ApplicantRow[]>()
  );
  if (applicants.length === 0) return [];

  const existing = unwrap(
    await db()
      .from("event_invitees")
      .select("applicant_id")
      .eq("event_id", eventId)
      .not("applicant_id", "is", null)
      .returns<{ applicant_id: string }[]>()
  );
  const alreadyInvited = new Set(existing.map((r) => r.applicant_id));

  const createdAt = nowIso();
  const toInsert = applicants
    .filter((a) => !alreadyInvited.has(a.id))
    .map((a) => ({
      event_id: eventId,
      applicant_id: a.id,
      name: a.name,
      sns_url: a.sns_link,
      contact: a.contact,
      rsvp_status: "pending" as const,
      attended: false,
      memo: null,
      created_at: createdAt,
    }));
  if (toInsert.length === 0) return [];

  const rows = unwrap(
    await db().from("event_invitees").insert(toInsert).select("*").returns<EventInviteeRow[]>()
  );

  // 한 번에 여러 명을 가져오므로 사람마다 남기지 않고 한 줄로 묶는다.
  if (rows.length > 0) {
    await insertAuditLog({
      campaign_id: ev.campaign_id,
      entity_type: "event",
      entity_id: ev.id,
      action: "event.invitee_added",
      actor_type: "agency",
      summary: `[${ev.name}] 지원자 ${rows.length}명을 초대 명단에 추가했습니다.`,
    });
  }
  return rows.map(rowToEventInvitee);
}

/** 지원자와 무관한 초대를 직접 추가한다 (applicant_id 는 null). */
export async function addDirectEventInvitee(data: {
  event_id: string;
  name: string;
  sns_url: string | null;
  contact: string | null;
  memo: string | null;
}): Promise<EventInvitee> {
  const name = requireText(data.name, "이름", 100);
  const snsUrl = optionalUrl(data.sns_url, "SNS URL");
  const ev = await requireEventBrief(data.event_id);

  const row = unwrap(
    await db()
      .from("event_invitees")
      .insert({
        event_id: data.event_id,
        applicant_id: null,
        name,
        sns_url: snsUrl,
        contact: optionalText(data.contact, 50),
        rsvp_status: "pending",
        attended: false,
        memo: optionalText(data.memo, 1000),
        created_at: nowIso(),
      })
      .select("*")
      .single<EventInviteeRow>()
  );
  const invitee = rowToEventInvitee(row);

  await insertAuditLog({
    campaign_id: ev.campaign_id,
    entity_type: "event",
    entity_id: ev.id,
    action: "event.invitee_added",
    actor_type: "agency",
    summary: `[${ev.name}] 초대 명단에 ${invitee.name}님을 추가했습니다.`,
  });
  return invitee;
}

/** 초대 부분 수정(RSVP·참석 여부·메모). 초대가 없으면 null. 바꿀 필드가 없으면 현재 행을 돌려준다. */
export async function updateEventInvitee(
  inviteeId: string,
  patch: { rsvp_status?: EventRsvpStatus; attended?: boolean; memo?: string | null }
): Promise<EventInvitee | null> {
  if (!isUuid(inviteeId)) return null;
  const changes: Partial<Pick<EventInviteeRow, "rsvp_status" | "attended" | "memo">> = {};
  if (patch.rsvp_status !== undefined) changes.rsvp_status = oneOf(patch.rsvp_status, RSVP_STATUSES, "RSVP 상태");
  if (patch.attended !== undefined) changes.attended = Boolean(patch.attended);
  if (patch.memo !== undefined) changes.memo = optionalText(patch.memo, 1000);

  // 바뀐 게 RSVP·참석 체크인지 메모뿐인지 가리려면 이전 값이 필요하다.
  // 바꿀 필드가 없을 때 어차피 하던 조회를 앞으로 옮긴 것이라 쿼리는 늘지 않는다.
  const current = unwrapMaybe(
    await db().from("event_invitees").select("*").eq("id", inviteeId).maybeSingle<EventInviteeRow>()
  );
  if (!current) return null;
  if (Object.keys(changes).length === 0) return rowToEventInvitee(current);

  const row = unwrapMaybe(
    await db()
      .from("event_invitees")
      .update(changes)
      .eq("id", inviteeId)
      .select("*")
      .maybeSingle<EventInviteeRow>()
  );
  if (!row) return null;
  const invitee = rowToEventInvitee(row);

  // 메모는 입력칸에서 포커스가 빠질 때마다 자동 저장되므로, 메모만 바뀐 경우는 로그를 남기지 않는다.
  const rsvpChanged = invitee.rsvp_status !== current.rsvp_status;
  const attendedChanged = invitee.attended !== current.attended;
  if (rsvpChanged || attendedChanged) {
    // 캠페인 id·행사명은 초대 행에 없다. 로그를 남길 때만 행사 행을 읽는다.
    const ev = await getEventBrief(invitee.event_id);
    if (ev) {
      const parts: string[] = [];
      if (rsvpChanged) {
        parts.push(`참석 여부를 [${RSVP_STATUS_LABELS[invitee.rsvp_status]}](으)로 변경`);
      }
      if (attendedChanged) {
        parts.push(invitee.attended ? "현장 참석을 체크" : "현장 참석 체크를 해제");
      }
      await insertAuditLog({
        campaign_id: ev.campaign_id,
        entity_type: "event",
        entity_id: ev.id,
        action: "event.invitee_updated",
        actor_type: "agency",
        summary: `[${ev.name}] ${invitee.name}님의 ${parts.join("하고 ")}했습니다.`,
      });
    }
  }
  return invitee;
}

/** 초대 삭제. 지운 행이 없으면 false. */
export async function deleteEventInvitee(inviteeId: string): Promise<boolean> {
  if (!isUuid(inviteeId)) return false;
  // 지우고 나면 이름을 읽을 수 없어서 먼저 조회하고 로그부터 남긴다.
  const current = unwrapMaybe(
    await db()
      .from("event_invitees")
      .select("id, event_id, name")
      .eq("id", inviteeId)
      .maybeSingle<Pick<EventInviteeRow, "id" | "event_id" | "name">>()
  );
  if (!current) return false;

  const ev = await getEventBrief(current.event_id);
  if (ev) {
    await insertAuditLog({
      campaign_id: ev.campaign_id,
      entity_type: "event",
      entity_id: ev.id,
      action: "event.invitee_removed",
      actor_type: "agency",
      summary: `[${ev.name}] 초대 명단에서 ${current.name}님을 삭제했습니다.`,
    });
  }

  const rows = unwrap(
    await db().from("event_invitees").delete().eq("id", inviteeId).select("id").returns<{ id: string }[]>()
  );
  return rows.length > 0;
}

// ---------- 체크리스트 ----------

/** 행사의 체크리스트. sort_order asc. */
export async function getEventChecklistItems(eventId: string): Promise<EventChecklistItem[]> {
  if (!isUuid(eventId)) return [];
  const rows = unwrap(
    await db()
      .from("event_checklist_items")
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .returns<EventChecklistItemRow[]>()
  );
  return rows.map(rowToEventChecklistItem);
}

/** 전체 체크리스트(행사 구분 없음). 행사별로 묶이고 그 안에서 sort_order asc 가 되도록 정렬한다. */
export async function getAllEventChecklistItems(): Promise<EventChecklistItem[]> {
  const rows = unwrap(
    await db()
      .from("event_checklist_items")
      .select("*")
      .order("event_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .returns<EventChecklistItemRow[]>()
  );
  return rows.map(rowToEventChecklistItem);
}

/**
 * 체크리스트 항목 추가. 행사가 없으면 ValidationError.
 * sort_order 는 그 행사의 현재 최댓값 + 1. 항목이 없으면 1 (옛 구현과 같은 값).
 * 최댓값 조회와 insert 사이에 다른 요청이 끼어들면 같은 순번이 생길 수 있지만,
 * 순번은 정렬 힌트일 뿐 유일성이 필요하지 않아 그대로 둔다.
 */
export async function addEventChecklistItem(data: {
  event_id: string;
  label: string;
  due_date: string | null;
  assignee: string | null;
}): Promise<EventChecklistItem> {
  const label = requireText(data.label, "할 일 내용", 300);
  const dueDate = optionalDate(data.due_date, "마감일");
  const ev = await requireEventBrief(data.event_id);

  const last = unwrapMaybe(
    await db()
      .from("event_checklist_items")
      .select("sort_order")
      .eq("event_id", data.event_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle<{ sort_order: number }>()
  );
  const sortOrder = Math.max(last?.sort_order ?? 0, 0) + 1;

  const row = unwrap(
    await db()
      .from("event_checklist_items")
      .insert({
        event_id: data.event_id,
        label,
        due_date: dueDate,
        assignee: optionalText(data.assignee, 100),
        done: false,
        sort_order: sortOrder,
        created_at: nowIso(),
      })
      .select("*")
      .single<EventChecklistItemRow>()
  );
  const item = rowToEventChecklistItem(row);

  await insertAuditLog({
    campaign_id: ev.campaign_id,
    entity_type: "event",
    entity_id: ev.id,
    action: "event.checklist_added",
    actor_type: "agency",
    summary: `[${ev.name}] 준비 체크리스트에 [${item.label}] 항목을 추가했습니다.`,
  });
  return item;
}

/** 체크리스트 항목 부분 수정. 항목이 없으면 null. 바꿀 필드가 없으면 현재 행을 돌려준다. */
export async function updateEventChecklistItem(
  itemId: string,
  patch: { label?: string; due_date?: string | null; assignee?: string | null; done?: boolean }
): Promise<EventChecklistItem | null> {
  if (!isUuid(itemId)) return null;
  const changes: Partial<Pick<EventChecklistItemRow, "label" | "due_date" | "assignee" | "done">> = {};
  if (patch.label !== undefined) changes.label = requireText(patch.label, "할 일 내용", 300);
  if (patch.due_date !== undefined) changes.due_date = optionalDate(patch.due_date, "마감일");
  if (patch.assignee !== undefined) changes.assignee = optionalText(patch.assignee, 100);
  if (patch.done !== undefined) changes.done = Boolean(patch.done);

  // 완료 체크가 바뀌었는지 보려면 이전 값이 필요하다.
  // 바꿀 필드가 없을 때 어차피 하던 조회를 앞으로 옮긴 것이라 쿼리는 늘지 않는다.
  const current = unwrapMaybe(
    await db()
      .from("event_checklist_items")
      .select("*")
      .eq("id", itemId)
      .maybeSingle<EventChecklistItemRow>()
  );
  if (!current) return null;
  if (Object.keys(changes).length === 0) return rowToEventChecklistItem(current);

  const row = unwrapMaybe(
    await db()
      .from("event_checklist_items")
      .update(changes)
      .eq("id", itemId)
      .select("*")
      .maybeSingle<EventChecklistItemRow>()
  );
  if (!row) return null;
  const item = rowToEventChecklistItem(row);

  // 캠페인 id·행사명은 체크리스트 행에 없어서 행사 행을 읽어 온다.
  const ev = await getEventBrief(item.event_id);
  if (ev) {
    const doneChanged = item.done !== current.done;
    await insertAuditLog({
      campaign_id: ev.campaign_id,
      entity_type: "event",
      entity_id: ev.id,
      action: "event.checklist_updated",
      actor_type: "agency",
      summary: doneChanged
        ? `[${ev.name}] 체크리스트 [${item.label}] 항목을 ${item.done ? "완료 처리" : "완료 해제"}했습니다.`
        : `[${ev.name}] 체크리스트 [${item.label}] 항목을 수정했습니다.`,
    });
  }
  return item;
}

/** 체크리스트 항목 삭제. 지운 행이 없으면 false. */
export async function deleteEventChecklistItem(itemId: string): Promise<boolean> {
  if (!isUuid(itemId)) return false;
  // 지우고 나면 항목 내용을 읽을 수 없어서 먼저 조회하고 로그부터 남긴다.
  const current = unwrapMaybe(
    await db()
      .from("event_checklist_items")
      .select("id, event_id, label")
      .eq("id", itemId)
      .maybeSingle<Pick<EventChecklistItemRow, "id" | "event_id" | "label">>()
  );
  if (!current) return false;

  const ev = await getEventBrief(current.event_id);
  if (ev) {
    await insertAuditLog({
      campaign_id: ev.campaign_id,
      entity_type: "event",
      entity_id: ev.id,
      action: "event.checklist_removed",
      actor_type: "agency",
      summary: `[${ev.name}] 체크리스트에서 [${current.label}] 항목을 삭제했습니다.`,
    });
  }

  const rows = unwrap(
    await db()
      .from("event_checklist_items")
      .delete()
      .eq("id", itemId)
      .select("id")
      .returns<{ id: string }[]>()
  );
  return rows.length > 0;
}

// ---------- 운영안 (PPT) ----------

/** 행사의 운영안. 행사당 하나이며 아직 저장한 적 없으면 null. */
export async function getEventPlan(eventId: string): Promise<EventPlan | null> {
  if (!isUuid(eventId)) return null;
  const row = unwrapMaybe(
    await db().from("event_plans").select("*").eq("event_id", eventId).maybeSingle<EventPlanRow>()
  );
  return row ? rowToEventPlan(row) : null;
}

/**
 * 운영안 저장. 있으면 덮어쓰고 없으면 만든다(event_id 기준 upsert).
 * - 행사가 없으면 ValidationError.
 * - 템플릿은 반드시 kind === "event" 여야 한다. 내장 템플릿도 허용되므로
 *   DB 를 직접 보지 않고 `getPptTemplateById` (내장 + 업로드 합산) 로 확인한다.
 */
export async function saveEventPlan(data: {
  event_id: string;
  template_id: string;
  field_values: Record<string, string>;
}): Promise<EventPlan> {
  const values = cleanFieldValues(data.field_values);
  const ev = await requireEventBrief(data.event_id);

  const template = await getPptTemplateById(data.template_id);
  if (!template || template.kind !== "event") {
    throw new ValidationError("행사용 PPT 템플릿을 선택해주세요.");
  }

  const row = unwrap(
    await db()
      .from("event_plans")
      .upsert(
        {
          event_id: data.event_id,
          template_id: template.id,
          field_values: values,
          updated_at: nowIso(),
        },
        { onConflict: "event_id" }
      )
      .select("*")
      .single<EventPlanRow>()
  );
  const plan = rowToEventPlan(row);

  await insertAuditLog({
    campaign_id: ev.campaign_id,
    entity_type: "event",
    entity_id: ev.id,
    action: "event.plan_saved",
    actor_type: "agency",
    summary: `[${ev.name}] 행사 운영안을 [${template.name}] 템플릿으로 저장했습니다.`,
  });
  return plan;
}
