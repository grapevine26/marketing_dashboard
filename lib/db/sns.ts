/**
 * SNS 채널 운영 도메인 저장 계층 (Supabase).
 *
 * 담당: SNS 계정 CRUD·토큰, 인테이크(사전설문) 템플릿·계정별 질문·응답, 운영 계획(sns_plans),
 *       콘텐츠 CRUD, 시안 미디어 첨부(파일 저장소 연동), 광고주 승인/수정요청.
 *
 * 규칙
 * - 함수 이름·시그니처·반환 타입은 옛 JSON 구현(lib/db/index.ts)과 같다. 호출 코드는 손대지 않는다.
 * - 원시 행은 밖으로 내보내지 않는다. 항상 mappers 를 거쳐 앱 타입으로 바꾼다.
 * - 다른 도메인 모듈은 ppt-templates 만 import 한다. 나머지 조회는 db() 로 직접 한다.
 * - 계정 삭제 시 콘텐츠·계획·응답은 DB fk cascade 가 지운다. 첨부 파일은 DB 가 모르므로
 *   삭제 전에 id 를 모아 두었다가 파일 저장소에서 따로 지운다.
 * - 미디어 첨부는 sns_contents.media_attachments(jsonb 배열) 안에 있다. 행을 읽어 배열을 고친 뒤
 *   그 컬럼만 update 한다.
 */

import path from "path";
import { insertAuditLog } from "./audit";
import { db, unwrap, unwrapMaybe } from "./client";
import { DEFAULT_SNS_INTAKE_QUESTIONS } from "./defaults";
import {
  rowToSnsAccount,
  rowToSnsContent,
  rowToSnsIntakeResponse,
  rowToSnsPlan,
  type SnsAccountRow,
  type SnsContentRow,
  type SnsIntakeResponseRow,
  type SnsPlanRow,
} from "./mappers";
import { getPptTemplateById, getPptTemplates } from "./ppt-templates";
import {
  deleteFilesByPrefixes,
  findFileKeyByPrefix,
  putFile,
  readFile,
  statFile,
  uploadPathname,
} from "./storage";
import {
  ALLOWED_SNS_MEDIA_MIME_TYPES,
  MAX_SNS_MEDIA_BYTES,
  SNS_CONTENT_STATUSES,
  type PreSurveyQuestion,
  type SnsAccount,
  type SnsContent,
  type SnsContentStatus,
  type SnsIntakeResponse,
  type SnsIntakeTemplate,
  type SnsMediaAttachment,
  type SnsPlan,
  type SnsTokenType,
} from "./types";
import {
  SNS_PLATFORMS,
  ValidationError,
  cleanFieldValues,
  cleanQuestions,
  isUuid,
  nonNegativeInt,
  nowIso,
  oneOf,
  optionalDate,
  optionalText,
  optionalUrl,
  requireText,
} from "./validation";

export { ALLOWED_SNS_MEDIA_MIME_TYPES, MAX_SNS_MEDIA_BYTES } from "./types";

/** 단일 행 템플릿 테이블의 고정 id. */
const SNS_INTAKE_TEMPLATE_ID = 1;

interface SnsIntakeTemplateRow {
  id: number;
  questions: PreSurveyQuestion[] | null;
  updated_at: string;
}

// ---------- 내부 조회 헬퍼 ----------
// uuid 형식이 아닌 id 는 쿼리하지 않고 "없음"으로 본다. uuid 컬럼에 엉뚱한 값을 대면
// Postgres 타입 에러(500)가 나므로, 옛 코드처럼 null/false 로 돌려주기 위해서다.

async function readSnsAccountRow(id: string): Promise<SnsAccountRow | null> {
  if (!isUuid(id)) return null;
  return unwrapMaybe(
    await db().from("sns_accounts").select("*").eq("id", id).maybeSingle<SnsAccountRow>()
  );
}

async function readSnsContentRow(id: string): Promise<SnsContentRow | null> {
  if (!isUuid(id)) return null;
  return unwrapMaybe(
    await db().from("sns_contents").select("*").eq("id", id).maybeSingle<SnsContentRow>()
  );
}

async function snsAccountExists(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const row = unwrapMaybe(
    await db().from("sns_accounts").select("id").eq("id", id).maybeSingle<{ id: string }>()
  );
  return row !== null;
}

// ---------- SNS 계정 ----------

/** 계정 목록. 최신 생성 순. */
export async function getSnsAccounts(): Promise<SnsAccount[]> {
  const rows = unwrap(
    await db()
      .from("sns_accounts")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<SnsAccountRow[]>()
  );
  return rows.map(rowToSnsAccount);
}

