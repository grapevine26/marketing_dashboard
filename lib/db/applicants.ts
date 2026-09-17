/**
 * 지원자 · 선정 상태 · 시딩 기록.
 *
 * 옛 `lib/db/index.ts` 의 지원자/시딩 함수를 Supabase 쿼리로 옮긴 것이다.
 * 함수 이름·시그니처·검증 규칙·에러 메시지·감사 로그 문구는 옛 코드와 같다.
 *
 * - 다른 도메인 모듈을 import 하지 않는다. 캠페인·폼 설정이 필요하면 여기서 직접 조회한다.
 * - 원시 행은 밖으로 내보내지 않는다. 항상 mappers 를 거쳐 앱 타입으로 돌려준다.
 * - 옵셔널 입력(undefined)은 DB 에 null 로 쓴다. 매퍼가 읽을 때 다시 undefined 로 되돌린다.
 * - 여러 테이블을 건드리는 쓰기(선정 → 시딩 기록 생성 → 감사 로그)는 트랜잭션 없이 순차로 한다.
 *   중간 실패 시 앞 단계가 남을 수 있으나 앱은 "시딩 기록 없음"을 이미 처리한다(설계 문서 참고).
 */

import { insertAuditLog } from "./audit";
import { db, unwrap, unwrapMaybe } from "./client";
import {
  rowToApplicant,
  rowToSeedingRecord,
  type ApplicantRow,
  type CampaignRow,
  type FormConfigRow,
  type SeedingRecordRow,
} from "./mappers";
import {
  APPLICANT_STATUSES,
  PROGRESS_STAGES,
  ValidationError,
  isUuid,
  nonNegativeInt,
  nowIso,
  oneOf,
  optionalDate,
  optionalText,
  optionalUrl,
  requireText,
} from "./validation";
import {
  APPLICANT_STATUS_LABELS,
  type Applicant,
  type ApplicantStatus,
  type ProgressStage,
  type SeedingRecord,
} from "./types";
import { josa } from "@/lib/ui/josa";

// ---------- 지원자 조회 ----------

export async function getApplicantsByCampaignId(campaignId: string): Promise<Applicant[]> {
  if (!isUuid(campaignId)) return [];
  const rows = unwrap(
    await db()
      .from("applicants")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("applied_at", { ascending: true })
      .returns<ApplicantRow[]>()
  );
  return rows.map(rowToApplicant);
}

/** 캠페인 하나의 지원자 수 요약. */
export interface ApplicantCounts {
  /** 전체 지원자 수 */
  total: number;
  /** 최종선정된 수 */
  selected: number;
}

/**
 * 캠페인별 지원자 수를 **한 번의 조회로** 센다. 캠페인 id -> 수.
 *
 * 캠페인 목록 화면은 수만 보여주고 지원자 내용은 쓰지 않는다. 그런데 캠페인마다
 * `getApplicantsByCampaignId` 를 부르면 캠페인 수만큼 왕복하고, 그때마다 이름·연락처·주소가
 * 전부 딸려 온다. **화면에 쓰지도 않을 개인정보를 서버 메모리로 끌어오는 셈이다.**
 * 여기서는 `campaign_id` 와 `status` 두 칸만 받아 센다.
 *
 * 없는 캠페인은 결과에 담기지 않는다. 읽는 쪽에서 0 으로 다루면 된다.
 */
export async function countApplicantsByCampaign(): Promise<Map<string, ApplicantCounts>> {
  const rows = unwrap(
    await db()
      .from("applicants")
      .select("campaign_id, status")
      .returns<{ campaign_id: string; status: string }[]>()
  );
  const counts = new Map<string, ApplicantCounts>();
  for (const row of rows) {
    const current = counts.get(row.campaign_id) ?? { total: 0, selected: 0 };
    current.total += 1;
    if (row.status === "selected") current.selected += 1;
    counts.set(row.campaign_id, current);
  }
  return counts;
}

/** 오버뷰가 쓰는 지원자 요약. 화면에 필요한 칸만 담는다. */
export interface ApplicantSummary {
  id: string;
  campaign_id: string;
  /** 일정 라벨에 쓴다("김서연 업로드 마감"). */
  name: string;
  status: ApplicantStatus;
  applied_at: string | null;
}

