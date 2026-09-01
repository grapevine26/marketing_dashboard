import fs from "fs";
import path from "path";
import {
  Campaign,
  PreSurveyTemplate,
  PreSurveyResponse,
  CampaignFormConfig,
  Applicant,
  SeedingRecord,
  CampaignReport,
  PptTemplate,
  MarketingEvent,
  EventInvitee,
  EventChecklistItem,
  EventPlan,
  SnsAccount,
  SnsIntakeTemplate,
  SnsIntakeResponse,
  SnsPlan,
  SnsContent,
} from "./types";
import { generateDefaultPptBuffer, extractPlaceholders } from "../ppt/engine";

import os from "os";

// Vercel serverless environment is read-only except /tmp
function getDbFilePath(): string {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    return path.join(os.tmpdir(), "marketing_db.json");
  }
  return path.join(process.cwd(), ".data", "db.json");
}

const DB_PATH = getDbFilePath();

// In-memory cache for ultra-fast and resilient serverless execution
declare global {
  // eslint-disable-next-line no-var
  var _marketingDbCache: DatabaseSchema | undefined;
}

interface DatabaseSchema {
  campaigns: Campaign[];
  pre_survey_template: PreSurveyTemplate;
  pre_survey_responses: PreSurveyResponse[];
  form_configs: CampaignFormConfig[];
  applicants: Applicant[];
  seeding_records: SeedingRecord[];
  reports: CampaignReport[];
  ppt_templates: PptTemplate[];
  events: MarketingEvent[];
  event_invitees: EventInvitee[];
  event_checklist_items: EventChecklistItem[];
  event_plans: EventPlan[];
  sns_accounts: SnsAccount[];
  sns_intake_template: SnsIntakeTemplate;
  sns_intake_responses: SnsIntakeResponse[];
  sns_plans: SnsPlan[];
  sns_contents: SnsContent[];
}