export async function getSnsAccountById(id: string): Promise<SnsAccount | null> {
  const row = await readSnsAccountRow(id);
  return row ? rowToSnsAccount(row) : null;
}

/** 공개 링크 토큰으로 계정을 찾는다. 빈 토큰은 조회하지 않는다. */
export async function getSnsAccountByToken(
  type: "intake" | "approval",
  token: string
): Promise<SnsAccount | null> {
  if (!token) return null;
  const row = unwrapMaybe(
    await db()
      .from("sns_accounts")
      .select("*")
      .eq(`${type}_token`, token)
      .maybeSingle<SnsAccountRow>()
  );
  return row ? rowToSnsAccount(row) : null;
}

/**
 * 계정 생성. 계정 행을 넣은 뒤 기본 SNS 템플릿을 붙인 운영 계획(sns_plans)을 함께 만든다.
 * 트랜잭션 없이 순차로 쓴다. 계획 생성이 실패해도 앱은 "계획 없음"을 처리한다.
 */
export async function createSnsAccount(data: {
  company_name: string;
  platform: SnsAccount["platform"];
  handle: string;
  starts_on: string | null;
  ends_on: string | null;
}): Promise<SnsAccount> {
  const company = requireText(data.company_name, "브랜드명", 200);
  const platform = oneOf(data.platform, SNS_PLATFORMS, "플랫폼");
  const handle = requireText(data.handle, "계정 핸들", 100).replace(/^@/, "");
  const startsOn = optionalDate(data.starts_on, "계약 시작일");
  const endsOn = optionalDate(data.ends_on, "계약 종료일");
  if (startsOn && endsOn && startsOn > endsOn) {
    throw new ValidationError("계약 종료일은 시작일 이후여야 합니다.");
  }

  const row = unwrap(
    await db()
      .from("sns_accounts")
      .insert({
        company_name: company,
        platform,
        handle,
        starts_on: startsOn,
        ends_on: endsOn,
        status: "active",
        intake_token: `sns_intake_${crypto.randomUUID().slice(0, 12)}`,
        approval_token: `sns_appr_${crypto.randomUUID().slice(0, 12)}`,
      })
      .select("*")
      .single<SnsAccountRow>()
  );

  // 기본 SNS 템플릿(내장 포함) 중 첫 번째를 운영 계획에 붙인다.
  const defaultTemplateId = (await getPptTemplates("sns"))[0]?.id ?? null;
  unwrap(
    await db().from("sns_plans").insert({
      account_id: row.id,
      template_id: defaultTemplateId,
      field_values: {
        브랜드명: company,
        채널명: `${platform.toUpperCase()} (@${handle})`,
        계약기간: `${startsOn || "시작일 미정"} ~ ${endsOn || "종료일 미정"}`,
        운영목표: `${company} 공식 계정 활성화 및 타깃 오디언스 대상 브랜드 인지도 증대`,
        타겟오디언스: "브랜드 핵심 타깃 2030 세대 및 카테고리 고관여자",
        콘텐츠방향성: "릴스/숏폼 중심의 감각적인 비주얼 큐레이션 및 소통형 피드",
        월별계획: "1개월차: 계정 브랜딩 및 톤앤매너 확립\n2개월차: 제품 스토리텔링 콘텐츠 확장\n3개월차: 참여 유도 프로모션 및 성과 극대화",
      },
      updated_at: nowIso(),
    })
  );

  return rowToSnsAccount(row);
}

/** 계정 수정. 현재 행과 병합한 뒤 시작/종료일 순서를 검증한다. 없는 id 면 null. */
export async function updateSnsAccount(
  id: string,
  patch: {
    company_name?: string;
    platform?: SnsAccount["platform"];
    handle?: string;
    starts_on?: string | null;
    ends_on?: string | null;
    status?: SnsAccount["status"];
  }
): Promise<SnsAccount | null> {
  const current = await readSnsAccountRow(id);
  if (!current) return null;

  const update: Partial<SnsAccountRow> = {};
  if (patch.company_name !== undefined) update.company_name = requireText(patch.company_name, "브랜드명", 200);
  if (patch.platform !== undefined) update.platform = oneOf(patch.platform, SNS_PLATFORMS, "플랫폼");
  if (patch.handle !== undefined) update.handle = requireText(patch.handle, "계정 핸들", 100).replace(/^@/, "");
  if (patch.starts_on !== undefined) update.starts_on = optionalDate(patch.starts_on, "계약 시작일");
  if (patch.ends_on !== undefined) update.ends_on = optionalDate(patch.ends_on, "계약 종료일");
  if (patch.status !== undefined) update.status = oneOf(patch.status, ["active", "ended"] as const, "계정 상태");

  const startsOn = update.starts_on !== undefined ? update.starts_on : current.starts_on;
  const endsOn = update.ends_on !== undefined ? update.ends_on : current.ends_on;
  if (startsOn && endsOn && startsOn > endsOn) {
    throw new ValidationError("계약 종료일은 시작일 이후여야 합니다.");
  }

  if (Object.keys(update).length === 0) return rowToSnsAccount(current);

  const row = unwrap(
    await db().from("sns_accounts").update(update).eq("id", id).select("*").single<SnsAccountRow>()
  );
  return rowToSnsAccount(row);
}

