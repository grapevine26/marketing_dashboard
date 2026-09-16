/**
 * 캠페인 도메인 저장 계층 (Supabase).
 *
 * 담당: 캠페인 CRUD, 외부 공유 토큰, 웹훅 URL, 안내문 템플릿,
 *       사전조사 템플릿·캠페인별 질문·응답, 지원 신청폼 설정.
 *
 * 규칙
 * - 함수 이름·시그니처·반환 타입은 옛 JSON 구현(lib/db/index.ts)과 같다. 호출 코드는 손대지 않는다.
 * - 원시 행은 밖으로 내보내지 않는다. 항상 mappers 를 거쳐 앱 타입으로 바꾼다.
 * - 옵셔널 필드를 지울 때는 DB 에 null 을 쓴다. mapper 가 undefined 로 되돌린다.
 * - 연쇄 삭제(폼 설정, 응답, 지원자, 시딩 기록, 보고서, 행사)는 DB fk cascade 가 맡는다.
 * - 여러 테이블을 건드리는 쓰기(캠페인 생성, 토큰 재발급)는 트랜잭션 없이 순차로 한다.
 * - id 로 조회·수정·삭제하는 함수는 쿼리 전에 isUuid 로 거른다. 엉뚱한 URL 파라미터가
 *   uuid 컬럼에 닿으면 Postgres 타입 에러(500)가 나므로, 형식이 아니면 "없음"(null/false)으로 답한다.
 */

import { randomBytes } from "crypto";
import { insertAuditLog } from "./audit";
import { CAMPAIGN_STATUS_LABELS } from "./types";
import { db, unwrap, unwrapMaybe } from "./client";
import { DEFAULT_PRE_SURVEY_QUESTIONS } from "./defaults";
import { writeWithOptimisticLock } from "./optimistic-lock";
import {
  rowToCampaign,
  rowToFormConfig,
  rowToPreSurveyResponse,
  type CampaignRow,
  type FormConfigRow,
  type PreSurveyResponseRow,
} from "./mappers";
import type {
  Campaign,
  CampaignFormConfig,
  CampaignStatus,
  CampaignTokenType,
  PreSurveyQuestion,
  PreSurveyResponse,
  PreSurveyTemplate,
} from "./types";
import {
  CAMPAIGN_STATUSES,
  ValidationError,
  cleanQuestions,
  isUuid,
  nowIso,
  oneOf,
  requireText,
} from "./validation";
import { validateWebhookUrl } from "../notifications/webhook";

/** 단일 행 템플릿 테이블의 고정 id. */
const PRE_SURVEY_TEMPLATE_ID = 1;

interface PreSurveyTemplateRow {
  id: number;
  questions: PreSurveyQuestion[] | null;
  updated_at: string;
}

// ---------- 토큰 ----------

/**
 * 외부 공유 토큰. 접두사로 어떤 링크인지 구분한다.
 * 본체는 128비트 난수(base64url 22자). 예전 12자(48비트) 토큰은 DB 값과 대조하므로 그대로 유효하다.
 */
function newToken(type: CampaignTokenType): string {
  const suffix = randomBytes(16).toString("base64url");
  switch (type) {
    case "pre_survey":
      return `ps_${suffix}`;
    case "apply_form":
      return `apply_${suffix}`;
    case "applicants_share":
      return `app_share_${suffix}`;
    case "seeding_sheet_share":
      return `seed_share_${suffix}`;
  }
}

// ---------- 캠페인 ----------

export async function getCampaigns(): Promise<Campaign[]> {
  const rows = unwrap(
    await db()
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<CampaignRow[]>()
  );
  return rows.map(rowToCampaign);
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  if (!isUuid(id)) return null;
  const row = unwrapMaybe(
    await db().from("campaigns").select("*").eq("id", id).maybeSingle<CampaignRow>()
  );
  return row ? rowToCampaign(row) : null;
}

export async function getCampaignByToken(
  type: "pre_survey" | "apply_form" | "applicants_share" | "seeding_sheet_share",
  token: string
): Promise<Campaign | null> {
  if (!token) return null;
  const row = unwrapMaybe(
    await db().from("campaigns").select("*").eq(`${type}_token`, token).maybeSingle<CampaignRow>()
  );
  return row ? rowToCampaign(row) : null;
}