/**
 * 모든 지원자의 요약을 **한 번의 조회로** 가져온다.
 *
 * 오버뷰는 캠페인마다 `getApplicantsByCampaignId` 를 불렀다. 캠페인이 늘수록 왕복이 그만큼
 * 늘고(한 곳은 **순차**라 줄줄이 기다렸다), 그때마다 **연락처·배송주소·SNS 링크까지 딸려 왔다.**
 * 오버뷰가 쓰는 것은 이름·상태·지원일뿐이다.
 *
 * 화면에 쓰지 않는 개인정보는 서버 메모리에도 올리지 않는 편이 낫다. 실수로 어딘가에
 * 흘러 나갈 자리가 아예 없어진다.
 */
export async function listApplicantSummaries(): Promise<ApplicantSummary[]> {
  const rows = unwrap(
    await db()
      .from("applicants")
      .select("id, campaign_id, name, status, applied_at")
      .returns<ApplicantSummary[]>()
  );
  return rows;
}

export async function getApplicantById(id: string): Promise<Applicant | null> {
  if (!isUuid(id)) return null;
  const row = unwrapMaybe(
    await db().from("applicants").select("*").eq("id", id).maybeSingle<ApplicantRow>()
  );
  return row ? rowToApplicant(row) : null;
}

// ---------- 지원자 생성 ----------

/** 중복 SNS 비교용 정규화. 앞뒤 공백을 떼고 소문자로 바꾸고 끝의 `/` 하나를 뗀다. */
function normalizeSnsLink(link: string): string {
  return link.trim().toLowerCase().replace(/\/$/, "");
}

export async function createApplicant(data: {
  campaign_id: string;
  name: string;
  sns_link: string;
  nationality: string;
  contact: string;
  follower_count?: number | null;
  category?: string | null;
  agency_memo?: string | null;
  shipping_address?: string | null;
  visit_schedule?: string | null;
  visit_party_size?: number | null;
  custom_answers?: Record<string, unknown>;
  privacy_agreed: boolean;
  secondary_use_agreed: boolean;
  allow_duplicate?: boolean;
}): Promise<Applicant> {
  // uuid 형식이 아니면 캠페인이 없는 것과 같다. uuid 컬럼에 대고 조회하면 500 이 나므로 먼저 거른다.
  if (!isUuid(data.campaign_id)) throw new ValidationError("캠페인을 찾을 수 없습니다.");
  const campaign = unwrapMaybe(
    await db().from("campaigns").select("*").eq("id", data.campaign_id).maybeSingle<CampaignRow>()
  );
  if (!campaign) throw new ValidationError("캠페인을 찾을 수 없습니다.");

  const formConfig = unwrapMaybe(
    await db()
      .from("form_configs")
      .select("*")
      .eq("campaign_id", campaign.id)
      .maybeSingle<FormConfigRow>()
  );
  if (formConfig && !formConfig.is_published) {
    throw new ValidationError("현재 모집이 마감되었습니다.");
  }
  if (!data.privacy_agreed) {
    throw new ValidationError("개인정보 수집 및 이용에 동의해주세요.");
  }

  const name = requireText(data.name, "성함", 100);
  const snsLink = optionalUrl(data.sns_link, "SNS 계정 URL");
  if (!snsLink) throw new ValidationError("SNS 계정 URL을 입력해주세요.");

  // 중복 SNS 검사. 정규화 비교라 DB 에서 eq 로 못 거르므로 같은 캠페인의 sns_link 만 가져와 앱에서 비교한다.
  const cleanSns = normalizeSnsLink(snsLink);
  const existingLinks = unwrap(
    await db()
      .from("applicants")
      .select("sns_link")
      .eq("campaign_id", campaign.id)
      .returns<Pick<ApplicantRow, "sns_link">[]>()
  );
  const existingApplicant = existingLinks.some(
    (a) => normalizeSnsLink(a.sns_link || "") === cleanSns
  );
  if (existingApplicant && !data.allow_duplicate) {
    throw new ValidationError("DUPLICATE_SNS: 이미 동일한 SNS 계정으로 접수된 지원서가 있습니다.");
  }

  const nationality = requireText(data.nationality, "국적", 100);
  const contact = requireText(data.contact, "연락처", 50);

  let shippingAddress: string | null = null;
  let visitSchedule: string | null = null;
  let visitPartySize: number | null = null;
  if (campaign.campaign_type === "shipping") {
    shippingAddress = requireText(data.shipping_address, "배송지 주소", 300);
  } else {
    visitSchedule = requireText(data.visit_schedule, "방문 희망 일정", 300);
    const size = data.visit_party_size ?? 1;
    visitPartySize = Math.min(Math.max(nonNegativeInt(size, "방문 인원수"), 1), 20);
  }

  const customAnswers: Record<string, string | number | boolean> = {};
  for (const q of formConfig?.custom_questions || []) {
    const raw = data.custom_answers?.[q.id];
    if (q.type === "checkbox") {
      customAnswers[q.id] = raw === true || raw === "true";
      if (q.required && !customAnswers[q.id]) {
        throw new ValidationError(`필수 항목을 체크해주세요: ${q.label}`);
      }
      continue;
    }
    const text = raw === undefined || raw === null ? "" : String(raw).trim();
    if (q.required && !text) throw new ValidationError(`필수 항목을 입력해주세요: ${q.label}`);
    if (!text) continue;
    if (q.type === "number") {
      const n = Number(text);
      if (!Number.isFinite(n)) throw new ValidationError(`숫자를 입력해주세요: ${q.label}`);
      customAnswers[q.id] = n;
    } else if (q.type === "select") {
      if (!(q.options || []).includes(text)) throw new ValidationError(`선택지 중에서 골라주세요: ${q.label}`);
      customAnswers[q.id] = text;
    } else {
      customAnswers[q.id] = text.slice(0, 1000);
    }
  }

  const followerCount =
    data.follower_count != null && !isNaN(Number(data.follower_count))
      ? Math.max(0, Math.floor(Number(data.follower_count)))
      : null;

  const row = unwrap(
    await db()
      .from("applicants")
      .insert({
        campaign_id: campaign.id,
        name,
        sns_link: snsLink,
        nationality,
        contact,
        follower_count: followerCount,
        category: optionalText(data.category, 100),
        agency_memo: optionalText(data.agency_memo, 2000),
        shipping_address: shippingAddress,
        visit_schedule: visitSchedule,
        visit_party_size: visitPartySize,
        custom_answers: customAnswers,
        privacy_agreed: true,
        secondary_use_agreed: Boolean(data.secondary_use_agreed),
        status: "applied",
        status_changed_by: "agency",
        applied_at: nowIso(),
      })
      .select("*")
      .single<ApplicantRow>()
  );
  const applicant = rowToApplicant(row);

  await insertAuditLog({
    campaign_id: campaign.id,
    entity_type: "applicant",
    entity_id: applicant.id,
    action: "applicant.applied",
    actor_type: "public",
    actor_name: applicant.name,
    summary: `${applicant.name}님이 체험단에 지원했습니다.`,
  });
  return applicant;
}