function ensureDataDir(filePath: string) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn("Could not create data directory, using in-memory mode:", err);
  }
}
async function getInitialData(): Promise<DatabaseSchema> {
  let eventPptBuf: Buffer = Buffer.from("");
  let eventPhs = ["브랜드명", "행사명", "행사일시", "행사장소", "행사개요", "프로그램"];
  let snsPptBuf: Buffer = Buffer.from("");
  let snsPhs = ["브랜드명", "채널명", "계약기간", "운영목표", "타겟오디언스", "콘텐츠방향성", "월별계획"];

  try {
    const rawEvent = await generateDefaultPptBuffer("event");
    eventPptBuf = Buffer.from(rawEvent);
    eventPhs = await extractPlaceholders(eventPptBuf);
    const rawSns = await generateDefaultPptBuffer("sns");
    snsPptBuf = Buffer.from(rawSns);
    snsPhs = await extractPlaceholders(snsPptBuf);
  } catch (err) {
    console.warn("Could not generate initial PPT buffers in serverless env:", err);
  }

  const sampleCampaignId = "c1a2b3c4-0001-4000-8000-000000000001";
  const sampleEventId = "e1a2b3c4-0001-4000-8000-000000000001";
  const sampleSnsAccountId = "s1a2b3c4-0001-4000-8000-000000000001";
  const eventTemplateId = "t1a2b3c4-0001-4000-8000-000000000001";
  const snsTemplateId = "t1a2b3c4-0002-4000-8000-000000000002";

  return {
    campaigns: [
      {
        id: sampleCampaignId,
        name: "글로우랩 2026 하이드라 앰플 런칭 캠페인",
        company_name: "글로우랩 코스메틱",
        campaign_type: "shipping",
        status: "recruiting",
        pre_survey_token: "ps_tok_demo_12345",
        apply_form_token: "apply_tok_demo_12345",
        applicants_share_token: "app_share_tok_12345",
        seeding_sheet_share_token: "seed_share_tok_12345",
        created_at: new Date().toISOString(),
      },
    ],
    pre_survey_template: {
      id: 1,
      questions: [
        { id: "q1", question: "브랜드 및 제품의 핵심 셀링 포인트(USP)는 무엇인가요?", required: true, placeholder: "예: 3중 히알루론산 100시간 보습" },
        { id: "q2", question: "희망하는 인플루언서의 주요 연령대 및 카테고리는 어떻게 되나요?", required: true, placeholder: "예: 2030 뷰티/스킨케어 전문 크리에이터" },
        { id: "q3", question: "콘텐츠 내 반드시 포함되어야 할 필수 키워드/해시태그가 있나요?", required: true, placeholder: "예: #글로우랩 #하이드라앰플 #속건조해결" },
        { id: "q4", question: "주의해야 할 경쟁사 언급 금지 또는 가이드라인이 있나요?", required: false, placeholder: "예: 타사 제품과의 직접적인 비교 지양" },
      ],
    },
    pre_survey_responses: [
      {
        id: "resp_001",
        campaign_id: sampleCampaignId,
        answers: {
          q1: "특허받은 3중 마이크로 히알루론산으로 끈적임 없이 100시간 동안 속보습을 꽉 채워주는 비건 수분 앰플",
          q2: "20대~30대 여성 타깃, 민감성 피부 및 스킨케어 루틴을 다루는 인스타그램/유튜브 크리에이터",
          q3: "#글로우랩 #수분앰플추천 #올리브영추천템 #속건조해결",
          q4: "의학적 효능 표방 문구(치료, 완치 등)는 엄격히 금지합니다.",
        },
        used_ai_assist: true,
        submitted_at: new Date().toISOString(),
      },
    ],
    form_configs: [
      {
        id: "fc_001",
        campaign_id: sampleCampaignId,
        intro_text: "글로우랩 2026 하이드라 앰플 런칭 기념 인플루언서 체험단 모집! 솔직하고 감각적인 리뷰를 남겨주실 크리에이터 여러분을 모십니다.",
        custom_questions: [
          { id: "cq_1", label: "주요 피부 타입 (건성/지성/복합성/민감성)", type: "text", required: true },
          { id: "cq_2", label: "월 평균 뷰티 콘텐츠 업로드 빈도", type: "text", required: false },
        ],
        is_published: true,
        created_at: new Date().toISOString(),
      },
    ],
    applicants: [
      {
        id: "app_001",
        campaign_id: sampleCampaignId,
        name: "이지은 (뷰티제이)",
        sns_link: "https://instagram.com/beauty_jieun_official",
        nationality: "대한민국",
        contact: "010-3849-2819",
        shipping_address: "서울특별시 강남구 테헤란로 123 401호",
        privacy_agreed: true,
        secondary_use_agreed: true,
        status: "selected",
        status_changed_by: "agency",
        applied_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      },
      {
        id: "app_002",
        campaign_id: sampleCampaignId,
        name: "김수현",
        sns_link: "https://instagram.com/suhyun_glow",
        nationality: "대한민국",
        contact: "010-8274-1928",
        shipping_address: "부산광역시 해운대구 센텀중앙로 45 102동",
        privacy_agreed: true,
        secondary_use_agreed: true,
        status: "selected",
        status_changed_by: "agency",
        applied_at: new Date(Date.now() - 3600000 * 18).toISOString(),
      },
      {
        id: "app_003",
        campaign_id: sampleCampaignId,
        name: "박민우",
        sns_link: "https://instagram.com/minwoo_skin",
        nationality: "대한민국",
        contact: "010-9988-7766",
        shipping_address: "경기도 성남시 분당구 판교역로 100",
        privacy_agreed: true,
        secondary_use_agreed: false,
        status: "applied",
        status_changed_by: "agency",
        applied_at: new Date().toISOString(),
      },
    ],
    seeding_records: [
      {
        id: "seed_001",
        campaign_id: sampleCampaignId,
        applicant_id: "app_001",
        progress_stage: "가이드전달완료",
        upload_deadline: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
        upload_link: null,
        views: 0,
        engagement: 0,
        notes: "배송 송장 전달 완료",
        created_at: new Date().toISOString(),
      },
      {
        id: "seed_002",
        campaign_id: sampleCampaignId,
        applicant_id: "app_002",
        progress_stage: "선정완료",
        upload_deadline: new Date(Date.now() + 86400000 * 5).toISOString().split("T")[0],
        upload_link: null,
        views: 0,
        engagement: 0,
        notes: null,
        created_at: new Date().toISOString(),
      },
    ],
    reports: [
      {
        id: "rep_001",
        campaign_id: sampleCampaignId,
        title: "글로우랩 2026 하이드라 앰플 런칭 성과 결과보고서",
        custom_sections: [
          {
            id: "sec_1",
            title: "종합 성과 요약",
            content: "목표 인원 대비 120% 초과 지원 달성, 상위 뷰티 크리에이터 20인 최종 선정 및 가이드 배포 완료.",
          },
        ],
        created_at: new Date().toISOString(),
      },
    ],
    ppt_templates: [
      {
        id: eventTemplateId,
        kind: "event",
        name: "기본 인플루언서 행사 운영안 템플릿",
        file_data: eventPptBuf.toString("base64"),
        placeholders: eventPhs,
        uploaded_at: new Date().toISOString(),
      },
      {
        id: snsTemplateId,
        kind: "sns",
        name: "기본 SNS 공식 채널 운영 제안서 템플릿",
        file_data: snsPptBuf.toString("base64"),
        placeholders: snsPhs,
        uploaded_at: new Date().toISOString(),
      },
    ],
    events: [
      {
        id: sampleEventId,
        campaign_id: sampleCampaignId,
        name: "글로우랩 런칭 기념 VIP 프라이빗 뷰티 파티",
        event_at: new Date(Date.now() + 86400000 * 3).toISOString(),
        venue: "서울 성동구 성수이로 88 보테가 성수 2F",
        memo: "신제품 앰플 테이스팅 바 및 포토존 운영",
        status: "preparing",
        created_at: new Date().toISOString(),
      },
    ],
    event_invitees: [
      {
        id: "inv_001",
        event_id: sampleEventId,
        applicant_id: "app_001",
        name: "이지은 (뷰티제이)",
        sns_url: "https://instagram.com/beauty_jieun_official",
        contact: "010-3849-2819",
        rsvp_status: "attending",
        attended: false,
        memo: "동반 1인 참석 예정",
        created_at: new Date().toISOString(),
      },
      {
        id: "inv_002",
        event_id: sampleEventId,
        applicant_id: "app_002",
        name: "김수현",
        sns_url: "https://instagram.com/suhyun_glow",
        contact: "010-8274-1928",
        rsvp_status: "pending",
        attended: false,
        memo: "DM 확인 후 연락 대기",
        created_at: new Date().toISOString(),
      },
    ],
    event_checklist_items: [
      {
        id: "chk_001",
        event_id: sampleEventId,
        label: "VIP 웰컴 기프트 키트 30세트 패키징",
        due_date: new Date(Date.now() + 86400000 * 1).toISOString().split("T")[0],
        assignee: "박기획 매니저",
        done: false,
        sort_order: 1,
        created_at: new Date().toISOString(),
      },
      {
        id: "chk_002",
        event_id: sampleEventId,
        label: "성수 대관 장소 음향 및 조명 사전 리허설",
        due_date: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
        assignee: "이연출 디렉터",
        done: false,
        sort_order: 2,
        created_at: new Date().toISOString(),
      },
    ],
    event_plans: [
      {
        id: "ep_001",
        event_id: sampleEventId,
        template_id: eventTemplateId,
        field_values: {
          브랜드명: "글로우랩 코스메틱",
          행사명: "2026 하이드라 앰플 런칭 VIP 뷰티 나잇",
          행사일시: "2026년 9월 15일(화) 18:00 - 21:00",
          행사장소: "서울 성동구 성수이로 88 보테가 성수 2F",
          행사개요: "글로우랩의 신제품 100시간 수분 앰플 출시를 기념하여 최상위 뷰티 인플루언서 30인을 초청하는 프라이빗 런칭 파티",
          프로그램: "18:00 리셉션 & 웰컴 드링크\n18:30 브랜드 스토리 프레젠테이션 & 제품 시연\n19:15 인플루언서 네트워킹 & 럭키드로우",
        },
        updated_at: new Date().toISOString(),
      },
    ],
    sns_accounts: [
      {
        id: sampleSnsAccountId,
        company_name: "글로우랩",
        platform: "instagram",
        handle: "glowlab_official",
        starts_on: "2026-09-01",
        ends_on: "2026-11-30",
        status: "active",
        intake_token: "sns_intake_tok_12345",
        approval_token: "sns_appr_tok_12345",
        created_at: new Date().toISOString(),
      },
    ],
    sns_intake_template: {
      id: 1,
      questions: [
        { id: "sq1", question: "브랜드 톤앤매너와 핵심 고객 페르소나는 어떻게 되나요?", required: true, placeholder: "예: 20대 대학생/사회초년생, 친근하고 트렌디한 무드" },
        { id: "sq2", question: "월간 중점 홍보 상품 및 프로모션 일정이 있나요?", required: true, placeholder: "예: 9월 셋째주 올영세일 프로모션 집중" },
        { id: "sq3", question: "피드 내 로고 사용 규정 및 디자인 필수 가이드라인이 있나요?", required: false, placeholder: "예: 브랜드 컬러(#3B82F6) 포인트 10% 이상 적용" },
      ],
    },
    sns_intake_responses: [
      {
        id: "sir_001",
        account_id: sampleSnsAccountId,
        answers: {
          sq1: "2030 사회초년생 타깃, 힙하고 감각적인 클린 뷰티 무드",
          sq2: "하이드라 앰플 런칭 기념 1+1 기획세트 프로모션",
          sq3: "심플한 타이포그래피와 자연광 텍스처 중심 연출",
        },
        submitted_at: new Date().toISOString(),
      },
    ],
    sns_plans: [
      {
        id: "sp_001",
        account_id: sampleSnsAccountId,
        template_id: snsTemplateId,
        field_values: {
          브랜드명: "글로우랩",
          채널명: "인스타그램 공식 채널 (@glowlab_official)",
          계약기간: "2026.09.01 ~ 2026.11.30 (3개월)",
          운영목표: "오가닉 팔로워 30% 증대 및 런칭 신제품 바이럴 확산",
          타겟오디언스: "스킨케어에 관심이 많은 20-34 여성 타깃",
          콘텐츠방향성: "릴스 중심의 고효율 제형 비포애프터 & 감성적인 피드 큐레이션",
          월별계획: "9월: 런칭 바이럴 및 팔로워 유입 이벤트\n10월: 실사용 후기 중심 릴스 집중 발행\n11월: 홀리데이 에디션 선공개",
        },
        updated_at: new Date().toISOString(),
      },
    ],
    sns_contents: [
      {
        id: "sct_001",
        account_id: sampleSnsAccountId,
        title: "3초 속건조 탈출! 하이드라 세럼 제형 릴스",
        scheduled_on: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
        assignee: "김콘텐츠 매니저",
        status: "pending_approval",
        caption: "바르는 순간 물방울이 톡!💧 100시간 보습 지속력의 비밀을 지금 확인해보세요.",
        hashtags: "#글로우랩 #하이드라앰플 #수분폭탄 #스킨케어추천",
        media_note: "유리볼 롤링 클로즈업 4K 촬영본 적용 완료",
        client_comment: null,
        post_url: null,
        view_count: null,
        like_count: null,
        comment_count: null,
        status_changed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
      {
        id: "sct_002",
        account_id: sampleSnsAccountId,
        title: "올리브영 단독 기획세트 언박싱 스토리 & 피드",
        scheduled_on: new Date(Date.now() + 86400000 * 4).toISOString().split("T")[0],
        assignee: "김콘텐츠 매니저",
        status: "planning",
        caption: "오직 올리브영에서만 만날 수 있는 1+1 리미티드 패키지 선착순 공개!",
        hashtags: "#글로우랩 #올영추천 #올영세일",
        media_note: "패키지 개봉 스톱모션 촬영 예정",
        client_comment: null,
        post_url: null,
        view_count: null,
        like_count: null,
        comment_count: null,
        status_changed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
      {
        id: "sct_003",
        account_id: sampleSnsAccountId,
        title: "민감 피부를 위한 비건 보습 루틴 카드뉴스",
        scheduled_on: new Date(Date.now() - 86400000 * 2).toISOString().split("T")[0],
        assignee: "이디자인 매니저",
        status: "posted",
        caption: "환절기 피부 장벽 무너졌을 때 꼭 지켜야 할 3단계 보습 팁!",
        hashtags: "#글로우랩 #비건화장품 #스킨케어팁",
        media_note: "카드뉴스 6장 제작 완료",
        client_comment: null,
        post_url: "https://instagram.com/p/C_demo_post_1",
        view_count: 14200,
        like_count: 890,
        comment_count: 64,
        status_changed_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
    ],
  };
}
export async function readDb(): Promise<DatabaseSchema> {
  if (globalThis._marketingDbCache) {
    return globalThis._marketingDbCache;
  }

  const filePath = getDbFilePath();
  ensureDataDir(filePath);

  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as DatabaseSchema;
      globalThis._marketingDbCache = parsed;
      return parsed;
    }
  } catch (err) {
    console.warn("Could not read DB file, fallback to initial data:", err);
  }

  const initial = await getInitialData();
  globalThis._marketingDbCache = initial;

  try {
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not write initial DB file (running in-memory):", err);
  }

  return initial;
}

export async function writeDb(data: DatabaseSchema): Promise<void> {
  globalThis._marketingDbCache = data;
  const filePath = getDbFilePath();
  ensureDataDir(filePath);

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not persist DB to disk (running in-memory):", err);
  }
}