/** 공개 링크 토큰 재발급. 이전 링크는 즉시 무효가 된다. 감사 로그를 남긴다. */
export async function regenerateSnsToken(
  accountId: string,
  tokenType: SnsTokenType
): Promise<SnsAccount> {
  const current = await readSnsAccountRow(accountId);
  if (!current) throw new ValidationError("SNS 계정을 찾을 수 없습니다.");

  let tokenField: "intake_token" | "approval_token";
  let newToken: string;
  let tokenLabel: string;

  if (tokenType === "intake") {
    tokenField = "intake_token";
    newToken = `sns_in_${crypto.randomUUID().slice(0, 12)}`;
    tokenLabel = "광고주 자료요청/사전설문";
  } else if (tokenType === "approval") {
    tokenField = "approval_token";
    newToken = `sns_appr_${crypto.randomUUID().slice(0, 12)}`;
    tokenLabel = "광고주 시안 승인(컨펌)";
  } else {
    throw new ValidationError("유효하지 않은 토큰 유형입니다.");
  }

  const row = unwrap(
    await db()
      .from("sns_accounts")
      .update({ [tokenField]: newToken })
      .eq("id", accountId)
      .select("*")
      .single<SnsAccountRow>()
  );

  await insertAuditLog({
    account_id: accountId,
    entity_type: "sns_account",
    entity_id: accountId,
    action: "token_regenerated",
    actor_type: "agency",
    summary: `[보안] '${tokenLabel}' 전용 링크 토큰이 재발급되었습니다. 이전 링크는 즉시 무효화되었습니다.`,
  });

  return rowToSnsAccount(row);
}

/**
 * 계정 삭제. 콘텐츠·계획·응답은 fk cascade 가 지운다.
 * 첨부 파일은 DB 가 모르므로 지우기 전에 id 를 모아 두고, 삭제가 끝난 뒤 저장소에서 지운다.
 */
export async function deleteSnsAccount(id: string): Promise<boolean> {
  const target = await readSnsAccountRow(id);
  if (!target) return false;

  const contents = unwrap(
    await db()
      .from("sns_contents")
      .select("media_attachments")
      .eq("account_id", id)
      .returns<Pick<SnsContentRow, "media_attachments">[]>()
  );
  const orphanedMedia = contents.flatMap((c) => c.media_attachments?.map((att) => att.id) ?? []);

  await insertAuditLog({
    account_id: id,
    entity_type: "sns_account",
    entity_id: id,
    action: "sns_account.deleted",
    actor_type: "agency",
    summary: `[${target.company_name}] (@${target.handle}) SNS 계정을 삭제했습니다.`,
  });

  unwrap(await db().from("sns_accounts").delete().eq("id", id));

  await purgeMedia(orphanedMedia);
  return true;
}

// ---------- 인테이크 템플릿 (단일 행) ----------

async function readSnsIntakeTemplateRow(): Promise<SnsIntakeTemplateRow | null> {
  return unwrapMaybe(
    await db()
      .from("sns_intake_template")
      .select("*")
      .eq("id", SNS_INTAKE_TEMPLATE_ID)
      .maybeSingle<SnsIntakeTemplateRow>()
  );
}

/**
 * SNS 인테이크 기본 질문 템플릿.
 * 행이 없으면 코드의 기본 질문으로 채운다. 동시에 두 요청이 들어와도 ignoreDuplicates 로 한 쪽만 쓴다.
 */
export async function getSnsIntakeTemplate(): Promise<SnsIntakeTemplate> {
  let row = await readSnsIntakeTemplateRow();
  if (!row) {
    unwrap(
      await db()
        .from("sns_intake_template")
        .upsert(
          { id: SNS_INTAKE_TEMPLATE_ID, questions: DEFAULT_SNS_INTAKE_QUESTIONS },
          { onConflict: "id", ignoreDuplicates: true }
        )
    );
    row = await readSnsIntakeTemplateRow();
  }
  return { id: SNS_INTAKE_TEMPLATE_ID, questions: row?.questions ?? DEFAULT_SNS_INTAKE_QUESTIONS };
}

