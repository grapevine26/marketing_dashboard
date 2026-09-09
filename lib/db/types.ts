/** SNS 시안 미디어로 허용하는 형식과 저장 확장자. 서버와 브라우저가 같은 값을 봐야 한다. */
export const ALLOWED_SNS_MEDIA_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

export const MAX_SNS_MEDIA_BYTES = 50 * 1024 * 1024;

/** 확장자로 형식을 되짚는다. 브라우저가 형식을 안 알려줄 때 쓴다. */
const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/** 지원하지는 않지만 무엇인지는 알려줄 수 있는 형식. 안내 문구를 정확히 하려고 둔다. */
const KNOWN_UNSUPPORTED: Record<string, string> = {
  heic: "아이폰 HEIC 사진",
  heif: "아이폰 HEIF 사진",
  avif: "AVIF 이미지",
  bmp: "BMP 이미지",
  tiff: "TIFF 이미지",
  mkv: "MKV 영상",
  avi: "AVI 영상",
  wmv: "WMV 영상",
};

export function fileExtensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/**
 * 올린 파일의 형식을 정한다.
 *
 * 브라우저가 늘 형식을 알려주지는 않는다. 휴대폰 사진첩이나 파일 앱에서 고르면
 * 형식이 비어 있거나 application/octet-stream 으로 오는 경우가 흔하다.
 * 그때 확장자로 되짚지 않으면 멀쩡한 사진도 거부된다.
 *
 * 확장자를 믿어도 안전하다. 서버가 파일 앞부분 바이트를 읽어 실제 내용을 다시 확인하기 때문에,
 * 확장자만 바꾼 파일은 그 단계에서 걸린다.
 */
export function resolveMediaMime(fileName: string, browserType: string | undefined): string {
  const reported = (browserType || "").toLowerCase();
  if (ALLOWED_SNS_MEDIA_MIME_TYPES[reported]) return reported;
  return EXTENSION_TO_MIME[fileExtensionOf(fileName)] ?? reported;
}

/** 거부할 때 무엇이 문제인지 짚어주는 문구. */
export function unsupportedMediaMessage(fileName: string): string {
  const ext = fileExtensionOf(fileName);
  const known = KNOWN_UNSUPPORTED[ext];
  if (known) {
    return `"${fileName}" 은(는) ${known}이라 올릴 수 없습니다. JPG나 PNG로 변환해 올려주세요.`;
  }
  return `"${fileName}" 은(는) 지원하지 않는 형식입니다. JPG, PNG, WebP, GIF, MP4, WebM, MOV만 올릴 수 있습니다.`;
}


/** 업로드 파일의 저장소 접두사. 서버와 브라우저가 같은 경로를 만들어야 한다. */
export const UPLOAD_PREFIX = "uploads/";

/** PPT 템플릿 파일의 저장소 접두사. 템플릿 바이너리는 DB 문서에 넣지 않는다. */
export const TEMPLATE_PREFIX = "templates/";

export function buildUploadPathname(attachmentId: string, ext: string): string {
  return `${UPLOAD_PREFIX}${attachmentId}${ext}`;
}

/**
 * 템플릿 파일 경로.
 * 교체할 때는 version 을 붙여 새 키로 올린다. 옛 파일은 기록을 바꾼 뒤에 지운다.
 * 그래야 교체가 실패해도 쓰던 파일이 남는다.
 */
export function buildTemplatePathname(templateId: string, version?: number): string {
  return `${TEMPLATE_PREFIX}${templateStorageKey(templateId, version)}`;
}

export function templateStorageKey(templateId: string, version?: number): string {
  return version ? `${templateId}-${version}.pptx` : `${templateId}.pptx`;
}

export const MAX_PPT_TEMPLATE_BYTES = 15 * 1024 * 1024;

// Subproject A: Seeding Types
export type CampaignType = "shipping" | "visit";
export type CampaignStatus = "draft" | "recruiting" | "selecting" | "seeding" | "reporting" | "completed";
export type ApplicantStatus = "applied" | "selected" | "reserved" | "rejected";
export type ProgressStage =
  | "선정완료"
  | "발송완료"
  | "가이드전달완료"
  | "수령완료"
  | "방문완료"
  | "확정완료"
  | "업로드완료";

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "준비중",
  recruiting: "모집중",
  selecting: "선정중",
  seeding: "시딩 진행중",
  reporting: "보고서 작성",
  completed: "종료",
};