// 1. Campaigns & Seeding APIs (Subproject A)
export async function getCampaigns(): Promise<Campaign[]> {
  const db = await readDb();
  return db.campaigns;
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  const db = await readDb();
  return db.campaigns.find((c) => c.id === id) || null;
}

export async function getCampaignByToken(
  type: "pre_survey" | "apply_form" | "applicants_share" | "seeding_sheet_share",
  token: string
): Promise<Campaign | null> {
  const db = await readDb();
  const tokenKey = `${type}_token` as keyof Campaign;
  return db.campaigns.find((c) => c[tokenKey] === token) || null;
}

export async function createCampaign(data: {
  name: string;
  company_name: string;
  campaign_type: "shipping" | "visit";
}): Promise<Campaign> {
  const db = await readDb();
  const newCamp: Campaign = {
    id: crypto.randomUUID(),
    name: data.name,
    company_name: data.company_name,
    campaign_type: data.campaign_type,
    status: "recruiting",
    pre_survey_token: `ps_${crypto.randomUUID().slice(0, 12)}`,
    apply_form_token: `apply_${crypto.randomUUID().slice(0, 12)}`,
    applicants_share_token: `app_share_${crypto.randomUUID().slice(0, 12)}`,
    seeding_sheet_share_token: `seed_share_${crypto.randomUUID().slice(0, 12)}`,
    created_at: new Date().toISOString(),
  };

  db.campaigns.unshift(newCamp);

  // Auto-initialize default form config
  db.form_configs.push({
    id: crypto.randomUUID(),
    campaign_id: newCamp.id,
    intro_text: `${data.company_name}의 ${data.name} ${
      data.campaign_type === "shipping" ? "제품배송형" : "현장방문형"
    } 인플루언서 체험단을 모집합니다 ✨\n솔직하고 감각적인 리뷰 콘텐츠를 함께 만들어갈 크리에이터 분들의 많은 지원 바랍니다.`,
    custom_questions: [],
    is_published: true,
    created_at: new Date().toISOString(),
  });

  await writeDb(db);
  return newCamp;
}