export async function updateSnsIntakeTemplate(
  questions: SnsIntakeTemplate["questions"]
): Promise<SnsIntakeTemplate> {
  const cleaned = cleanQuestions(questions);
  const row = unwrap(
    await db()
      .from("sns_intake_template")
      .upsert(
        { id: SNS_INTAKE_TEMPLATE_ID, questions: cleaned, updated_at: nowIso() },
        { onConflict: "id" }
      )
      .select("*")
      .single<SnsIntakeTemplateRow>()
  );
  return { id: SNS_INTAKE_TEMPLATE_ID, questions: row.questions ?? cleaned };
}

/** 계정별 질문이 있으면 그것, 없으면 공용 템플릿. */
export async function getSnsIntakeQuestionsForAccount(accountId: string): Promise<PreSurveyQuestion[]> {
  const acc = await readSnsAccountRow(accountId);
  if (acc?.intake_questions && acc.intake_questions.length > 0) {
    return acc.intake_questions;
  }
  return (await getSnsIntakeTemplate()).questions;
}

/** 계정별 질문 저장. null 이면 공용 템플릿을 쓰도록 컬럼을 비운다. */
export async function updateSnsAccountIntakeQuestions(
  accountId: string,
  questions: PreSurveyQuestion[] | null
): Promise<SnsAccount> {
  const cleaned: PreSurveyQuestion[] | null = questions === null ? null : cleanQuestions(questions);

  if (!(await snsAccountExists(accountId))) throw new ValidationError("계정을 찾을 수 없습니다.");

  const row = unwrap(
    await db()
      .from("sns_accounts")
      .update({ intake_questions: cleaned })
      .eq("id", accountId)
      .select("*")
      .single<SnsAccountRow>()
  );
  return rowToSnsAccount(row);
}

// ---------- 인테이크 응답 ----------

export async function getSnsIntakeResponse(accountId: string): Promise<SnsIntakeResponse | null> {
  if (!isUuid(accountId)) return null;
  const row = unwrapMaybe(
    await db()
      .from("sns_intake_responses")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle<SnsIntakeResponseRow>()
  );
  return row ? rowToSnsIntakeResponse(row) : null;
}

/** 응답 저장. 계정당 한 건이므로 upsert 한다. 재제출이면 id 는 유지되고 제출 시각만 바뀐다. */
export async function saveSnsIntakeResponse(data: {
  account_id: string;
  answers: Record<string, string>;
}): Promise<SnsIntakeResponse> {
  const account = await readSnsAccountRow(data.account_id);
  if (!account) {
    throw new ValidationError("계정을 찾을 수 없습니다.");
  }
  const questions = account.intake_questions && account.intake_questions.length > 0
    ? account.intake_questions
    : (await getSnsIntakeTemplate()).questions;
  const answers: Record<string, string> = {};
  for (const q of questions) {
    const v = data.answers?.[q.id];
    const text = typeof v === "string" ? v.trim() : "";
    if (q.required && !text) throw new ValidationError(`필수 질문에 답변해주세요: ${q.question}`);
    if (text) answers[q.id] = text.slice(0, 5000);
  }

  const row = unwrap(
    await db()
      .from("sns_intake_responses")
      .upsert(
        { account_id: data.account_id, answers, submitted_at: nowIso() },
        { onConflict: "account_id" }
      )
      .select("*")
      .single<SnsIntakeResponseRow>()
  );
  return rowToSnsIntakeResponse(row);
}

// ---------- 운영 계획 ----------

export async function getSnsPlan(accountId: string): Promise<SnsPlan | null> {
  if (!isUuid(accountId)) return null;
  const row = unwrapMaybe(
    await db().from("sns_plans").select("*").eq("account_id", accountId).maybeSingle<SnsPlanRow>()
  );
  return row ? rowToSnsPlan(row) : null;
}

/** 운영 계획 저장. 계정당 한 건이므로 upsert 한다. template_id 는 SNS 용 템플릿만 허용한다. */
export async function saveSnsPlan(data: {
  account_id: string;
  template_id: string | null;
  field_values: Record<string, string>;
}): Promise<SnsPlan> {
  const values = cleanFieldValues(data.field_values);
  if (!(await snsAccountExists(data.account_id))) throw new ValidationError("계정을 찾을 수 없습니다.");

  let templateId: string | null = null;
  if (data.template_id) {
    const template = await getPptTemplateById(data.template_id);
    if (!template || template.kind !== "sns") throw new ValidationError("SNS용 PPT 템플릿을 찾을 수 없습니다.");
    templateId = template.id;
  }

  const row = unwrap(
    await db()
      .from("sns_plans")
      .upsert(
        { account_id: data.account_id, template_id: templateId, field_values: values, updated_at: nowIso() },
        { onConflict: "account_id" }
      )
      .select("*")
      .single<SnsPlanRow>()
  );
  return rowToSnsPlan(row);
}