export async function createCampaign(data: {
  name: string;
  company_name: string;
  campaign_type: "shipping" | "visit";
}): Promise<Campaign> {
  const name = requireText(data.name, "캠페인명", 200);
  const company = requireText(data.company_name, "브랜드명", 200);
  const type = oneOf(data.campaign_type, ["shipping", "visit"] as const, "캠페인 유형");

  // 1) 캠페인. id·created_at 은 DB 기본값에 맡긴다.
  const row = unwrap(
    await db()
      .from("campaigns")
      .insert({
        name,
        company_name: company,
        campaign_type: type,
        status: "recruiting",
        pre_survey_token: newToken("pre_survey"),
        apply_form_token: newToken("apply_form"),
        applicants_share_token: newToken("applicants_share"),
        seeding_sheet_share_token: newToken("seeding_sheet_share"),
      })
      .select("*")
      .single<CampaignRow>()
  );

  // 2) 기본 신청폼 설정. 여기서 실패해도 캠페인은 남는다. 앱은 "폼 설정 없음"을 이미 처리한다.
  unwrap(
    await db()
      .from("form_configs")
      .insert({
        campaign_id: row.id,
        intro_text: `${company}의 ${name} ${
          type === "shipping" ? "제품배송형" : "현장방문형"
        } 인플루언서 체험단을 모집합니다 ✨\n솔직하고 감각적인 리뷰 콘텐츠를 함께 만들어갈 크리에이터 분들의 많은 지원 바랍니다.`,
        custom_questions: [],
        is_published: true,
      })
  );

  await insertAuditLog({
    campaign_id: row.id,
    entity_type: "campaign",
    entity_id: row.id,
    action: "campaign.created",
    actor_type: "agency",
    summary: `[${name}] 캠페인을 만들었습니다. (${company} / ${type === "shipping" ? "제품배송형" : "현장방문형"})`,
  });

  return rowToCampaign(row);
}

export async function updateCampaign(
  id: string,
  patch: { name?: string; company_name?: string; status?: CampaignStatus }
): Promise<Campaign | null> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = requireText(patch.name, "캠페인명", 200);
  if (patch.company_name !== undefined) update.company_name = requireText(patch.company_name, "브랜드명", 200);
  if (patch.status !== undefined) update.status = oneOf(patch.status, CAMPAIGN_STATUSES, "캠페인 상태");

  // 바꿀 게 없으면 조회만 한다. 빈 update 는 PostgREST 가 거부한다.
  if (Object.keys(update).length === 0) return getCampaignById(id);
  if (!isUuid(id)) return null;

  // 상태 변경을 문구에 드러내려면 바뀌기 전 값이 필요하다.
  const before = patch.status !== undefined ? await getCampaignById(id) : null;

  const row = unwrapMaybe(
    await db().from("campaigns").update(update).eq("id", id).select("*").maybeSingle<CampaignRow>()
  );
  if (!row) return null;

  const statusChanged = before && patch.status !== undefined && before.status !== row.status;
  await insertAuditLog({
    campaign_id: row.id,
    entity_type: "campaign",
    entity_id: row.id,
    action: statusChanged ? "campaign.status_changed" : "campaign.updated",
    actor_type: "agency",
    summary: statusChanged
      ? `[${row.name}] 캠페인 상태를 [${CAMPAIGN_STATUS_LABELS[row.status]}](으)로 바꿨습니다.`
      : `[${row.name}] 캠페인 정보를 수정했습니다.`,
    details: statusChanged ? { previous: before.status, next: row.status } : null,
  });
  return rowToCampaign(row);
}