export const APPLICANT_STATUS_LABELS: Record<ApplicantStatus, string> = {
  applied: "지원완료",
  selected: "최종선정",
  reserved: "예비선정",
  rejected: "미선정",
};

export type CampaignMessageType =
  | "selected"
  | "reserved"
  | "shipping"
  | "guide"
  | "reminder";

export const CAMPAIGN_MESSAGE_TYPE_LABELS: Record<CampaignMessageType, string> = {
  selected: "최종선정 안내",
  reserved: "예비선정 안내",
  shipping: "배송/방문 안내",
  guide: "가이드라인 전달",
  reminder: "업로드 리마인드",
};

export const DEFAULT_CAMPAIGN_MESSAGE_TEMPLATES: Record<CampaignMessageType, string> = {
  selected: `안녕하세요, {{이름}}님!
{{브랜드명}} '{{캠페인명}}' 체험단에 최종 선정되셨음을 축하드립니다.
활동 관련 상세 일정 및 가이드는 순차적으로 안내해 드리겠습니다.
궁금하신 점이 있으시면 편하게 회신 부탁드립니다. 감사합니다!`,

  reserved: `안녕하세요, {{이름}}님!
{{브랜드명}} '{{캠페인명}}' 체험단에 지원해 주셔서 진심으로 감사드립니다.
높은 지원 경쟁률로 인해 현재 예비 후보로 등록되셨습니다.
최종 선정자 변동 시 우선적으로 연락드리도록 하겠습니다. 감사합니다!`,

  shipping: `안녕하세요, {{이름}}님!
{{브랜드명}} '{{캠페인명}}' 체험단 제품이 발송되었습니다.
- 수령지 주소: {{배송주소}}
제품 수령 후 이상이 있으실 경우 바로 말씀해 주시기 바랍니다.`,

  guide: `안녕하세요, {{이름}}님!
{{브랜드명}} '{{캠페인명}}' 콘텐츠 제작 가이드라인을 전달드립니다.
- 필수 키워드 및 해시태그 준수
- 업로드 마감일: {{마감일}}
정성스러운 후기 부탁드립니다!`,

  reminder: `안녕하세요, {{이름}}님!
{{브랜드명}} '{{캠페인명}}' 콘텐츠 업로드 마감일({{마감일}})이 임박하여 안내드립니다.
기한 내에 멋진 콘텐츠 업로드 및 링크 공유를 부탁드립니다. 감사합니다!`,
};

export interface Campaign {
  id: string;
  name: string;
  company_name: string;
  campaign_type: CampaignType;
  status: CampaignStatus;
  pre_survey_token: string;
  apply_form_token: string;
  applicants_share_token: string;
  seeding_sheet_share_token: string;
  message_templates?: Record<string, string>;
  webhook_url?: string;
  created_at: string;
}

export type CampaignTokenType =
  | "apply_form"
  | "pre_survey"
  | "applicants_share"
  | "seeding_sheet_share";

export type SnsTokenType = "intake" | "approval";

/**
 * 공개 페이지(지원폼/사전조사/공유 링크)에 내려보내는 최소 정보.
 * 토큰·웹훅 URL·내부 안내문 템플릿은 절대 포함하지 않는다 (HTML에 그대로 직렬화되어 누구나 볼 수 있다).
 */
export interface PublicCampaign {
  id: string;
  name: string;
  company_name: string;
  campaign_type: CampaignType;
  status: CampaignStatus;
}

export function toPublicCampaign(c: Campaign): PublicCampaign {
  return {
    id: c.id,
    name: c.name,
    company_name: c.company_name,
    campaign_type: c.campaign_type,
    status: c.status,
  };
}

/**
 * 광고주 공유 페이지(/applicants, /seeding-sheet)에 내려보내는 지원자.
 * 연락처·주소·방문 일정·에이전시 내부 메모를 비운다. 새 개인정보 필드를 추가하면 여기도 같이 고칠 것.
 */
export function sanitizeApplicantForCompany(a: Applicant): Applicant {
  return {
    ...a,
    contact: "",
    shipping_address: undefined,
    visit_schedule: undefined,
    visit_party_size: undefined,
    agency_memo: undefined,
  };
}

export interface PreSurveyQuestion {
  id: string;
  question: string;
  placeholder?: string;
  type?: string;
  required: boolean;
}