// ---------- 콘텐츠 ----------

/** 계정의 콘텐츠 목록. 발행 예정일 내림차순, 예정일 없는 것은 뒤로. */
export async function getSnsContentsByAccountId(accountId: string): Promise<SnsContent[]> {
  if (!isUuid(accountId)) return [];
  const rows = unwrap(
    await db()
      .from("sns_contents")
      .select("*")
      .eq("account_id", accountId)
      .order("scheduled_on", { ascending: false, nullsFirst: false })
      .returns<SnsContentRow[]>()
  );
  return rows.map(rowToSnsContent);
}

/** 전체 콘텐츠. 최신 생성 순. */
export async function getAllSnsContents(): Promise<SnsContent[]> {
  const rows = unwrap(
    await db()
      .from("sns_contents")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<SnsContentRow[]>()
  );
  return rows.map(rowToSnsContent);
}

export async function getSnsContentById(id: string): Promise<SnsContent | null> {
  const row = await readSnsContentRow(id);
  return row ? rowToSnsContent(row) : null;
}

export async function createSnsContent(data: {
  account_id: string;
  title: string;
  scheduled_on: string | null;
  assignee: string | null;
  caption: string | null;
  hashtags: string | null;
  media_note: string | null;
}): Promise<SnsContent> {
  const title = requireText(data.title, "콘텐츠 제목", 300);
  const scheduledOn = optionalDate(data.scheduled_on, "발행 예정일");
  if (!(await snsAccountExists(data.account_id))) throw new ValidationError("계정을 찾을 수 없습니다.");

  const row = unwrap(
    await db()
      .from("sns_contents")
      .insert({
        account_id: data.account_id,
        title,
        scheduled_on: scheduledOn,
        assignee: optionalText(data.assignee, 100),
        status: "planning",
        caption: optionalText(data.caption, 5000),
        hashtags: optionalText(data.hashtags, 1000),
        media_note: optionalText(data.media_note, 3000),
        media_attachments: [],
        client_comment: null,
        post_url: null,
        view_count: null,
        like_count: null,
        comment_count: null,
        status_changed_at: nowIso(),
      })
      .select("*")
      .single<SnsContentRow>()
  );
  return rowToSnsContent(row);
}

export interface SnsContentPatch {
  title?: string;
  scheduled_on?: string | null;
  assignee?: string | null;
  status?: SnsContentStatus;
  caption?: string | null;
  hashtags?: string | null;
  media_note?: string | null;
  post_url?: string | null;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
}

/** 콘텐츠 수정. 성과 수치는 게시완료(posted) 상태에서만 넣을 수 있다. 없는 id 면 null. */
export async function updateSnsContent(id: string, patch: SnsContentPatch): Promise<SnsContent | null> {
  const current = await readSnsContentRow(id);
  if (!current) return null;

  const update: Partial<SnsContentRow> = {};
  if (patch.title !== undefined) update.title = requireText(patch.title, "콘텐츠 제목", 300);
  if (patch.scheduled_on !== undefined) update.scheduled_on = optionalDate(patch.scheduled_on, "발행 예정일");
  if (patch.assignee !== undefined) update.assignee = optionalText(patch.assignee, 100);
  if (patch.caption !== undefined) update.caption = optionalText(patch.caption, 5000);
  if (patch.hashtags !== undefined) update.hashtags = optionalText(patch.hashtags, 1000);
  if (patch.media_note !== undefined) update.media_note = optionalText(patch.media_note, 3000);
  if (patch.post_url !== undefined) update.post_url = optionalUrl(patch.post_url, "게시 링크");

  const perfKeys = ["view_count", "like_count", "comment_count"] as const;
  const labels = { view_count: "조회수", like_count: "좋아요", comment_count: "댓글수" };
  for (const key of perfKeys) {
    if (patch[key] === undefined) continue;
    if (patch[key] === null) {
      update[key] = null;
    } else {
      if (current.status !== "posted" && patch.status !== "posted") {
        throw new ValidationError("성과 수치는 게시완료 상태에서만 입력할 수 있습니다.");
      }
      update[key] = nonNegativeInt(patch[key], labels[key]);
    }
  }

  if (patch.status !== undefined) {
    const next = oneOf(patch.status, SNS_CONTENT_STATUSES, "콘텐츠 상태");
    if (next !== current.status) {
      update.status = next;
      update.status_changed_at = nowIso();
    }
  }

  if (Object.keys(update).length === 0) return rowToSnsContent(current);

  const row = unwrap(
    await db().from("sns_contents").update(update).eq("id", id).select("*").single<SnsContentRow>()
  );
  return rowToSnsContent(row);
}

