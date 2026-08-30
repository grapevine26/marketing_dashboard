export type CampaignType = "shipping" | "visit";
export type CampaignStatus = "draft" | "active" | "completed";

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
  type: "text" | "textarea" | "select";
  options?: string[];
  required: boolean;
  placeholder?: string;
}

export interface PreSurveyTemplate {
  id: number;
  questions: PreSurveyQuestion[];
}

export interface PreSurveyResponse {
  id: string;
  campaign_id: string;
  answers: Record<string, string>;
  filled_by: "company" | "agency";
  used_ai_assist: boolean;
  submitted_at: string;
}

export interface CustomQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select";
  required: boolean;
  options?: string[];
}

export interface CampaignFormConfig {
  id: string;
  campaign_id: string;
  intro_text: string;
  custom_questions: CustomQuestion[];
  is_published: boolean;
  updated_at: string;
}

export type ApplicantStatus = "applied" | "selected" | "reserved" | "rejected";

export interface Applicant {
  id: string;
  campaign_id: string;
  name: string;
  sns_link: string;
  nationality: string;
  contact: string;
  shipping_address?: string | null;
  visit_schedule?: string | null;
  visit_party_size?: number | null;
  custom_answers: Record<string, any>;
  privacy_agreed: boolean;
  secondary_use_agreed: boolean;
  status: ApplicantStatus;
  status_changed_by?: "agency" | "company" | null;
  status_changed_at?: string | null;
  applied_at: string;
}

export type ProgressStage =
  | "선정완료"
  | "발송완료"
  | "가이드전달완료"
  | "수령완료"
  | "방문완료"
  | "확정완료"
  | "업로드완료";

export interface SeedingRecord {
  id: string;
  campaign_id: string;
  applicant_id: string;
  shipping_address?: string | null;
  visit_scheduled_at?: string | null;
  visit_party_size?: number | null;
  progress_stage: ProgressStage;
  upload_deadline?: string | null;
  upload_link?: string | null;
  views: number;
  engagement: number;
  notes?: string | null;
  updated_at: string;
}

export interface CustomSection {
  id: string;
  title: string;
  content: string;
}

export interface ReportSnapshot {
  campaign: Campaign;
  applicants: (Applicant & { seeding?: SeedingRecord | null })[];
  metrics: {
    totalApplicants: number;
    selectedCount: number;
    completedUploads: number;
    totalViews: number;
    totalEngagement: number;
  };
}

export interface Report {
  id: string;
  campaign_id: string;
  title: string;
  snapshot_data: ReportSnapshot;
  custom_sections: CustomSection[];
  generated_at: string;
}

// ---------------- Subproject B: Events ----------------
export type EventRsvpStatus = "attending" | "declined" | "pending";

export interface MarketingEvent {
  id: string;
  title: string;
  company_name: string;
  event_date: string; // YYYY-MM-DD or ISO
  event_time: string; // e.g. "15:00 - 18:00"
  location: string;
  capacity: number;
  dress_code?: string;
  guide_text: string;
  rsvp_token: string;
  created_at: string;
}

export interface EventGuest {
  id: string;
  event_id: string;
  name: string;
  sns_link: string;
  contact: string;
  rsvp_status: EventRsvpStatus;
  party_size: number;
  checked_in: boolean;
  checked_in_at?: string | null;
  review_link?: string | null;
  notes?: string | null;
  updated_at: string;
}

// ---------------- Subproject C: SNS Management ----------------
export type SnsPlatform = "instagram" | "youtube" | "tiktok" | "blog";
export type SnsContentType = "feed" | "reels" | "story" | "shorts" | "post";
export type SnsPostStatus = "draft" | "review" | "approved" | "published";

export interface SnsChannel {
  id: string;
  name: string;
  platform: SnsPlatform;
  company_name: string;
  handle: string;
}

export interface SnsPost {
  id: string;
  channel_id: string;
  scheduled_date: string; // YYYY-MM-DD
  scheduled_time?: string; // HH:mm
  content_type: SnsContentType;
  title: string;
  visual_description: string;
  caption_copy: string;
  hashtags: string[];
  status: SnsPostStatus;
  review_token: string;
  client_feedback?: string | null;
  reach?: number;
  engagement?: number;
  published_url?: string | null;
  created_at: string;
}

// ---------------- Subproject D: Unified Calendar Schedule ----------------
export interface UnifiedScheduleItem {
  id: string;
  type: "seeding" | "event" | "sns";
  date: string; // YYYY-MM-DD
  title: string;
  subtitle: string;
  status: string;
  badgeColor: string;
  link: string;
}

export interface DBData {
  campaigns: Campaign[];
  pre_survey_template: PreSurveyTemplate;
  pre_survey_responses: PreSurveyResponse[];
  campaign_form_configs: CampaignFormConfig[];
  applicants: Applicant[];
  seeding_records: SeedingRecord[];
  reports: Report[];
  events: MarketingEvent[];
  event_guests: EventGuest[];
  sns_channels: SnsChannel[];
  sns_posts: SnsPost[];
}