export async function getPreSurveyTemplate(): Promise<PreSurveyTemplate> {
  const db = await readDb();
  return db.pre_survey_template;
}

export async function updatePreSurveyTemplate(
  questions: PreSurveyTemplate["questions"]
): Promise<PreSurveyTemplate> {
  const db = await readDb();
  db.pre_survey_template.questions = questions;
  await writeDb(db);
  return db.pre_survey_template;
}

export async function getPreSurveyResponse(campaignId: string): Promise<PreSurveyResponse | null> {
  const db = await readDb();
  return db.pre_survey_responses.find((r) => r.campaign_id === campaignId) || null;
}

export async function savePreSurveyResponse(data: {
  campaign_id: string;
  answers: Record<string, string>;
  used_ai_assist: boolean;
}): Promise<PreSurveyResponse> {
  const db = await readDb();
  const existingIdx = db.pre_survey_responses.findIndex((r) => r.campaign_id === data.campaign_id);
  const record: PreSurveyResponse = {
    id: existingIdx >= 0 ? db.pre_survey_responses[existingIdx].id : crypto.randomUUID(),
    campaign_id: data.campaign_id,
    answers: data.answers,
    used_ai_assist: data.used_ai_assist,
    submitted_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    db.pre_survey_responses[existingIdx] = record;
  } else {
    db.pre_survey_responses.push(record);
  }
  await writeDb(db);
  return record;
}