/** 콘텐츠 삭제. 행을 지운 뒤 첨부 파일을 저장소에서 지운다. 없는 id 면 false. */
export async function deleteSnsContent(id: string): Promise<boolean> {
  const current = await readSnsContentRow(id);
  if (!current) return false;
  const removedMedia = current.media_attachments?.map((att) => att.id) ?? [];

  unwrap(await db().from("sns_contents").delete().eq("id", id));

  await purgeMedia(removedMedia);
  return true;
}

// ---------- 미디어 첨부 ----------

/**
 * 저장소에서 첨부 파일을 지운다.
 * DB 쓰기가 끝난 뒤에 부른다. 파일 삭제가 실패해도 DB는 이미 정합하므로 경고만 남긴다.
 */
async function purgeMedia(attachmentIds: string[]): Promise<void> {
  if (attachmentIds.length === 0) return;
  try {
    await deleteFilesByPrefixes(attachmentIds);
  } catch (err) {
    console.warn("[storage] 첨부 파일 삭제 실패 (DB는 정상 반영됨):", err);
  }
}

/** 파일 시그니처(매직 바이트) 검사. 브라우저가 준 MIME과 실제 내용이 일치하는지 본다. */
export function matchesMediaSignature(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  const hex = (start: number, len: number) => buf.subarray(start, start + len).toString("hex");
  const ascii = (start: number, len: number) => buf.subarray(start, start + len).toString("latin1");
  switch (mime) {
    case "image/jpeg": return hex(0, 3) === "ffd8ff";
    case "image/png": return hex(0, 8) === "89504e470d0a1a0a";
    case "image/gif": return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
    case "image/webp": return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
    case "video/mp4":
    case "video/quicktime": return ascii(4, 4) === "ftyp";
    case "video/webm": return hex(0, 4) === "1a45dfa3";
    default: return false;
  }
}

function sanitizeFileName(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._\-가-힣]/g, "_");
}

/** 업로드 전 공통 검증. 형식과 크기만 본다. 내용 검사는 바이트가 있어야 하므로 따로 한다. */
function validateSnsMediaMeta(mimeRaw: string, size: number): { mime: string; ext: string } {
  const mime = mimeRaw?.toLowerCase() || "";
  const ext = ALLOWED_SNS_MEDIA_MIME_TYPES[mime];
  if (!ext) {
    throw new ValidationError("지원하지 않는 파일 형식입니다. (JPG, PNG, WebP, GIF, MP4, WebM, MOV 지원)");
  }
  if (size > MAX_SNS_MEDIA_BYTES) {
    throw new ValidationError("파일 크기는 50MB 이하만 업로드할 수 있습니다.");
  }
  if (size <= 0) {
    throw new ValidationError("빈 파일은 업로드할 수 없습니다.");
  }
  return { mime, ext };
}

/**
 * 콘텐츠의 media_attachments 배열에 첨부를 추가하고 감사 로그를 남긴다.
 * recordUploadedSnsMedia 와 saveSnsMediaAttachment 가 같은 마무리 단계를 쓴다.
 * 콘텐츠가 없으면 이미 올라간 고아 파일을 치우고 ValidationError 를 던진다.
 */
async function appendMediaAttachment(contentId: string, attachment: SnsMediaAttachment): Promise<SnsMediaAttachment> {
  const content = await readSnsContentRow(contentId);
  if (!content) {
    // 저장은 이미 끝났으니 고아 파일을 치운다. 실패해도 업로드 오류를 가리지 않는다.
    void purgeMedia([attachment.id]);
    throw new ValidationError("콘텐츠를 찾을 수 없습니다.");
  }
  const attachments = [...(content.media_attachments ?? []), attachment];

  unwrap(
    await db().from("sns_contents").update({ media_attachments: attachments }).eq("id", contentId)
  );

  await insertAuditLog({
    account_id: content.account_id,
    entity_type: "sns_content",
    entity_id: content.id,
    action: "sns.add_media",
    actor_type: "agency",
    summary: `[${content.title}] 시안 미디어 첨부: ${attachment.name} (${(attachment.size / (1024 * 1024)).toFixed(1)}MB)`,
  });

  return attachment;
}

