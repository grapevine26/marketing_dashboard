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
  created_at: string;
}

/** 공개 페이지(지원폼/사전조사/공유 링크)에 내려보내는 최소 정보. 토큰은 절대 포함하지 않는다. */
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

// Shared PPT Template Types (B & C Shared)
export type PptTemplateKind = "event" | "sns";

export interface PptTemplate {
  id: string;
  kind: PptTemplateKind;
  name: string;
  storage_path?: string;
  /** 업로드된 파일(base64). 내장 기본 템플릿(builtin)은 코드에서 매번 생성하므로 비어 있다. */
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
}

export function toReviewableSnsContent(c: SnsContent): ReviewableSnsContent {
  return {
    id: c.id,
    title: c.title,
    scheduled_on: c.scheduled_on,
    caption: c.caption,
    hashtags: c.hashtags,
    client_comment: c.client_comment,
  };
}