export async function getFormConfig(campaignId: string): Promise<CampaignFormConfig | null> {
  const db = await readDb();
  return db.form_configs.find((f) => f.campaign_id === campaignId) || null;
}

export async function saveFormConfig(data: {
  campaign_id: string;
  intro_text: string;
  custom_questions: CampaignFormConfig["custom_questions"];
  is_published: boolean;
}): Promise<CampaignFormConfig> {
  const db = await readDb();
  const existingIdx = db.form_configs.findIndex((f) => f.campaign_id === data.campaign_id);
  const record: CampaignFormConfig = {
    id: existingIdx >= 0 ? db.form_configs[existingIdx].id : crypto.randomUUID(),
    campaign_id: data.campaign_id,
    intro_text: data.intro_text,
    custom_questions: data.custom_questions,
    is_published: data.is_published,
    created_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    db.form_configs[existingIdx] = record;
  } else {
    db.form_configs.push(record);
  }
  await writeDb(db);
  return record;
}

export async function getApplicantsByCampaignId(campaignId: string): Promise<Applicant[]> {
  const db = await readDb();
  return db.applicants.filter((a) => a.campaign_id === campaignId);
}

export async function createApplicant(
  data: Omit<Applicant, "id" | "applied_at" | "status" | "status_changed_by">
): Promise<Applicant> {
  const db = await readDb();
  const newApp: Applicant = {
    ...data,
    id: crypto.randomUUID(),
    status: "applied",
    status_changed_by: "agency",
    applied_at: new Date().toISOString(),
  };
  db.applicants.push(newApp);
  await writeDb(db);
  return newApp;
}

export async function updateApplicantStatus(
  applicantId: string,
  status: Applicant["status"],
  changedBy: "agency" | "company",
  campaignId: string
): Promise<Applicant | null> {
  const db = await readDb();
  const app = db.applicants.find((a) => a.id === applicantId);
  if (!app) return null;

  app.status = status;
  app.status_changed_by = changedBy;

  if (status === "selected") {
    const existingSeeding = db.seeding_records.find((s) => s.applicant_id === applicantId);
    if (!existingSeeding) {
      db.seeding_records.push({
        id: crypto.randomUUID(),
        campaign_id: campaignId,
        applicant_id: applicantId,
        progress_stage: "선정완료",
        upload_deadline: null,
        upload_link: null,
        views: 0,
        engagement: 0,
        notes: null,
        created_at: new Date().toISOString(),
      });
    }
  }

  await writeDb(db);
  return app;
}

export async function getSeedingRecordsByCampaignId(campaignId: string): Promise<SeedingRecord[]> {
  const db = await readDb();
  return db.seeding_records.filter((s) => s.campaign_id === campaignId);
}

export async function getAllSeedingRecords(): Promise<SeedingRecord[]> {
  const db = await readDb();
  return db.seeding_records;
}

export async function updateSeedingRecord(
  seedingId: string,
  patch: Partial<SeedingRecord>
): Promise<SeedingRecord | null> {
  const db = await readDb();
  const record = db.seeding_records.find((s) => s.id === seedingId);
  if (!record) return null;

  Object.assign(record, patch);
  await writeDb(db);
  return record;
}

export async function getReportsByCampaignId(campaignId: string): Promise<CampaignReport[]> {
  const db = await readDb();
  return db.reports.filter((r) => r.campaign_id === campaignId);
}

export async function getReportById(reportId: string): Promise<CampaignReport | null> {
  const db = await readDb();
  return db.reports.find((r) => r.id === reportId) || null;
}

