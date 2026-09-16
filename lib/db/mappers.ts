import type {
  Applicant,
  AuditLogEntry,
  Campaign,
  CampaignFormConfig,
  CampaignReport,
  EventChecklistItem,
  EventInvitee,
  EventPlan,
  MarketingEvent,
  PptTemplate,
  PreSurveyResponse,
  SeedingRecord,
  SnsAccount,
  SnsContent,
  SnsIntakeResponse,
  SnsPlan,
} from "./types";

/**
 * DB 행 → 앱 타입.
 *
 * 호출 코드는 옛 JSON 시절의 타입을 그대로 기대한다. 여기서 두 가지를 맞춘다.
 * - `?:` 로 선언된 옵셔널 필드는 DB 의 null 을 undefined 로 바꾼다.
 *   (`string | null` 로 선언된 필드는 null 을 그대로 둔다.)
 * - timestamptz 는 PostgREST 가 `+00:00` 형식으로 주므로 `Z` 형식으로 되돌린다.
 *   date 는 `YYYY-MM-DD` 문자열로 오므로 그대로 쓴다.
 */

function ts(v: string): string;
function ts(v: string | null): string | null;
function ts(v: string | null): string | null {
  return v === null ? null : new Date(v).toISOString();
}

function opt<T>(v: T | null): T | undefined {
  return v === null ? undefined : v;
}

// ---------- 캠페인 ----------

export interface CampaignRow {
  id: string;
  name: string;
  company_name: string;
  campaign_type: Campaign["campaign_type"];
  status: Campaign["status"];
  pre_survey_token: string;
  apply_form_token: string;
  applicants_share_token: string;
  seeding_sheet_share_token: string;
  message_templates: Record<string, string> | null;
  webhook_url: string | null;
  pre_survey_questions: Campaign["pre_survey_questions"] | null;
  created_at: string;
}

export function rowToCampaign(r: CampaignRow): Campaign {
  return {
    id: r.id,
    name: r.name,
    company_name: r.company_name,
    campaign_type: r.campaign_type,
    status: r.status,
    pre_survey_token: r.pre_survey_token,
    apply_form_token: r.apply_form_token,
    applicants_share_token: r.applicants_share_token,
    seeding_sheet_share_token: r.seeding_sheet_share_token,
    message_templates: opt(r.message_templates),
    webhook_url: opt(r.webhook_url),
    pre_survey_questions: opt(r.pre_survey_questions),
    created_at: ts(r.created_at),
  };
}

export interface PreSurveyResponseRow {
  id: string;
  campaign_id: string;
  answers: Record<string, string>;
  used_ai_assist: boolean;
  submitted_at: string;
}

export function rowToPreSurveyResponse(r: PreSurveyResponseRow): PreSurveyResponse {
  return {
    id: r.id,
    campaign_id: r.campaign_id,
    answers: r.answers ?? {},
    used_ai_assist: r.used_ai_assist,
    submitted_at: ts(r.submitted_at),
  };
}

export interface FormConfigRow {
  id: string;
  campaign_id: string;
  intro_text: string;
  custom_questions: CampaignFormConfig["custom_questions"];
  is_published: boolean;
  created_at: string;
}

export function rowToFormConfig(r: FormConfigRow): CampaignFormConfig {
  return {
    id: r.id,
    campaign_id: r.campaign_id,
    intro_text: r.intro_text,
    custom_questions: r.custom_questions ?? [],
    is_published: r.is_published,
    created_at: ts(r.created_at),
  };
}

// ---------- 지원자 / 시딩 ----------

export interface ApplicantRow {
  id: string;
  campaign_id: string;
  name: string;
  sns_link: string;
  nationality: string;
  contact: string;
  follower_count: number | null;
  category: string | null;
  agency_memo: string | null;
  shipping_address: string | null;
  visit_schedule: string | null;
  visit_party_size: number | null;
  custom_answers: Record<string, string | number | boolean> | null;
  privacy_agreed: boolean;
  secondary_use_agreed: boolean;
  status: Applicant["status"];
  status_changed_by: Applicant["status_changed_by"];
  status_changed_at: string | null;
  applied_at: string;
}