export async function updateCampaignMessageTemplates(
  campaignId: string,
  templates: Record<string, string>
): Promise<Campaign | null> {
  if (!isUuid(campaignId)) return null;

  // **덮어쓰지 않고 합친다.** 전에는 받은 객체로 통째로 바꿨다. 그래서 화면이 다섯 종류를
  // 한꺼번에 보내야 했고, 그 값들은 모달을 연 순간의 스냅샷이라 그 사이 남이 다른 종류를
  // 고쳤으면 옛 값으로 되돌려 버렸다. 보낸 종류만 바꾸면 그 사고가 없어진다.
  const existing = unwrapMaybe(
    await db().from("campaigns").select("message_templates").eq("id", campaignId).maybeSingle<{
      message_templates: Record<string, string> | null;
    }>()
  );
  if (!existing) return null;

  const cleaned: Record<string, string> = { ...(existing.message_templates ?? {}) };
  for (const [k, v] of Object.entries(templates || {})) {
    if (typeof v === "string") cleaned[k] = v.slice(0, 5000);
  }
  const row = unwrapMaybe(
    await db()
      .from("campaigns")
      .update({ message_templates: cleaned })
      .eq("id", campaignId)
      .select("*")
      .maybeSingle<CampaignRow>()
  );
  if (!row) return null;
  await insertAuditLog({
    campaign_id: row.id,
    entity_type: "campaign",
    entity_id: row.id,
    action: "campaign.message_templates_saved",
    actor_type: "agency",
    summary: `[${row.name}] 안내문 템플릿을 저장했습니다.`,
  });
  return rowToCampaign(row);
}

export async function deleteCampaign(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const target = await getCampaignById(id);
  if (!target) return false;

  // 감사 로그를 먼저 남긴다. audit_logs 는 fk 가 없어 캠페인이 지워져도 기록이 남는다.
  await insertAuditLog({
    campaign_id: id,
    entity_type: "campaign",
    entity_id: id,
    action: "campaign.deleted",
    actor_type: "agency",
    summary: `[${target.name}] 캠페인을 삭제했습니다.`,
  });

  // 하위 테이블은 fk cascade 로 함께 지워진다.
  unwrap(await db().from("campaigns").delete().eq("id", id));
  return true;
}

export async function updateCampaignWebhookUrl(
  campaignId: string,
  webhookUrl: string | null
): Promise<Campaign | null> {
  if (!isUuid(campaignId)) return null;
  let url: string | null = null;
  if (webhookUrl) {
    const valid = validateWebhookUrl(webhookUrl);
    if (!valid.ok) throw new ValidationError(valid.reason);
    url = valid.url;
  }

  const row = unwrapMaybe(
    await db()
      .from("campaigns")
      .update({ webhook_url: url })
      .eq("id", campaignId)
      .select("*")
      .maybeSingle<CampaignRow>()
  );
  if (!row) return null;

  await insertAuditLog({
    campaign_id: campaignId,
    entity_type: "campaign",
    entity_id: campaignId,
    action: "campaign.webhook_updated",
    actor_type: "agency",
    summary: webhookUrl ? "웹훅 알림 URL을 설정했습니다." : "웹훅 알림 설정을 해제했습니다.",
  });
  return rowToCampaign(row);
}

export async function regenerateCampaignToken(
  campaignId: string,
  tokenType: CampaignTokenType
): Promise<Campaign> {
  if (!isUuid(campaignId)) throw new ValidationError("캠페인을 찾을 수 없습니다.");
  let tokenField: "apply_form_token" | "pre_survey_token" | "applicants_share_token" | "seeding_sheet_share_token";
  let tokenLabel: string;

  if (tokenType === "apply_form") {
    tokenField = "apply_form_token";
    tokenLabel = "인플루언서 지원 신청폼";
  } else if (tokenType === "pre_survey") {
    tokenField = "pre_survey_token";
    tokenLabel = "광고주 사전조사";
  } else if (tokenType === "applicants_share") {
    tokenField = "applicants_share_token";
    tokenLabel = "광고주 지원자 선정 공유";
  } else if (tokenType === "seeding_sheet_share") {
    tokenField = "seeding_sheet_share_token";
    tokenLabel = "광고주 시딩 관리시트 공유";
  } else {
    throw new ValidationError("유효하지 않은 토큰 유형입니다.");
  }

  const row = unwrapMaybe(
    await db()
      .from("campaigns")
      .update({ [tokenField]: newToken(tokenType) })
      .eq("id", campaignId)
      .select("*")
      .maybeSingle<CampaignRow>()
  );
  if (!row) throw new ValidationError("캠페인을 찾을 수 없습니다.");

  await insertAuditLog({
    campaign_id: campaignId,
    entity_type: "campaign",
    entity_id: campaignId,
    action: "token_regenerated",
    actor_type: "agency",
    summary: `[보안] '${tokenLabel}' 외부 공유 링크 토큰이 재발급되었습니다. 이전 링크는 즉시 무효화되었습니다.`,
  });

  return rowToCampaign(row);
}