export interface PreSurveyTemplate {
  id: number;
  questions: PreSurveyQuestion[];
}

export interface PreSurveyResponse {
  id: string;
  campaign_id: string;
  answers: Record<string, string>;
  used_ai_assist: boolean;
  submitted_at: string;
}

export type CustomQuestionType = "text" | "number" | "select" | "checkbox";

export interface CustomFormQuestion {
  id: string;
  label: string;
  type: CustomQuestionType;
  required: boolean;
  options?: string[];
}
export type CustomQuestion = CustomFormQuestion;

export interface CampaignFormConfig {
  id: string;
  campaign_id: string;
  intro_text: string;
  custom_questions: CustomFormQuestion[];
  is_published: boolean;
  created_at: string;
}

export interface Applicant {
  id: string;
  campaign_id: string;
  name: string;
  sns_link: string;
  nationality: string;
  contact: string;
  follower_count?: number;
  category?: string;
  agency_memo?: string;
  shipping_address?: string;
  visit_schedule?: string;
  visit_party_size?: number;
  custom_answers?: Record<string, string | number | boolean>;
  privacy_agreed: boolean;
  secondary_use_agreed: boolean;
  status: ApplicantStatus;
  status_changed_by: "agency" | "company";
  status_changed_at?: string;
  applied_at: string;
}

export interface SeedingRecord {
  id: string;
  campaign_id: string;
  applicant_id: string;
  progress_stage: ProgressStage;
  upload_deadline: string | null;
  upload_link: string | null;
  views: number;
  engagement: number;
  notes: string | null;
  shipping_address?: string;
  visit_scheduled_at?: string;
  updated_at?: string;
  created_at: string;
}

export interface CustomReportSection {
  id: string;
  title: string;
  content: string;
}
export type CustomSection = CustomReportSection;

export interface ReportSnapshotApplicant extends Applicant {
  seeding: SeedingRecord | null;
}

export interface ReportSnapshotMetrics {
  totalApplicants: number;
  selectedCount: number;
  reservedCount: number;
  completedUploads: number;
  totalViews: number;
  totalEngagement: number;
  avgEngagementRate: number;
}

export interface ReportSnapshot {
  campaign: Campaign;
  applicants: ReportSnapshotApplicant[];
  metrics: ReportSnapshotMetrics;
}

export interface CampaignReport {
  id: string;
  campaign_id: string;
  title: string;
  snapshot_data?: ReportSnapshot;
  custom_sections: CustomReportSection[];
  generated_at?: string;
  created_at: string;
}
export type Report = CampaignReport;

// Shared PPT Template Types (A 보고서 · B 행사 · C SNS 공용)
export type PptTemplateKind = "event" | "sns" | "report";

export const PPT_TEMPLATE_KIND_LABELS: Record<PptTemplateKind, string> = {
  event: "인플루언서 행사 운영안",
  sns: "SNS 채널 운영 제안서",
  report: "시딩 결과보고서",
};

export interface PptTemplate {
  id: string;
  kind: PptTemplateKind;
  name: string;
  storage_path?: string;
  /**
   * 저장소에 있는 pptx 의 키.
   * 파일은 DB 문서 밖에 둔다. 문서 안에 넣으면 모든 저장이 매번 그 파일까지 읽고 다시 쓴다.
   */
  file_key?: string;
  /**
   * @deprecated 예전에는 파일을 base64 로 문서에 넣었다. 옛 데이터를 읽기 위해서만 남긴다.
   * 새로 올리는 템플릿은 file_key 를 쓴다.
   */
  file_data?: string;
  builtin?: boolean;
  placeholders: string[];
  uploaded_at: string;
}

// Subproject B: Event Types (Belongs to Campaign)
export type EventStatus = "preparing" | "done" | "canceled";
export type EventRsvpStatus = "pending" | "attending" | "not_attending";

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  preparing: "준비중",
  done: "행사완료",
  canceled: "취소됨",
};

export interface MarketingEvent {
  id: string;
  campaign_id: string; // Foreign Key to Campaign
  name: string;
  event_at: string | null; // ISO datetime (UTC, 'Z'). 입력은 KST 기준으로 받아 변환한다.
  venue: string | null;
  memo: string | null;
  status: EventStatus;
  created_at: string;
}

