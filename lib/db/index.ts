import fs from "fs/promises";
import path from "path";
import {
  DBData,
  Campaign,
  PreSurveyTemplate,
  PreSurveyResponse,
  CampaignFormConfig,
  Applicant,
  ApplicantStatus,
  SeedingRecord,
  Report,
  CustomSection,
  MarketingEvent,
  EventGuest,
  EventRsvpStatus,
  SnsChannel,
  SnsPost,
  SnsPostStatus,
  UnifiedScheduleItem,
} from "./types";

const DB_PATH = path.join(process.cwd(), "data", "db.json");

let memoryCache: DBData | null = null;

async function readDB(): Promise<DBData> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    const data = JSON.parse(raw) as DBData;
    if (!data.events) data.events = [];
    if (!data.event_guests) data.event_guests = [];
    if (!data.sns_channels) data.sns_channels = [];
    if (!data.sns_posts) data.sns_posts = [];
    memoryCache = data;
    return data;
  } catch (error) {
    if (memoryCache) return memoryCache;
    throw error;
  }
}

async function writeDB(data: DBData): Promise<void> {
  memoryCache = data;
  const tempPath = `${DB_PATH}.tmp.${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tempPath, DB_PATH);
}

// ---------------- Campaigns ----------------
export async function getCampaigns(): Promise<Campaign[]> {
  const db = await readDB();
  return db.campaigns;
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  const db = await readDB();
  return db.campaigns.find((c) => c.id === id) || null;
}

export async function getCampaignByToken(
  type: "pre_survey" | "apply_form" | "applicants_share" | "seeding_sheet_share",
  token: string
): Promise<Campaign | null> {
  const db = await readDB();
  const fieldMap: Record<string, keyof Campaign> = {
    pre_survey: "pre_survey_token",
    apply_form: "apply_form_token",
    applicants_share: "applicants_share_token",
    seeding_sheet_share: "seeding_sheet_share_token",
  };
  const field = fieldMap[type];
  return db.campaigns.find((c) => c[field] === token) || null;
}

export async function createCampaign(params: {
  name: string;
  company_name: string;
  campaign_type: "shipping" | "visit";
}): Promise<Campaign> {
  const db = await readDB();
  const id = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const randomSuffix = () => Math.random().toString(36).slice(2, 10);

  const newCampaign: Campaign = {
    id,
    name: params.name,
    company_name: params.company_name,
    campaign_type: params.campaign_type,
    status: "active",
    pre_survey_token: `ps_${randomSuffix()}`,
    apply_form_token: `apply_${randomSuffix()}`,
    applicants_share_token: `apps_${randomSuffix()}`,
    seeding_sheet_share_token: `sheet_${randomSuffix()}`,
    created_at: new Date().toISOString(),
  };

  db.campaigns.unshift(newCampaign);
  await writeDB(db);
  return newCampaign;
}

// ---------------- Pre-Survey Template & Responses ----------------
export async function getPreSurveyTemplate(): Promise<PreSurveyTemplate> {
  const db = await readDB();
  return db.pre_survey_template;
}

export async function updatePreSurveyTemplate(
  template: PreSurveyTemplate
): Promise<PreSurveyTemplate> {
  const db = await readDB();
  db.pre_survey_template = template;
  await writeDB(db);
  return template;
}

export async function getPreSurveyResponse(
  campaignId: string
): Promise<PreSurveyResponse | null> {
  const db = await readDB();
  return (
    db.pre_survey_responses.find((r) => r.campaign_id === campaignId) || null
  );
}

export async function upsertPreSurveyResponse(params: {
  campaign_id: string;
  answers: Record<string, string>;
  filled_by: "company" | "agency";
  used_ai_assist: boolean;
}): Promise<PreSurveyResponse> {
  const db = await readDB();
  const existingIdx = db.pre_survey_responses.findIndex(
    (r) => r.campaign_id === params.campaign_id
  );

  const responseObj: PreSurveyResponse = {
    id: existingIdx >= 0 ? db.pre_survey_responses[existingIdx].id : `psr_${Date.now()}`,
    campaign_id: params.campaign_id,
    answers: params.answers,
    filled_by: params.filled_by,
    used_ai_assist: params.used_ai_assist,
    submitted_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    db.pre_survey_responses[existingIdx] = responseObj;
  } else {
    db.pre_survey_responses.push(responseObj);
  }

  await writeDB(db);
  return responseObj;
}

// ---------------- Campaign Form Config ----------------
export async function getCampaignFormConfig(
  campaignId: string
): Promise<CampaignFormConfig | null> {
  const db = await readDB();
  return db.campaign_form_configs.find((c) => c.campaign_id === campaignId) || null;
}

export async function upsertCampaignFormConfig(params: {
  campaign_id: string;
  intro_text: string;
  custom_questions: CampaignFormConfig["custom_questions"];
  is_published: boolean;
}): Promise<CampaignFormConfig> {
  const db = await readDB();
  const existingIdx = db.campaign_form_configs.findIndex(
    (c) => c.campaign_id === params.campaign_id
  );

  const configObj: CampaignFormConfig = {
    id: existingIdx >= 0 ? db.campaign_form_configs[existingIdx].id : `cfc_${Date.now()}`,
    campaign_id: params.campaign_id,
    intro_text: params.intro_text,
    custom_questions: params.custom_questions,
    is_published: params.is_published,
    updated_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    db.campaign_form_configs[existingIdx] = configObj;
  } else {
    db.campaign_form_configs.push(configObj);
  }

  await writeDB(db);
  return configObj;
}

// ---------------- Applicants & Selection ----------------
export async function getApplicantsByCampaignId(
  campaignId: string
): Promise<Applicant[]> {
  const db = await readDB();
  return db.applicants.filter((a) => a.campaign_id === campaignId);
}

export async function getApplicantById(id: string): Promise<Applicant | null> {
  const db = await readDB();
  return db.applicants.find((a) => a.id === id) || null;
}

export async function createApplicant(params: {
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
}): Promise<Applicant> {
  const db = await readDB();
  const newApplicant: Applicant = {
    id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    campaign_id: params.campaign_id,
    name: params.name,
    sns_link: params.sns_link,
    nationality: params.nationality,
    contact: params.contact,
    shipping_address: params.shipping_address || null,
    visit_schedule: params.visit_schedule || null,
    visit_party_size: params.visit_party_size || null,
    custom_answers: params.custom_answers || {},
    privacy_agreed: params.privacy_agreed,
    secondary_use_agreed: params.secondary_use_agreed,
    status: "applied",
    status_changed_by: null,
    status_changed_at: null,
    applied_at: new Date().toISOString(),
  };

  db.applicants.push(newApplicant);
  await writeDB(db);
  return newApplicant;
}

export async function updateApplicantStatus(params: {
  applicantId: string;
  status: ApplicantStatus;
  changedBy: "agency" | "company";
}): Promise<Applicant> {
  const db = await readDB();
  const applicant = db.applicants.find((a) => a.id === params.applicantId);
  if (!applicant) {
    throw new Error("Applicant not found");
  }

  applicant.status = params.status;
  applicant.status_changed_by = params.changedBy;
  applicant.status_changed_at = new Date().toISOString();

  if (params.status === "selected") {
    const existingSeeding = db.seeding_records.find(
      (s) => s.applicant_id === applicant.id
    );
    if (!existingSeeding) {
      const campaign = db.campaigns.find((c) => c.id === applicant.campaign_id);
      const isShipping = campaign?.campaign_type === "shipping";
      db.seeding_records.push({
        id: `sr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        campaign_id: applicant.campaign_id,
        applicant_id: applicant.id,
        shipping_address: isShipping ? applicant.shipping_address : null,
        visit_scheduled_at: !isShipping ? applicant.visit_schedule : null,
        visit_party_size: !isShipping ? applicant.visit_party_size : null,
        progress_stage: "선정완료",
        upload_deadline: null,
        upload_link: null,
        views: 0,
        engagement: 0,
        notes: null,
        updated_at: new Date().toISOString(),
      });
    }
  }

  await writeDB(db);
  return applicant;
}