export async function saveReportSections(
  reportId: string,
  customSections: CampaignReport["custom_sections"]
): Promise<CampaignReport | null> {
  const db = await readDb();
  const report = db.reports.find((r) => r.id === reportId);
  if (!report) return null;

  report.custom_sections = customSections;
  await writeDb(db);
  return report;
}
// 2. Shared PPT Templates (Subprojects B & C)
export async function getPptTemplates(kind?: "event" | "sns"): Promise<PptTemplate[]> {
  const db = await readDb();
  if (kind) {
    return db.ppt_templates.filter((t) => t.kind === kind);
  }
  return db.ppt_templates;
}

export async function getPptTemplateById(id: string): Promise<PptTemplate | null> {
  const db = await readDb();
  return db.ppt_templates.find((t) => t.id === id) || null;
}

export async function savePptTemplate(data: {
  kind: "event" | "sns";
  name: string;
  file_buffer: Buffer;
  placeholders: string[];
}): Promise<PptTemplate> {
  const db = await readDb();
  const newTemplate: PptTemplate = {
    id: crypto.randomUUID(),
    kind: data.kind,
    name: data.name,
    file_data: data.file_buffer.toString("base64"),
    placeholders: data.placeholders,
    uploaded_at: new Date().toISOString(),
  };
  db.ppt_templates.push(newTemplate);
  await writeDb(db);
  return newTemplate;
}

export async function deletePptTemplate(id: string): Promise<boolean> {
  const db = await readDb();
  const idx = db.ppt_templates.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  db.ppt_templates.splice(idx, 1);
  await writeDb(db);
  return true;
}

// 3. Events (Subproject B - Belongs to Campaign)
export async function getEventsByCampaignId(campaignId: string): Promise<MarketingEvent[]> {
  const db = await readDb();
  return db.events.filter((e) => e.campaign_id === campaignId);
}

export async function getAllEvents(): Promise<MarketingEvent[]> {
  const db = await readDb();
  return db.events;
}

export async function getEventById(eventId: string): Promise<MarketingEvent | null> {
  const db = await readDb();
  return db.events.find((e) => e.id === eventId) || null;
}

export async function createEvent(data: {
  campaign_id: string;
  name: string;
  event_at: string | null;
  venue: string | null;
  memo: string | null;
}): Promise<MarketingEvent> {
  const db = await readDb();
  const newEvent: MarketingEvent = {
    id: crypto.randomUUID(),
    campaign_id: data.campaign_id,
    name: data.name,
    event_at: data.event_at,
    venue: data.venue,
    memo: data.memo,
    status: "preparing",
    created_at: new Date().toISOString(),
  };
  db.events.push(newEvent);
  await writeDb(db);
  return newEvent;
}

export async function updateEvent(
  eventId: string,
  patch: Partial<MarketingEvent>
): Promise<MarketingEvent | null> {
  const db = await readDb();
  const ev = db.events.find((e) => e.id === eventId);
  if (!ev) return null;
  Object.assign(ev, patch);
  await writeDb(db);
  return ev;
}

export async function deleteEvent(eventId: string): Promise<boolean> {
  const db = await readDb();
  const idx = db.events.findIndex((e) => e.id === eventId);
  if (idx < 0) return false;
  db.events.splice(idx, 1);
  db.event_invitees = db.event_invitees.filter((i) => i.event_id !== eventId);
  db.event_checklist_items = db.event_checklist_items.filter((c) => c.event_id !== eventId);
  db.event_plans = db.event_plans.filter((p) => p.event_id !== eventId);
  await writeDb(db);
  return true;
}

export async function getEventInvitees(eventId: string): Promise<EventInvitee[]> {
  const db = await readDb();
  return db.event_invitees.filter((i) => i.event_id === eventId);
}

export async function addEventInviteesFromApplicants(
  eventId: string,
  applicantIds: string[]
): Promise<EventInvitee[]> {
  const db = await readDb();
  const applicants = db.applicants.filter((a) => applicantIds.includes(a.id));
  const newInvitees: EventInvitee[] = [];

  for (const app of applicants) {
    const existing = db.event_invitees.find(
      (i) => i.event_id === eventId && i.applicant_id === app.id
    );
    if (!existing) {
      const inv: EventInvitee = {
        id: crypto.randomUUID(),
        event_id: eventId,
        applicant_id: app.id,
        name: app.name,
        sns_url: app.sns_link,
        contact: app.contact,
        rsvp_status: "pending",
        attended: false,
        memo: null,
        created_at: new Date().toISOString(),
      };
      db.event_invitees.push(inv);
      newInvitees.push(inv);
    }
  }

  await writeDb(db);
  return newInvitees;
}

export async function addDirectEventInvitee(data: {
  event_id: string;
  name: string;
  sns_url: string | null;
  contact: string | null;
  memo: string | null;
}): Promise<EventInvitee> {
  const db = await readDb();
  const inv: EventInvitee = {
    id: crypto.randomUUID(),
    event_id: data.event_id,
    applicant_id: null,
    name: data.name,
    sns_url: data.sns_url,
    contact: data.contact,
    rsvp_status: "pending",
    attended: false,
    memo: data.memo,
    created_at: new Date().toISOString(),
  };
  db.event_invitees.push(inv);
  await writeDb(db);
  return inv;
}

