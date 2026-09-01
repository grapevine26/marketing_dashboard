// Subproject A: Seeding Types
export type CampaignType = "shipping" | "visit";
export type CampaignStatus = "draft" | "recruiting" | "selecting" | "seeding" | "reporting" | "completed";
export type ApplicantStatus = "applied" | "selected" | "reserved" | "dropped";
export type ProgressStage =
  | "선정완료"
  | "발송완료"
  | "가이드전달완료"
  | "수령완료"
  | "방문완료"
  | "확정완료"
  | "업로드완료";

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

export interface CustomFormQuestion {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "checkbox";
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
  custom_answers?: Record<string, any>;
  privacy_agreed: boolean;
  secondary_use_agreed: boolean;
  status: ApplicantStatus;
  status_changed_by: "agency" | "company";
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

export interface CampaignReport {
  id: string;
  campaign_id: string;
  title: string;
  snapshot_data?: any;
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
  file_data?: string; // Base64 buffer storage for local engine
  placeholders: string[];
  uploaded_at: string;
}

// Subproject B: Event Types (Belongs to Campaign)
export type EventStatus = "preparing" | "done" | "canceled";
export type EventRsvpStatus = "pending" | "attending" | "not_attending";

export interface MarketingEvent {
  id: string;
  campaign_id: string; // Foreign Key to Campaign
  name: string;
  event_at: string | null; // ISO datetime
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