// ---------------- Seeding Records ----------------
export async function getSeedingRecordsByCampaignId(
  campaignId: string
): Promise<SeedingRecord[]> {
  const db = await readDB();
  return db.seeding_records.filter((s) => s.campaign_id === campaignId);
}

export async function updateSeedingRecord(
  id: string,
  patch: Partial<SeedingRecord>
): Promise<SeedingRecord> {
  const db = await readDB();
  const record = db.seeding_records.find((s) => s.id === id);
  if (!record) {
    throw new Error("Seeding record not found");
  }

  Object.assign(record, patch, { updated_at: new Date().toISOString() });
  await writeDB(db);
  return record;
}

// ---------------- Reports ----------------
export async function getReportsByCampaignId(
  campaignId: string
): Promise<Report[]> {
  const db = await readDB();
  return db.reports.filter((r) => r.campaign_id === campaignId);
}

export async function getReportById(id: string): Promise<Report | null> {
  const db = await readDB();
  return db.reports.find((r) => r.id === id) || null;
}

export async function createReport(campaignId: string, title?: string): Promise<Report> {
  const db = await readDB();
  const campaign = db.campaigns.find((c) => c.id === campaignId);
  if (!campaign) throw new Error("Campaign not found");

  const applicants = db.applicants.filter((a) => a.campaign_id === campaignId);
  const seedingRecords = db.seeding_records.filter(
    (s) => s.campaign_id === campaignId
  );

  const applicantsWithSeeding = applicants.map((app) => {
    const seeding = seedingRecords.find((s) => s.applicant_id === app.id) || null;
    return { ...app, seeding };
  });

  const selectedApplicants = applicantsWithSeeding.filter(
    (a) => a.status === "selected"
  );
  const completedUploads = selectedApplicants.filter(
    (a) => a.seeding?.progress_stage === "업로드완료" || Boolean(a.seeding?.upload_link)
  ).length;

  const totalViews = selectedApplicants.reduce(
    (sum, a) => sum + (a.seeding?.views || 0),
    0
  );
  const totalEngagement = selectedApplicants.reduce(
    (sum, a) => sum + (a.seeding?.engagement || 0),
    0
  );

  const report: Report = {
    id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    campaign_id: campaignId,
    title: title || `${campaign.name} 결과보고서`,
    snapshot_data: {
      campaign,
      applicants: applicantsWithSeeding,
      metrics: {
        totalApplicants: applicants.length,
        selectedCount: selectedApplicants.length,
        completedUploads,
        totalViews,
        totalEngagement,
      },
    },
    custom_sections: [
      {
        id: `sec_${Date.now()}_1`,
        title: "캠페인 총평 및 하이라이트",
        content:
          "이번 시딩 캠페인은 목표 대비 높은 참여율과 양질의 오가닉 뷰티 리뷰를 확보하였습니다.",
      },
    ],
    generated_at: new Date().toISOString(),
  };

  db.reports.unshift(report);
  await writeDB(db);
  return report;
}