export interface EventInvitee {
  id: string;
  event_id: string;
  applicant_id: string | null; // Foreign Key to Applicant (if imported)
  name: string;
  sns_url: string | null;
  contact: string | null;
  rsvp_status: EventRsvpStatus;
  attended: boolean; // Day-of check-in
  memo: string | null;
  created_at: string;
}

export interface EventChecklistItem {
  id: string;
  event_id: string;
  label: string;
  due_date: string | null; // YYYY-MM-DD
  assignee: string | null;
  done: boolean;
  sort_order: number;
  created_at: string;
}

export interface EventPlan {
  id: string;
  event_id: string;
  template_id: string; // FK to PptTemplate
  field_values: Record<string, string>;
  updated_at: string;
}

// Subproject C: SNS Operation Types (Independent Accounts)
export type SnsPlatform = "instagram" | "youtube" | "tiktok" | "other";
export type SnsAccountStatus = "active" | "ended";
export type SnsContentStatus =
  | "planning"
  | "producing"
  | "pending_approval"
  | "approved"
  | "posted";

export const SNS_CONTENT_STATUSES: SnsContentStatus[] = [
  "planning",
  "producing",
  "pending_approval",
  "approved",
  "posted",
];

export const SNS_CONTENT_STATUS_LABELS: Record<SnsContentStatus, string> = {
  planning: "기획중",
  producing: "제작중",
  pending_approval: "승인대기",
  approved: "승인완료",
  posted: "게시완료",
};

export interface SnsAccount {
  id: string;
  company_name: string;
  platform: SnsPlatform;
  handle: string;
  starts_on: string | null; // YYYY-MM-DD
  ends_on: string | null; // YYYY-MM-DD
  status: SnsAccountStatus;
  intake_token: string; // Public intake token
  approval_token: string; // Public approval token
  created_at: string;
}

/** 공개 페이지(사전설문/승인)에 내려보내는 최소 정보. 토큰은 절대 포함하지 않는다. */
export interface PublicSnsAccount {
  id: string;
  company_name: string;
  platform: SnsPlatform;
  handle: string;
  status: SnsAccountStatus;
}

export function toPublicSnsAccount(a: SnsAccount): PublicSnsAccount {
  return {
    id: a.id,
    company_name: a.company_name,
    platform: a.platform,
    handle: a.handle,
    status: a.status,
  };
}

export interface SnsIntakeTemplate {
  id: number;
  questions: PreSurveyQuestion[];
}

export interface SnsIntakeResponse {
  id: string;
  account_id: string;
  answers: Record<string, string>;
  submitted_at: string;
}

export interface SnsPlan {
  id: string;
  account_id: string;
  template_id: string | null; // FK to PptTemplate (nullable)
  field_values: Record<string, string>;
  updated_at: string;
}

export interface SnsMediaAttachment {
  id: string;
  name: string;
  url: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
}

export interface SnsContent {
  id: string;
  account_id: string;
  title: string;
  scheduled_on: string | null; // YYYY-MM-DD
  assignee: string | null;
  status: SnsContentStatus;
  caption: string | null;
  hashtags: string | null;
  media_note: string | null; // Internal production note (hidden on public approval)
  media_attachments?: SnsMediaAttachment[];
  client_comment: string | null; // Feedback from client
  post_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  status_changed_at: string | null;
  created_at: string;
}

/** 광고주 승인 화면에 노출되는 필드만. media_note·성과 수치·토큰은 절대 포함하지 않는다. */
export interface ReviewableSnsContent {
  id: string;
  title: string;
  scheduled_on: string | null;
  caption: string | null;
  hashtags: string | null;
  client_comment: string | null;
  media_attachments?: SnsMediaAttachment[];
}

export function toReviewableSnsContent(c: SnsContent): ReviewableSnsContent {
  return {
    id: c.id,
    title: c.title,
    scheduled_on: c.scheduled_on,
    caption: c.caption,
    hashtags: c.hashtags,
    client_comment: c.client_comment,
    media_attachments: c.media_attachments || [],
  };
}

// Audit Log Types (Backlog 2-6)
export type AuditActorType = "agency" | "company" | "public" | "system";

export interface AuditLogEntry {
  id: string;
  campaign_id?: string | null;
  account_id?: string | null;
  entity_type: "campaign" | "applicant" | "seeding_record" | "sns_account" | "sns_content" | "event";
  entity_id: string;
  action: string;
  actor_type: AuditActorType;
  actor_name?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
  created_at: string;
}