// ---------- 지원자 수정 ----------

export async function updateApplicantAgencyMemo(
  applicantId: string,
  memo: string | null | undefined
): Promise<Applicant | null> {
  if (!isUuid(applicantId)) return null;
  const cleaned = typeof memo === "string" ? memo.trim().slice(0, 2000) : "";
  // 없는 id 면 update 가 0행이라 maybeSingle 이 null 을 준다. 별도 조회 없이 한 번에 처리한다.
  const row = unwrapMaybe(
    await db()
      .from("applicants")
      .update({ agency_memo: cleaned || null })
      .eq("id", applicantId)
      .select("*")
      .maybeSingle<ApplicantRow>()
  );
  if (!row) return null;
  const applicant = rowToApplicant(row);

  await insertAuditLog({
    campaign_id: applicant.campaign_id,
    entity_type: "applicant",
    entity_id: applicant.id,
    action: "applicant.memo_updated",
    actor_type: "agency",
    summary: `${applicant.name}님의 에이전시 메모를 수정했습니다.`,
  });
  return applicant;
}

/**
 * 지원자 선정 상태 변경. 멱등: 같은 상태면 아무것도 바꾸지 않는다.
 * `selected`가 되는 순간 seeding_records를 1건 생성하고, 이후 상태가 바뀌어도 기록은 삭제하지 않는다
 * (관리시트/보고서는 `selected`인 지원자만 보여준다).
 *
 * 선정 취소 후 **다시 선정**하면 기존 기록이 그대로 되살아난다. 그 자체는 의도된 보존이지만
 * 진행 흔적(단계·조회수·인게이지먼트·업로드 링크)이 남아 있으면 `seeding.carried_over` 감사 로그를 남긴다.
 * 화면 쪽 표시는 관리시트가 `status_changed_at` 과 `seeding.updated_at` 을 비교해 따로 붙인다.
 */