export async function updateEventInvitee(
  inviteeId: string,
  patch: Partial<EventInvitee>
): Promise<EventInvitee | null> {
  const db = await readDb();
  const inv = db.event_invitees.find((i) => i.id === inviteeId);
  if (!inv) return null;
  Object.assign(inv, patch);
  await writeDb(db);
  return inv;
}

export async function deleteEventInvitee(inviteeId: string): Promise<boolean> {
  const db = await readDb();
  const idx = db.event_invitees.findIndex((i) => i.id === inviteeId);
  if (idx < 0) return false;
  db.event_invitees.splice(idx, 1);
  await writeDb(db);
  return true;
}

export async function getEventChecklistItems(eventId: string): Promise<EventChecklistItem[]> {
  const db = await readDb();
  return db.event_checklist_items
    .filter((c) => c.event_id === eventId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function getAllEventChecklistItems(): Promise<EventChecklistItem[]> {
  const db = await readDb();
  return db.event_checklist_items;
}

export async function addEventChecklistItem(data: {
  event_id: string;
  label: string;
  due_date: string | null;
  assignee: string | null;
}): Promise<EventChecklistItem> {
  const db = await readDb();
  const items = db.event_checklist_items.filter((c) => c.event_id === data.event_id);
  const newItem: EventChecklistItem = {
    id: crypto.randomUUID(),
    event_id: data.event_id,
    label: data.label,
    due_date: data.due_date,
    assignee: data.assignee,
    done: false,
    sort_order: items.length + 1,
    created_at: new Date().toISOString(),
  };
  db.event_checklist_items.push(newItem);
  await writeDb(db);
  return newItem;
}

export async function updateEventChecklistItem(
  itemId: string,
  patch: Partial<EventChecklistItem>
): Promise<EventChecklistItem | null> {
  const db = await readDb();
  const item = db.event_checklist_items.find((c) => c.id === itemId);
  if (!item) return null;
  Object.assign(item, patch);
  await writeDb(db);
  return item;
}

export async function deleteEventChecklistItem(itemId: string): Promise<boolean> {
  const db = await readDb();
  const idx = db.event_checklist_items.findIndex((c) => c.id === itemId);
  if (idx < 0) return false;
  db.event_checklist_items.splice(idx, 1);
  await writeDb(db);
  return true;
}

export async function getEventPlan(eventId: string): Promise<EventPlan | null> {
  const db = await readDb();
  return db.event_plans.find((p) => p.event_id === eventId) || null;
}

export async function saveEventPlan(data: {
  event_id: string;
  template_id: string;
  field_values: Record<string, string>;
}): Promise<EventPlan> {
  const db = await readDb();
  const existingIdx = db.event_plans.findIndex((p) => p.event_id === data.event_id);
  const record: EventPlan = {
    id: existingIdx >= 0 ? db.event_plans[existingIdx].id : crypto.randomUUID(),
    event_id: data.event_id,
    template_id: data.template_id,
    field_values: data.field_values,
    updated_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    db.event_plans[existingIdx] = record;
  } else {
    db.event_plans.push(record);
  }
  await writeDb(db);
  return record;
}

// 4. SNS Accounts & Operations (Subproject C)
export async function getSnsAccounts(): Promise<SnsAccount[]> {
  const db = await readDb();
  return db.sns_accounts;
}

export async function getSnsAccountById(id: string): Promise<SnsAccount | null> {
  const db = await readDb();
  return db.sns_accounts.find((a) => a.id === id) || null;
}

export async function getSnsAccountByToken(
  type: "intake" | "approval",
  token: string
): Promise<SnsAccount | null> {
  const db = await readDb();
  const tokenKey = `${type}_token` as keyof SnsAccount;
  return db.sns_accounts.find((a) => a[tokenKey] === token) || null;
}

export async function createSnsAccount(data: {
  company_name: string;
  platform: SnsAccount["platform"];
  handle: string;
  starts_on: string | null;
  ends_on: string | null;
}): Promise<SnsAccount> {
  const db = await readDb();
  const newAccount: SnsAccount = {
    id: crypto.randomUUID(),
    company_name: data.company_name,
    platform: data.platform,
    handle: data.handle,
    starts_on: data.starts_on,
    ends_on: data.ends_on,
    status: "active",
    intake_token: `sns_intake_${crypto.randomUUID().slice(0, 12)}`,
    approval_token: `sns_appr_${crypto.randomUUID().slice(0, 12)}`,
    created_at: new Date().toISOString(),
  };
  db.sns_accounts.unshift(newAccount);
  await writeDb(db);
  return newAccount;
}

export async function getSnsIntakeTemplate(): Promise<SnsIntakeTemplate> {
  const db = await readDb();
  return db.sns_intake_template;
}

export async function updateSnsIntakeTemplate(
  questions: SnsIntakeTemplate["questions"]
): Promise<SnsIntakeTemplate> {
  const db = await readDb();
  db.sns_intake_template.questions = questions;
  await writeDb(db);
  return db.sns_intake_template;
}

export async function getSnsIntakeResponse(accountId: string): Promise<SnsIntakeResponse | null> {
  const db = await readDb();
  return db.sns_intake_responses.find((r) => r.account_id === accountId) || null;
}

export async function saveSnsIntakeResponse(data: {
  account_id: string;
  answers: Record<string, string>;
}): Promise<SnsIntakeResponse> {
  const db = await readDb();
  const existingIdx = db.sns_intake_responses.findIndex((r) => r.account_id === data.account_id);
  const record: SnsIntakeResponse = {
    id: existingIdx >= 0 ? db.sns_intake_responses[existingIdx].id : crypto.randomUUID(),
    account_id: data.account_id,
    answers: data.answers,
    submitted_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    db.sns_intake_responses[existingIdx] = record;
  } else {
    db.sns_intake_responses.push(record);
  }
  await writeDb(db);
  return record;
}

export async function getSnsPlan(accountId: string): Promise<SnsPlan | null> {
  const db = await readDb();
  return db.sns_plans.find((p) => p.account_id === accountId) || null;
}

export async function saveSnsPlan(data: {
  account_id: string;
  template_id: string | null;
  field_values: Record<string, string>;
}): Promise<SnsPlan> {
  const db = await readDb();
  const existingIdx = db.sns_plans.findIndex((p) => p.account_id === data.account_id);
  const record: SnsPlan = {
    id: existingIdx >= 0 ? db.sns_plans[existingIdx].id : crypto.randomUUID(),
    account_id: data.account_id,
    template_id: data.template_id,
    field_values: data.field_values,
    updated_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    db.sns_plans[existingIdx] = record;
  } else {
    db.sns_plans.push(record);
  }
  await writeDb(db);
  return record;
}

export async function getSnsContentsByAccountId(accountId: string): Promise<SnsContent[]> {
  const db = await readDb();
  return db.sns_contents
    .filter((c) => c.account_id === accountId)
    .sort((a, b) => (b.scheduled_on || "").localeCompare(a.scheduled_on || ""));
}

export async function getAllSnsContents(): Promise<SnsContent[]> {
  const db = await readDb();
  return db.sns_contents;
}

export async function getSnsContentById(id: string): Promise<SnsContent | null> {
  const db = await readDb();
  return db.sns_contents.find((c) => c.id === id) || null;
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
  const db = await readDb();
  const newContent: SnsContent = {
    id: crypto.randomUUID(),
    account_id: data.account_id,
    title: data.title,
    scheduled_on: data.scheduled_on,
    assignee: data.assignee,
    status: "planning",
    caption: data.caption,
    hashtags: data.hashtags,
    media_note: data.media_note,
    client_comment: null,
    post_url: null,
    view_count: null,
    like_count: null,
    comment_count: null,
    status_changed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  db.sns_contents.unshift(newContent);
  await writeDb(db);
  return newContent;
}

export async function updateSnsContent(
  id: string,
  patch: Partial<SnsContent>
): Promise<SnsContent | null> {
  const db = await readDb();
  const content = db.sns_contents.find((c) => c.id === id);
  if (!content) return null;

  if (patch.status && patch.status !== content.status) {
    content.status_changed_at = new Date().toISOString();
  }
  Object.assign(content, patch);
  await writeDb(db);
  return content;
}

export async function reviewSnsContent(data: {
  contentId: string;
  decision: "approve" | "request_changes";
  comment?: string;
}): Promise<SnsContent | null> {
  const db = await readDb();
  const content = db.sns_contents.find((c) => c.id === data.contentId);
  if (!content) return null;

  if (data.decision === "approve") {
    content.status = "approved";
    content.client_comment = null;
  } else {
    content.status = "producing";
    content.client_comment = data.comment || "수정 요청이 접수되었습니다.";
  }
  content.status_changed_at = new Date().toISOString();
  await writeDb(db);
  return content;
}

// Compatibility aliases for Subproject A
export { savePreSurveyResponse as upsertPreSurveyResponse };
export { getFormConfig as getCampaignFormConfig };
export { saveFormConfig as upsertCampaignFormConfig };
export { saveReportSections as updateReportCustomSections };

export async function createReport(campaignId: string, title?: string): Promise<CampaignReport> {
  const db = await readDb();
  const newRep: CampaignReport = {
    id: crypto.randomUUID(),
    campaign_id: campaignId,
    title: title || "캠페인 성과 결과보고서",
    custom_sections: [
      {
        id: "sec_default",
        title: "종합 성과 총평",
        content: "시딩 캠페인이 성공적으로 집행되었습니다.",
      },
    ],
    created_at: new Date().toISOString(),
  };
  db.reports.push(newRep);
  await writeDb(db);
  return newRep;
}