export function rowToApplicant(r: ApplicantRow): Applicant {
  return {
    id: r.id,
    campaign_id: r.campaign_id,
    name: r.name,
    sns_link: r.sns_link,
    nationality: r.nationality,
    contact: r.contact,
    follower_count: opt(r.follower_count),
    category: opt(r.category),
    agency_memo: opt(r.agency_memo),
    shipping_address: opt(r.shipping_address),
    visit_schedule: opt(r.visit_schedule),
    visit_party_size: opt(r.visit_party_size),
    custom_answers: r.custom_answers ?? {},
    privacy_agreed: r.privacy_agreed,
    secondary_use_agreed: r.secondary_use_agreed,
    status: r.status,
    status_changed_by: r.status_changed_by,
    status_changed_at: r.status_changed_at === null ? undefined : ts(r.status_changed_at),
    applied_at: ts(r.applied_at),
  };
}

export interface SeedingRecordRow {
  id: string;
  campaign_id: string;
  applicant_id: string;
  progress_stage: SeedingRecord["progress_stage"];
  upload_deadline: string | null;
  upload_link: string | null;
  views: number;
  engagement: number;
  notes: string | null;
  shipping_address: string | null;
  visit_scheduled_at: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToSeedingRecord(r: SeedingRecordRow): SeedingRecord {
  return {
    id: r.id,
    campaign_id: r.campaign_id,
    applicant_id: r.applicant_id,
    progress_stage: r.progress_stage,
    upload_deadline: r.upload_deadline,
    upload_link: r.upload_link,
    views: r.views,
    engagement: r.engagement,
    notes: r.notes,
    shipping_address: opt(r.shipping_address),
    visit_scheduled_at: opt(r.visit_scheduled_at),
    updated_at: ts(r.updated_at),
    created_at: ts(r.created_at),
  };
}

// ---------- 보고서 ----------

export interface ReportRow {
  id: string;
  campaign_id: string;
  title: string;
  snapshot_data: CampaignReport["snapshot_data"] | null;
  custom_sections: CampaignReport["custom_sections"];
  generated_at: string | null;
  created_at: string;
}

export function rowToReport(r: ReportRow): CampaignReport {
  return {
    id: r.id,
    campaign_id: r.campaign_id,
    title: r.title,
    snapshot_data: opt(r.snapshot_data),
    custom_sections: r.custom_sections ?? [],
    generated_at: r.generated_at === null ? undefined : ts(r.generated_at),
    created_at: ts(r.created_at),
  };
}

// ---------- PPT 템플릿 (업로드한 것만 DB 에 있다) ----------

export interface PptTemplateRow {
  id: string;
  kind: PptTemplate["kind"];
  name: string;
  file_key: string | null;
  placeholders: string[];
  uploaded_at: string;
}

export function rowToPptTemplate(r: PptTemplateRow): PptTemplate {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    file_key: opt(r.file_key),
    placeholders: r.placeholders ?? [],
    uploaded_at: ts(r.uploaded_at),
  };
}

// ---------- 행사 ----------

export interface EventRow {
  id: string;
  campaign_id: string;
  name: string;
  event_at: string | null;
  venue: string | null;
  memo: string | null;
  status: MarketingEvent["status"];
  created_at: string;
}

export function rowToEvent(r: EventRow): MarketingEvent {
  return {
    id: r.id,
    campaign_id: r.campaign_id,
    name: r.name,
    event_at: ts(r.event_at),
    venue: r.venue,
    memo: r.memo,
    status: r.status,
    created_at: ts(r.created_at),
  };
}

export interface EventInviteeRow {
  id: string;
  event_id: string;
  applicant_id: string | null;
  name: string;
  sns_url: string | null;
  contact: string | null;
  rsvp_status: EventInvitee["rsvp_status"];
  attended: boolean;
  memo: string | null;
  created_at: string;
}

export function rowToEventInvitee(r: EventInviteeRow): EventInvitee {
  return {
    id: r.id,
    event_id: r.event_id,
    applicant_id: r.applicant_id,
    name: r.name,
    sns_url: r.sns_url,
    contact: r.contact,
    rsvp_status: r.rsvp_status,
    attended: r.attended,
    memo: r.memo,
    created_at: ts(r.created_at),
  };
}