/**
 * 브라우저가 Blob 에 직접 올리기 전에 서버가 자리를 잡아준다.
 *
 * Vercel 함수는 요청 본문을 4.5MB 로 자르기 때문에, 파일이 서버를 거치면 그보다 큰 건 못 올린다.
 * 그래서 파일은 브라우저에서 저장소로 바로 보내고, 서버는 어디에 어떤 이름으로 받을지만 정한다.
 */
export async function prepareSnsMediaUpload(
  contentId: string,
  fileName: string,
  mimeType: string,
  size: number
): Promise<{ attachmentId: string; storedFilename: string; pathname: string; safeName: string; mime: string }> {
  const { mime, ext } = validateSnsMediaMeta(mimeType, size);

  const exists = isUuid(contentId)
    ? unwrapMaybe(
        await db().from("sns_contents").select("id").eq("id", contentId).maybeSingle<{ id: string }>()
      )
    : null;
  if (!exists) {
    throw new ValidationError("콘텐츠를 찾을 수 없습니다.");
  }

  const attachmentId = crypto.randomUUID();
  const storedFilename = `${attachmentId}${ext}`;
  return {
    attachmentId,
    storedFilename,
    pathname: uploadPathname(storedFilename),
    safeName: sanitizeFileName(fileName) || `attachment_${attachmentId}${ext}`,
    mime,
  };
}

/**
 * 브라우저가 업로드를 끝낸 뒤 DB에 첨부를 기록한다.
 *
 * 파일이 서버를 거치지 않았으므로 여기서 실물을 확인한다. 실제로 올라왔는지, 크기가 맞는지,
 * 앞부분 바이트가 주장한 형식과 맞는지 본다. 하나라도 어긋나면 올라온 파일을 지운다.
 */
export async function recordUploadedSnsMedia(
  contentId: string,
  input: { attachmentId: string; storedFilename: string; name: string; mime_type: string }
): Promise<SnsMediaAttachment> {
  const { mime } = validateSnsMediaMeta(input.mime_type, 1);

  if (!/^[0-9a-f-]{36}\.[a-z0-9]{3,4}$/i.test(input.storedFilename)) {
    throw new ValidationError("잘못된 업로드 요청입니다.");
  }

  const stat = await statFile(input.storedFilename);
  if (!stat) {
    throw new ValidationError("업로드된 파일을 찾을 수 없습니다. 다시 시도해주세요.");
  }
  if (stat.size > MAX_SNS_MEDIA_BYTES || stat.size <= 0) {
    await purgeMedia([input.attachmentId]);
    throw new ValidationError("파일 크기는 50MB 이하만 업로드할 수 있습니다.");
  }

  // 내용 검사. 앞 12바이트만 읽으면 되므로 큰 파일이어도 부담이 없다.
  const head = await readFile(input.storedFilename, "bytes=0-11");
  if (!head) {
    await purgeMedia([input.attachmentId]);
    throw new ValidationError("업로드된 파일을 읽을 수 없습니다. 다시 시도해주세요.");
  }
  const headBytes = Buffer.from(await new Response(head.stream).arrayBuffer());
  if (!matchesMediaSignature(headBytes, mime)) {
    await purgeMedia([input.attachmentId]);
    throw new ValidationError("파일 내용이 확장자와 다릅니다. 실제 이미지/영상 파일만 업로드할 수 있습니다.");
  }

  const attachment: SnsMediaAttachment = {
    id: input.attachmentId,
    name: sanitizeFileName(input.name) || input.storedFilename,
    url: `/api/media/${input.attachmentId}`,
    mime_type: mime,
    size: stat.size,
    uploaded_at: nowIso(),
  };

  return appendMediaAttachment(contentId, attachment);
}

/** 서버를 거쳐 올라온 파일(작은 파일·테스트)을 저장소에 쓰고 DB 에 첨부를 기록한다. */
export async function saveSnsMediaAttachment(
  contentId: string,
  file: {
    name: string;
    buffer: Buffer;
    mime_type: string;
    size: number;
  }
): Promise<SnsMediaAttachment> {
  const { mime, ext } = validateSnsMediaMeta(file.mime_type, file.size);
  if (!file.buffer || file.buffer.length === 0 || file.buffer.length > MAX_SNS_MEDIA_BYTES) {
    throw new ValidationError("파일 크기는 50MB 이하만 업로드할 수 있습니다.");
  }
  // 브라우저가 보낸 MIME(file.type)은 확장자만 보고 정하므로, 실제 파일 시그니처와 맞는지 확인한다.
  if (!matchesMediaSignature(file.buffer, mime)) {
    throw new ValidationError("파일 내용이 확장자와 다릅니다. 실제 이미지/영상 파일만 업로드할 수 있습니다.");
  }

  const attachmentId = crypto.randomUUID();
  const safeName = sanitizeFileName(file.name) || `attachment_${attachmentId}${ext}`;
  const storedFilename = `${attachmentId}${ext}`;

  await putFile(storedFilename, file.buffer, mime);

  const attachment: SnsMediaAttachment = {
    id: attachmentId,
    name: safeName,
    url: `/api/media/${attachmentId}`,
    mime_type: mime,
    size: file.size,
    uploaded_at: nowIso(),
  };

  return appendMediaAttachment(contentId, attachment);
}