export async function updateReportCustomSections(
  reportId: string,
  customSections: CustomSection[]
): Promise<Report> {
  const db = await readDB();
  const report = db.reports.find((r) => r.id === reportId);
  if (!report) throw new Error("Report not found");

  report.custom_sections = customSections;
  await writeDB(db);
  return report;
}

// ---------------- Subproject B: Events ----------------
export async function getEvents(): Promise<MarketingEvent[]> {
  const db = await readDB();
  return db.events || [];
}

export async function getEventById(id: string): Promise<MarketingEvent | null> {
  const db = await readDB();
  return db.events.find((e) => e.id === id) || null;
}

export async function getEventByToken(token: string): Promise<MarketingEvent | null> {
  const db = await readDB();
  return db.events.find((e) => e.rsvp_token === token) || null;
}

export async function createEvent(params: {
  title: string;
  company_name: string;
  event_date: string;
  event_time: string;
  location: string;
  capacity: number;
  dress_code?: string;
  guide_text: string;
}): Promise<MarketingEvent> {
  const db = await readDB();
  const newEvent: MarketingEvent = {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: params.title,
    company_name: params.company_name,
    event_date: params.event_date,
    event_time: params.event_time,
    location: params.location,
    capacity: params.capacity,
    dress_code: params.dress_code || "자율 복장 (스마트 캐주얼 권장)",
    guide_text: params.guide_text,
    rsvp_token: `rsvp_${Math.random().toString(36).slice(2, 10)}`,
    created_at: new Date().toISOString(),
  };

  db.events.unshift(newEvent);
  await writeDB(db);
  return newEvent;
}