// ---------- 사전조사 템플릿 (단일 행) ----------

async function readPreSurveyTemplateRow(): Promise<PreSurveyTemplateRow | null> {
  return unwrapMaybe(
    await db()
      .from("pre_survey_template")
      .select("*")
      .eq("id", PRE_SURVEY_TEMPLATE_ID)
      .maybeSingle<PreSurveyTemplateRow>()
  );
}

/** 템플릿 행을 실제로 읽어 내려보내는 값. 낙관적 잠금 기준 시각이 반드시 들어 있다. */
type StoredPreSurveyTemplate = PreSurveyTemplate & { updated_at: string };

/**
 * 사전조사 기본 질문 템플릿.
 * 행이 없으면 코드의 기본 질문으로 채운다. 동시에 두 요청이 들어와도 ignoreDuplicates 로 한 쪽만 쓴다.
 *
 * 편집 화면이 낙관적 잠금 기준으로 쓰므로 `updated_at` 을 반드시 함께 내려준다.
 * 행을 만들고 바로 다시 읽으니 첫 저장이라도 비어 있지 않다.
 */
export async function getPreSurveyTemplate(): Promise<StoredPreSurveyTemplate> {
  let row = await readPreSurveyTemplateRow();
  if (!row) {
    unwrap(
      await db()
        .from("pre_survey_template")
        .upsert(
          { id: PRE_SURVEY_TEMPLATE_ID, questions: DEFAULT_PRE_SURVEY_QUESTIONS },
          { onConflict: "id", ignoreDuplicates: true }
        )
    );
    row = await readPreSurveyTemplateRow();
  }
  // 행을 만든 직후에도 못 읽는 경우는 사실상 없다. 그래도 그때 지금 시각 같은 그럴듯한 값을 주면
  // 나중에 잠금을 통과해 남의 저장을 덮어쓴다. 1970-01-01 을 주면 저장이 조용히 성공하는 대신
  // "다른 사람이 먼저 저장했습니다" 로 막혀 새로고침을 유도하므로 이쪽이 안전하다.
  const updatedAt = row?.updated_at ?? new Date(0).toISOString();
  return {
    id: PRE_SURVEY_TEMPLATE_ID,
    questions: row?.questions ?? DEFAULT_PRE_SURVEY_QUESTIONS,
    updated_at: updatedAt,
  };
}

/**
 * 공용 사전조사 문항 저장.
 *
 * 둘이 같은 화면을 열고 차례로 저장하면 뒤에 저장한 쪽이 앞사람 문항을 통째로 덮어쓰므로
 * 행사 운영안·SNS 제안서와 같은 낙관적 잠금을 건다. `expectedUpdatedAt` 은 화면이 불러올 때
 * 받은 `updated_at` 이고, 그 사이 다른 사람이 저장했으면 ValidationError 로 거부한다.
 * 감사 로그는 잠금을 통과해 실제로 저장된 뒤에만 남는다.
 */
export async function updatePreSurveyTemplate(
  questions: PreSurveyTemplate["questions"],
  expectedUpdatedAt?: string | null
): Promise<StoredPreSurveyTemplate> {
  const cleaned = cleanQuestions(questions);
  const row = await writeWithOptimisticLock<PreSurveyTemplateRow>({
    table: "pre_survey_template",
    keyColumn: "id",
    keyValue: PRE_SURVEY_TEMPLATE_ID,
    values: { id: PRE_SURVEY_TEMPLATE_ID, questions: cleaned },
    expectedUpdatedAt,
  });
  await insertAuditLog({
    entity_type: "campaign",
    entity_id: String(PRE_SURVEY_TEMPLATE_ID),
    action: "pre_survey_template.saved",
    actor_type: "agency",
    summary: `공용 사전조사 문항을 저장했습니다. (${cleaned.length}개)`,
  });
  return {
    id: PRE_SURVEY_TEMPLATE_ID,
    questions: row.questions ?? cleaned,
    updated_at: row.updated_at,
  };
}