/** 첨부 삭제. 배열에서 빼고 update 한 뒤 저장소에서 파일을 지운다. 없으면 false. */
export async function deleteSnsMediaAttachment(
  contentId: string,
  attachmentId: string
): Promise<boolean> {
  const content = await readSnsContentRow(contentId);
  if (!content || !content.media_attachments) return false;

  const idx = content.media_attachments.findIndex((m) => m.id === attachmentId);
  if (idx < 0) return false;

  const remaining = content.media_attachments.filter((m) => m.id !== attachmentId);
  const deleted = content.media_attachments[idx];

  unwrap(
    await db().from("sns_contents").update({ media_attachments: remaining }).eq("id", contentId)
  );

  await insertAuditLog({
    account_id: content.account_id,
    entity_type: "sns_content",
    entity_id: content.id,
    action: "sns.delete_media",
    actor_type: "agency",
    summary: `[${content.title}] 시안 미디어 삭제: ${deleted.name}`,
  });

  await purgeMedia([attachmentId]);
  return true;
}

/**
 * 첨부 id 로 콘텐츠를 찾는다(/api/media/:id).
 * jsonb 배열 포함 검색(@>)을 쓰며, sns_contents_media_gin 인덱스가 받쳐 준다.
 */
export async function getSnsMediaAttachmentById(
  attachmentId: string
): Promise<{ attachment: SnsMediaAttachment; storageKey: string; accountId: string } | null> {
  if (!isUuid(attachmentId)) return null;
  const content = unwrapMaybe(
    await db()
      .from("sns_contents")
      .select("*")
      .contains("media_attachments", JSON.stringify([{ id: attachmentId }]))
      .maybeSingle<SnsContentRow>()
  );
  if (!content) return null;
  const att = content.media_attachments?.find((m) => m.id === attachmentId);
  if (!att) return null;
  const storageKey = await findFileKeyByPrefix(attachmentId);
  if (!storageKey) return null;
  return { attachment: att, storageKey, accountId: content.account_id };
}

// ---------- 광고주 승인 ----------

/**
 * 광고주 승인/수정요청. 반드시 토큰으로 확인된 accountId를 넘겨야 하며,
 * 콘텐츠가 그 계정 소속이고 현재 `pending_approval` 상태일 때만 처리한다(멱등).
 */
export async function reviewSnsContent(data: {
  accountId: string;
  contentId: string;
  decision: "approve" | "request_changes";
  comment?: string;
}): Promise<{ content: SnsContent; changed: boolean }> {
  const decision = oneOf(data.decision, ["approve", "request_changes"] as const, "결정");
  const current = await readSnsContentRow(data.contentId);
  if (!current || current.account_id !== data.accountId) {
    throw new ValidationError("콘텐츠를 찾을 수 없습니다.");
  }
  if (current.status !== "pending_approval") {
    return { content: rowToSnsContent(current), changed: false };
  }

  const update: Partial<SnsContentRow> =
    decision === "approve"
      ? { status: "approved", client_comment: null }
      : { status: "producing", client_comment: optionalText(data.comment, 2000) || "수정 요청이 접수되었습니다." };
  update.status_changed_at = nowIso();

  const row = unwrap(
    await db()
      .from("sns_contents")
      .update(update)
      .eq("id", data.contentId)
      .select("*")
      .single<SnsContentRow>()
  );

  await insertAuditLog({
    account_id: data.accountId,
    entity_type: "sns_content",
    entity_id: row.id,
    action: decision === "approve" ? "sns.approved" : "sns.revision_requested",
    actor_type: "company",
    summary: `광고주가 [${row.title}] 시안을 ${decision === "approve" ? "승인" : "수정요청"}했습니다.`,
    details: decision === "request_changes" ? { comment: data.comment } : null,
  });

  return { content: rowToSnsContent(row), changed: true };
}