export async function updateApplicantStatus(
  applicantId: string,
  status: ApplicantStatus,
  changedBy: "agency" | "company"
): Promise<{ applicant: Applicant; changed: boolean } | null> {
  const nextStatus = oneOf(status, APPLICANT_STATUSES, "선정 상태");
  if (!isUuid(applicantId)) return null;

  const current = unwrapMaybe(
    await db().from("applicants").select("*").eq("id", applicantId).maybeSingle<ApplicantRow>()
  );
  if (!current) return null;
  if (current.status === nextStatus) return { applicant: rowToApplicant(current), changed: false };

  const prevStatus = current.status;
  const row = unwrap(
    await db()
      .from("applicants")
      .update({
        status: nextStatus,
        status_changed_by: changedBy,
        status_changed_at: nowIso(),
      })
      .eq("id", applicantId)
      .select("*")
      .single<ApplicantRow>()
  );
  const applicant = rowToApplicant(row);

  const statusLabel = APPLICANT_STATUS_LABELS[nextStatus] ?? nextStatus;
  const actorLabel = changedBy === "company" ? "광고주" : "에이전시";
  await insertAuditLog({
    campaign_id: applicant.campaign_id,
    entity_type: "applicant",
    entity_id: applicant.id,
    action: "applicant.status_changed",
    actor_type: changedBy,
    summary: `${actorLabel}가 ${applicant.name}님의 상태를 [${statusLabel}]${josa(statusLabel, "로")} 변경했습니다.`,
    details: { previous: prevStatus, next: nextStatus },
  });

  if (nextStatus === "selected") {
    // upsert 전에 기존 기록을 먼저 읽어 둔다.
    //
    // 선정을 취소했다가 다시 선정하면 upsert 가 아무것도 하지 않으므로(ignoreDuplicates)
    // **옛 회차의 조회수·업로드 링크·진행 단계가 그대로 되살아난다.** 기록 보존은 의도된 것이지만,
    // 되살아났다는 사실이 아무 데도 남지 않는 것이 문제였다. 새로 시작한 줄 알고 넘어가면 그 숫자가
    // 캠페인 합계와 결과보고서에 그대로 들어간다.
    //
    // 기록을 지우거나 0 으로 되돌리지 않는다. 옛 수치를 살릴지 지울지는 담당자가 보고 판단할 일이고,
    // 여기서 자동으로 지우면 이번에는 반대로 "조용히 사라지는" 문제가 된다. 남길 것은 사실뿐이다.
    const existing = unwrapMaybe(
      await db()
        .from("seeding_records")
        .select("*")
        .eq("applicant_id", applicantId)
        .maybeSingle<SeedingRecordRow>()
    );

    // applicant_id 가 unique 라 이미 있으면 그대로 둔다(ignoreDuplicates). 선정이 반복돼도 기록은 하나다.
    unwrap(
      await db()
        .from("seeding_records")
        .upsert(
          {
            campaign_id: applicant.campaign_id,
            applicant_id: applicantId,
            progress_stage: "선정완료",
            views: 0,
            engagement: 0,
          },
          { onConflict: "applicant_id", ignoreDuplicates: true }
        )
    );

    // "진행 흔적" = 처음 만들어진 모습(선정완료 · 0 · 0 · 링크 없음)에서 벗어난 것.
    // 관리시트 배지(SeedingSheetTable 의 hasCarryOverTraces)도 **같은 기준**을 쓴다.
    // 둘이 어긋나면 화면에는 뜨는데 로그에는 없는(또는 그 반대) 경우가 생겨 서로를 못 믿게 된다.
    if (existing) {
      const traces: string[] = [];
      if (existing.progress_stage !== "선정완료") traces.push(`진행 단계 [${existing.progress_stage}]`);
      if (existing.views > 0) traces.push(`조회수 ${existing.views.toLocaleString("ko-KR")}`);
      if (existing.engagement > 0) traces.push(`인게이지먼트 ${existing.engagement.toLocaleString("ko-KR")}`);
      if (existing.upload_link) traces.push("업로드 링크");

      if (traces.length > 0) {
        await insertAuditLog({
          campaign_id: applicant.campaign_id,
          entity_type: "seeding_record",
          entity_id: existing.id,
          action: "seeding.carried_over",
          actor_type: changedBy,
          summary:
            `${applicant.name}님을 다시 최종선정했습니다. 이전 회차의 관리시트 기록(${traces.join(", ")})이 그대로 남아 있습니다.` +
            ` 이번 회차 수치가 아니라면 관리시트에서 직접 정리해주세요.`,
          details: {
            previous_status: prevStatus,
            progress_stage: existing.progress_stage,
            views: existing.views,
            engagement: existing.engagement,
            upload_link: existing.upload_link,
            // 관리시트 배지가 쓰는 두 시각. 나중에 "왜 배지가 떴나" 를 로그만 보고도 맞춰볼 수 있게 함께 남긴다.
            seeding_updated_at: existing.updated_at,
            status_changed_at: applicant.status_changed_at ?? null,
          },
        });
      }
    }
  }

  return { applicant, changed: true };
}