/** 캠페인별 질문이 있으면 그것, 없으면 공용 템플릿. */
export async function getPreSurveyQuestionsForCampaign(campaignId: string): Promise<PreSurveyQuestion[]> {
  const camp = await getCampaignById(campaignId);
  if (camp?.pre_survey_questions && camp.pre_survey_questions.length > 0) {
    return camp.pre_survey_questions;
  }
  return (await getPreSurveyTemplate()).questions;
}

/** null 을 주면 캠페인별 질문을 지우고 공용 템플릿으로 되돌린다. */
export async function updateCampaignPreSurveyQuestions(
  campaignId: string,
  questions: PreSurveyQuestion[] | null
): Promise<Campaign> {
  if (!isUuid(campaignId)) throw new ValidationError("캠페인을 찾을 수 없습니다.");
  const cleaned: PreSurveyQuestion[] | null = questions === null ? null : cleanQuestions(questions);

  const row = unwrapMaybe(
    await db()
      .from("campaigns")
      .update({ pre_survey_questions: cleaned })
      .eq("id", campaignId)
      .select("*")
      .maybeSingle<CampaignRow>()
  );
  if (!row) throw new ValidationError("캠페인을 찾을 수 없습니다.");
  await insertAuditLog({
    campaign_id: row.id,
    entity_type: "campaign",
    entity_id: row.id,
    action: "campaign.pre_survey_questions_changed",
    actor_type: "agency",
    summary: cleaned
      ? `[${row.name}] 캠페인 전용 사전조사 문항을 저장했습니다. (${cleaned.length}개)`
      : `[${row.name}] 사전조사 문항을 공용 템플릿으로 되돌렸습니다.`,
  });
  return rowToCampaign(row);
}

// ---------- 사전조사 응답 (캠페인당 하나) ----------

export async function getPreSurveyResponse(campaignId: string): Promise<PreSurveyResponse | null> {
  if (!isUuid(campaignId)) return null;
  const row = unwrapMaybe(
    await db()
      .from("pre_survey_responses")
      .select("*")
      .eq("campaign_id", campaignId)
      .maybeSingle<PreSurveyResponseRow>()
  );
  return row ? rowToPreSurveyResponse(row) : null;
}

export async function savePreSurveyResponse(data: {
  campaign_id: string;
  answers: Record<string, string>;
  used_ai_assist: boolean;
}): Promise<PreSurveyResponse> {
  // fk 가 있어 없는 캠페인엔 어차피 저장할 수 없다. uuid 형식이 아니면 타입 에러 대신 사람이 읽을 에러를 준다.
  if (!isUuid(data.campaign_id)) throw new ValidationError("캠페인을 찾을 수 없습니다.");
  // 질문 목록 기준으로 답변을 걸러 저장한다. 목록에 없는 키는 버린다.
  const questions = await getPreSurveyQuestionsForCampaign(data.campaign_id);
  const answers: Record<string, string> = {};
  for (const q of questions) {
    const v = data.answers?.[q.id];
    const text = typeof v === "string" ? v.trim() : "";
    if (q.required && !text) {
      throw new ValidationError(`필수 질문에 답변해주세요: ${q.question}`);
    }
    if (text) answers[q.id] = text.slice(0, 5000);
  }

  // campaign_id 가 unique 라 upsert 한 번으로 신규·재제출을 모두 처리한다. 기존 행의 id 는 유지된다.
  const row = unwrap(
    await db()
      .from("pre_survey_responses")
      .upsert(
        {
          campaign_id: data.campaign_id,
          answers,
          used_ai_assist: Boolean(data.used_ai_assist),
          submitted_at: nowIso(),
        },
        { onConflict: "campaign_id" }
      )
      .select("*")
      .single<PreSurveyResponseRow>()
  );
  // 광고주가 공개 링크로 제출하는 경로다. 로그인이 없으므로 행위자 이름은 비어 있다.
  await insertAuditLog({
    campaign_id: data.campaign_id,
    entity_type: "campaign",
    entity_id: data.campaign_id,
    action: "pre_survey.submitted",
    actor_type: "company",
    summary: `광고주가 사전조사 답변을 제출했습니다.${data.used_ai_assist ? " (AI 추천 사용)" : ""}`,
  });
  return rowToPreSurveyResponse(row);
}