export async function getEventGuests(eventId: string): Promise<EventGuest[]> {
  const db = await readDB();
  return db.event_guests.filter((g) => g.event_id === eventId);
}

export async function addOrUpdateEventGuest(params: {
  eventId: string;
  name: string;
  sns_link: string;
  contact: string;
  rsvp_status: EventRsvpStatus;
  party_size: number;
  notes?: string;
}): Promise<EventGuest> {
  const db = await readDB();
  const existingIdx = db.event_guests.findIndex(
    (g) => g.event_id === params.eventId && g.contact === params.contact
  );

  const guest: EventGuest = {
    id: existingIdx >= 0 ? db.event_guests[existingIdx].id : `gst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    event_id: params.eventId,
    name: params.name,
    sns_link: params.sns_link,
    contact: params.contact,
    rsvp_status: params.rsvp_status,
    party_size: params.party_size,
    checked_in: existingIdx >= 0 ? db.event_guests[existingIdx].checked_in : false,
    checked_in_at: existingIdx >= 0 ? db.event_guests[existingIdx].checked_in_at : null,
    review_link: existingIdx >= 0 ? db.event_guests[existingIdx].review_link : null,
    notes: params.notes || null,
    updated_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    db.event_guests[existingIdx] = guest;
  } else {
    db.event_guests.push(guest);
  }

  await writeDB(db);
  return guest;
}

export async function toggleGuestCheckin(guestId: string, checkedIn: boolean): Promise<EventGuest> {
  const db = await readDB();
  const guest = db.event_guests.find((g) => g.id === guestId);
  if (!guest) throw new Error("Guest not found");

  guest.checked_in = checkedIn;
  guest.checked_in_at = checkedIn ? new Date().toISOString() : null;
  guest.updated_at = new Date().toISOString();

  await writeDB(db);
  return guest;
}

export async function updateGuestReviewLink(guestId: string, reviewLink: string): Promise<EventGuest> {
  const db = await readDB();
  const guest = db.event_guests.find((g) => g.id === guestId);
  if (!guest) throw new Error("Guest not found");

  guest.review_link = reviewLink;
  guest.updated_at = new Date().toISOString();

  await writeDB(db);
  return guest;
}

// ---------------- Subproject C: SNS Management ----------------
export async function getSnsChannels(): Promise<SnsChannel[]> {
  const db = await readDB();
  return db.sns_channels || [];
}

export async function createSnsChannel(params: {
  name: string;
  platform: SnsChannel["platform"];
  company_name: string;
  handle: string;
}): Promise<SnsChannel> {
  const db = await readDB();
  const newCh: SnsChannel = {
    id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...params,
  };
  db.sns_channels.push(newCh);
  await writeDB(db);
  return newCh;
}

export async function getSnsPosts(channelId?: string): Promise<SnsPost[]> {
  const db = await readDB();
  if (channelId) {
    return db.sns_posts.filter((p) => p.channel_id === channelId);
  }
  return db.sns_posts || [];
}

export async function getSnsPostByToken(token: string): Promise<SnsPost | null> {
  const db = await readDB();
  return db.sns_posts.find((p) => p.review_token === token) || null;
}

export async function createSnsPost(params: {
  channel_id: string;
  scheduled_date: string;
  scheduled_time?: string;
  content_type: SnsPost["content_type"];
  title: string;
  visual_description: string;
  caption_copy: string;
  hashtags: string[];
}): Promise<SnsPost> {
  const db = await readDB();
  const newPost: SnsPost = {
    id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    channel_id: params.channel_id,
    scheduled_date: params.scheduled_date,
    scheduled_time: params.scheduled_time || "18:00",
    content_type: params.content_type,
    title: params.title,
    visual_description: params.visual_description,
    caption_copy: params.caption_copy,
    hashtags: params.hashtags,
    status: "draft",
    review_token: `rev_${Math.random().toString(36).slice(2, 10)}`,
    client_feedback: null,
    reach: 0,
    engagement: 0,
    published_url: null,
    created_at: new Date().toISOString(),
  };

  db.sns_posts.unshift(newPost);
  await writeDB(db);
  return newPost;
}

export async function updateSnsPostStatus(
  postId: string,
  status: SnsPostStatus,
  clientFeedback?: string | null
): Promise<SnsPost> {
  const db = await readDB();
  const post = db.sns_posts.find((p) => p.id === postId);
  if (!post) throw new Error("Post not found");

  post.status = status;
  if (clientFeedback !== undefined) {
    post.client_feedback = clientFeedback;
  }
  await writeDB(db);
  return post;
}

export async function updateSnsPost(
  postId: string,
  patch: Partial<SnsPost>
): Promise<SnsPost> {
  const db = await readDB();
  const post = db.sns_posts.find((p) => p.id === postId);
  if (!post) throw new Error("Post not found");

  Object.assign(post, patch);
  await writeDB(db);
  return post;
}

// ---------------- Subproject D: Unified Calendar Aggregator ----------------
export async function getUnifiedSchedule(): Promise<UnifiedScheduleItem[]> {
  const db = await readDB();
  const items: UnifiedScheduleItem[] = [];

  // 1. Seeding deadlines
  db.seeding_records.forEach((sr) => {
    if (sr.upload_deadline) {
      const camp = db.campaigns.find((c) => c.id === sr.campaign_id);
      const app = db.applicants.find((a) => a.id === sr.applicant_id);
      items.push({
        id: `sched_seed_${sr.id}`,
        type: "seeding",
        date: sr.upload_deadline,
        title: `[시딩 마감] ${app?.name || "인플루언서"} (${camp?.company_name || ""})`,
        subtitle: `${camp?.name || "캠페인"} • ${sr.progress_stage}`,
        status: sr.progress_stage,
        badgeColor: "blue",
        link: `/campaigns/${sr.campaign_id}/seeding-sheet`,
      });
    }
  });

  // 2. Events
  db.events.forEach((ev) => {
    const guests = db.event_guests.filter((g) => g.event_id === ev.id);
    const attendingCount = guests.filter((g) => g.rsvp_status === "attending").length;
    items.push({
      id: `sched_ev_${ev.id}`,
      type: "event",
      date: ev.event_date,
      title: `[오프라인 행사] ${ev.title}`,
      subtitle: `${ev.location} (${ev.event_time}) • 참석 ${attendingCount}/${ev.capacity}명`,
      status: "행사예정",
      badgeColor: "purple",
      link: `/events/${ev.id}`,
    });
  });

  // 3. SNS posts
  db.sns_posts.forEach((post) => {
    const ch = db.sns_channels.find((c) => c.id === post.channel_id);
    items.push({
      id: `sched_sns_${post.id}`,
      type: "sns",
      date: post.scheduled_date,
      title: `[SNS 발행] ${post.title}`,
      subtitle: `${ch?.company_name || ""} (@${ch?.handle || ""}) • ${post.status}`,
      status: post.status,
      badgeColor: "emerald",
      link: `/sns`,
    });
  });

  // Sort by date ascending
  items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return items;
}