export interface EventChecklistItemRow {
  id: string;
  event_id: string;
  label: string;
  due_date: string | null;
  assignee: string | null;
  done: boolean;
  sort_order: number;
  created_at: string;
}

export function rowToEventChecklistItem(r: EventChecklistItemRow): EventChecklistItem {
  return {
    id: r.id,
    event_id: r.event_id,
    label: r.label,
    due_date: r.due_date,
    assignee: r.assignee,
    done: r.done,
    sort_order: r.sort_order,
    created_at: ts(r.created_at),
  };
}

export interface EventPlanRow {
  id: string;
  event_id: string;
  template_id: string;
  field_values: Record<string, string>;
  updated_at: string;
}

export function rowToEventPlan(r: EventPlanRow): EventPlan {
  return {
    id: r.id,
    event_id: r.event_id,
    template_id: r.template_id,
    field_values: r.field_values ?? {},
    updated_at: ts(r.updated_at),
  };
}

// ---------- SNS ----------

export interface SnsAccountRow {
  id: string;
  company_name: string;
  platform: SnsAccount["platform"];
  handle: string;
  starts_on: string | null;
  ends_on: string | null;
  status: SnsAccount["status"];
  intake_token: string;
  approval_token: string;
  intake_questions: SnsAccount["intake_questions"] | null;
  created_at: string;
}

export function rowToSnsAccount(r: SnsAccountRow): SnsAccount {
  return {
    id: r.id,
    company_name: r.company_name,
    platform: r.platform,
    handle: r.handle,
    starts_on: r.starts_on,
    ends_on: r.ends_on,
    status: r.status,
    intake_token: r.intake_token,
    approval_token: r.approval_token,
    intake_questions: opt(r.intake_questions),
    created_at: ts(r.created_at),
  };
}

export interface SnsIntakeResponseRow {
  id: string;
  account_id: string;
  answers: Record<string, string>;
  submitted_at: string;
}

export function rowToSnsIntakeResponse(r: SnsIntakeResponseRow): SnsIntakeResponse {
  return {
    id: r.id,
    account_id: r.account_id,
    answers: r.answers ?? {},
    submitted_at: ts(r.submitted_at),
  };
}

export interface SnsPlanRow {
  id: string;
  account_id: string;
  template_id: string | null;
  field_values: Record<string, string>;
  updated_at: string;
}

export function rowToSnsPlan(r: SnsPlanRow): SnsPlan {
  return {
    id: r.id,
    account_id: r.account_id,
    template_id: r.template_id,
    field_values: r.field_values ?? {},
    updated_at: ts(r.updated_at),
  };
}

export interface SnsContentRow {
  id: string;
  account_id: string;
  title: string;
  scheduled_on: string | null;
  assignee: string | null;
  status: SnsContent["status"];
  caption: string | null;
  hashtags: string | null;
  media_note: string | null;
  media_attachments: NonNullable<SnsContent["media_attachments"]> | null;
  client_comment: string | null;
  post_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  status_changed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToSnsContent(r: SnsContentRow): SnsContent {
  return {
    id: r.id,
    account_id: r.account_id,
    title: r.title,
    scheduled_on: r.scheduled_on,
    assignee: r.assignee,
    status: r.status,
    caption: r.caption,
    hashtags: r.hashtags,
    media_note: r.media_note,
    media_attachments: r.media_attachments ?? [],
    client_comment: r.client_comment,
    post_url: r.post_url,
    view_count: r.view_count,
    like_count: r.like_count,
    comment_count: r.comment_count,
    status_changed_at: ts(r.status_changed_at),
    created_at: ts(r.created_at),
    updated_at: ts(r.updated_at),
  };
}

// ---------- 감사 로그 ----------

export interface AuditLogRow {
  id: string;
  campaign_id: string | null;
  account_id: string | null;
  entity_type: AuditLogEntry["entity_type"];
  entity_id: string;
  action: string;
  actor_type: AuditLogEntry["actor_type"];
  actor_name: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export function rowToAuditLog(r: AuditLogRow): AuditLogEntry {
  return {
    id: r.id,
    campaign_id: r.campaign_id,
    account_id: r.account_id,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    action: r.action,
    actor_type: r.actor_type,
    actor_name: r.actor_name,
    summary: r.summary,
    details: r.details,
    created_at: ts(r.created_at),
  };
}