// ---------- 지원 신청폼 설정 (캠페인당 하나) ----------

export async function getFormConfig(campaignId: string): Promise<CampaignFormConfig | null> {
  if (!isUuid(campaignId)) return null;
  const row = unwrapMaybe(
    await db()
      .from("form_configs")
      .select("*")
      .eq("campaign_id", campaignId)
      .maybeSingle<FormConfigRow>()
  );
  return row ? rowToFormConfig(row) : null;
}

export async function saveFormConfig(data: {
  campaign_id: string;
  intro_text: string;
  custom_questions: CampaignFormConfig["custom_questions"];
  is_published: boolean;
}): Promise<CampaignFormConfig> {
  // fk 가 있어 없는 캠페인엔 어차피 저장할 수 없다. uuid 형식이 아니면 타입 에러 대신 사람이 읽을 에러를 준다.
  if (!isUuid(data.campaign_id)) throw new ValidationError("캠페인을 찾을 수 없습니다.");
  const questions = (data.custom_questions || []).map((q) => {
    const type = oneOf(q.type, ["text", "number", "select", "checkbox"] as const, "문항 유형");
    const options = type === "select"
      ? (q.options || []).map((o) => String(o).trim()).filter(Boolean)
      : undefined;
    if (type === "select" && (!options || options.length === 0)) {
      throw new ValidationError(`선택형 문항 "${q.label}"에 선택지를 1개 이상 입력해주세요.`);
    }
    return {
      id: requireText(q.id, "문항 ID", 100),
      label: requireText(q.label, "문항 내용", 300),
      type,
      required: Boolean(q.required),
      ...(options ? { options } : {}),
      // 이 줄을 빠뜨리면 체크박스가 조용히 버려진다. 여기는 골라 담기 방식이라
      // 새 칸을 추가할 때마다 이 목록에도 같이 적어야 한다.
      // 저장할 때 항상 적어 두면, 읽는 쪽이 "값이 없다" 를 만날 일이 없어진다.
      share_with_company: q.share_with_company === true,
    };
  });

  // 기존 행이 있으면 id·created_at 을 그대로 둔다. 없으면 DB 기본값에 맡긴다.
  const existing = unwrapMaybe(
    await db()
      .from("form_configs")
      .select("id, created_at")
      .eq("campaign_id", data.campaign_id)
      .maybeSingle<Pick<FormConfigRow, "id" | "created_at">>()
  );

  const row = unwrap(
    await db()
      .from("form_configs")
      .upsert(
        {
          ...(existing ? { id: existing.id, created_at: existing.created_at } : {}),
          campaign_id: data.campaign_id,
          intro_text: typeof data.intro_text === "string" ? data.intro_text.slice(0, 5000) : "",
          custom_questions: questions,
          is_published: Boolean(data.is_published),
        },
        { onConflict: "campaign_id" }
      )
      .select("*")
      .single<FormConfigRow>()
  );
  // 모집 상태(접수중/마감)가 바뀌는 게 가장 중요한 변화라 문구에 드러낸다.
  const published = Boolean(data.is_published);
  const changedPublish = existing !== null && published !== undefined;
  await insertAuditLog({
    campaign_id: data.campaign_id,
    entity_type: "campaign",
    entity_id: data.campaign_id,
    action: "form_config.saved",
    actor_type: "agency",
    summary: `지원 신청폼을 저장했습니다. (문항 ${questions.length}개, ${published ? "접수중" : "접수 마감"})`,
    details: changedPublish ? { is_published: published } : null,
  });
  return rowToFormConfig(row);
}