// ---------- 시딩 기록 ----------

export async function getSeedingRecordsByCampaignId(campaignId: string): Promise<SeedingRecord[]> {
  if (!isUuid(campaignId)) return [];
  const rows = unwrap(
    await db()
      .from("seeding_records")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .returns<SeedingRecordRow[]>()
  );
  return rows.map(rowToSeedingRecord);
}

export async function getAllSeedingRecords(): Promise<SeedingRecord[]> {
  const rows = unwrap(
    await db()
      .from("seeding_records")
      .select("*")
      .order("created_at", { ascending: true })
      .returns<SeedingRecordRow[]>()
  );
  return rows.map(rowToSeedingRecord);
}

export async function updateSeedingRecord(
  seedingId: string,
  patch: {
    progress_stage?: ProgressStage;
    upload_deadline?: string | null;
    upload_link?: string | null;
    views?: number;
    engagement?: number;
    notes?: string | null;
  }
): Promise<SeedingRecord | null> {
  if (!isUuid(seedingId)) return null;
  const current = unwrapMaybe(
    await db().from("seeding_records").select("*").eq("id", seedingId).maybeSingle<SeedingRecordRow>()
  );
  if (!current) return null;

  const prevStage = current.progress_stage;
  const prevLink = current.upload_link;

  // 넘어온 필드만 검증해서 갱신한다. undefined 는 "건드리지 않음"이다.
  const update: Partial<Pick<
    SeedingRecordRow,
    "progress_stage" | "upload_deadline" | "upload_link" | "views" | "engagement" | "notes" | "updated_at"
  >> = { updated_at: nowIso() };
  if (patch.progress_stage !== undefined) update.progress_stage = oneOf(patch.progress_stage, PROGRESS_STAGES, "진행 단계");
  if (patch.upload_deadline !== undefined) update.upload_deadline = optionalDate(patch.upload_deadline, "업로드 기한");
  if (patch.upload_link !== undefined) update.upload_link = optionalUrl(patch.upload_link, "업로드 링크");
  if (patch.views !== undefined) update.views = nonNegativeInt(patch.views, "조회수");
  if (patch.engagement !== undefined) update.engagement = nonNegativeInt(patch.engagement, "인게이지먼트");
  if (patch.notes !== undefined) update.notes = optionalText(patch.notes, 2000);

  const row = unwrap(
    await db()
      .from("seeding_records")
      .update(update)
      .eq("id", seedingId)
      .select("*")
      .single<SeedingRecordRow>()
  );
  const record = rowToSeedingRecord(row);

  // 입력칸에서 포커스가 빠질 때마다 저장되므로, 단계나 업로드 링크가 실제로 바뀐 경우에만 기록한다.
  if (record.progress_stage !== prevStage || (record.upload_link && record.upload_link !== prevLink)) {
    const app = unwrapMaybe(
      await db()
        .from("applicants")
        .select("name")
        .eq("id", record.applicant_id)
        .maybeSingle<Pick<ApplicantRow, "name">>()
    );
    const appName = app?.name || "인플루언서";
    await insertAuditLog({
      campaign_id: record.campaign_id,
      entity_type: "seeding_record",
      entity_id: record.id,
      action: "seeding.updated",
      actor_type: "agency",
      summary: patch.progress_stage
        ? `${appName}님의 진행 단계를 [${patch.progress_stage}]${josa(patch.progress_stage, "로")} 변경했습니다.`
        : `${appName}님의 관리시트 정보를 수정했습니다.`,
    });
  }

  return record;
}
