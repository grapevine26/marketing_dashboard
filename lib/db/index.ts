import fs from "fs";
import path from "path";
import os from "os";
import {
  Campaign,
  CampaignStatus,
  PreSurveyTemplate,
  PreSurveyResponse,
  CampaignFormConfig,
  Applicant,
  ApplicantStatus,
  APPLICANT_STATUS_LABELS,
  SeedingRecord,
  ProgressStage,
  CampaignReport,
  ReportSnapshot,
  PptTemplate,
  MarketingEvent,
  EventStatus,
  EventInvitee,
  EventRsvpStatus,
  EventChecklistItem,
  EventPlan,
  SnsAccount,
  SnsIntakeTemplate,
  SnsIntakeResponse,
  SnsPlan,
  SnsContent,
  SnsContentStatus,
  SNS_CONTENT_STATUSES,
  SnsMediaAttachment,
  AuditLogEntry,
  AuditActorType,
  CampaignTokenType,
  SnsTokenType,
} from "./types";
import { generateDefaultPptBuffer } from "../ppt/engine";

/**
 * 로컬 JSON 파일 DB (MVP 전용).
 *
 * - 저장 위치: `.data/db.json` (프로젝트 폴더). `DB_FILE` 환경변수로 바꿀 수 있다(테스트용).
 * - Vercel 같은 읽기 전용 파일시스템에서는 `os.tmpdir()`에 쓰지만, 이 경우 인스턴스가 바뀔 때마다
 *   초기 데이터로 리셋된다. 실제 운영은 영속 DB(SQLite/Postgres)로 옮겨야 한다.
 * - 모든 쓰기는 `mutateDb()`로 직렬화되어 read-modify-write 경합으로 인한 유실을 막는다.
 * - 파일은 mtime 기준으로 캐시되어 요청마다 다시 파싱하지 않는다.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function getDbFilePath(): string {
  if (process.env.DB_FILE) return path.resolve(process.env.DB_FILE);
  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "marketing_db.json");
  }
  return path.join(process.cwd(), ".data", "db.json");
}

export function getUploadsDirPath(): string {
  if (process.env.UPLOADS_DIR) return path.resolve(process.env.UPLOADS_DIR);
  if (process.env.DB_FILE) {
    return path.join(path.dirname(path.resolve(process.env.DB_FILE)), "uploads");
  }
  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "marketing_uploads");
  }
  return path.join(process.cwd(), ".data", "uploads");
}

function ensureUploadsDir(): string {
  const dir = getUploadsDirPath();
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) {
    fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  }
  return dir;
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
  audit_logs: AuditLogEntry[];
}

interface CacheEntry {
  filePath: string;
  data: DatabaseSchema;
  mtimeMs: number;
}

declare global {
  var _marketingDbCache: CacheEntry | undefined;
  var _marketingDbLock: Promise<void> | undefined;
}

const BUILTIN_EVENT_TEMPLATE_ID = "t1a2b3c4-0001-4000-8000-000000000001";
const BUILTIN_SNS_TEMPLATE_ID = "t1a2b3c4-0002-4000-8000-000000000002";
export const BUILTIN_REPORT_TEMPLATE_ID = "t1a2b3c4-0003-4000-8000-000000000003";
export const BUILTIN_EVENT_PLACEHOLDERS = ["브랜드명", "행사명", "행사일시", "행사장소", "행사개요", "프로그램"];
export const BUILTIN_SNS_PLACEHOLDERS = ["브랜드명", "채널명", "계약기간", "운영목표", "타겟오디언스", "콘텐츠방향성", "월별계획"];
export const BUILTIN_REPORT_PLACEHOLDERS = [
  "보고서제목", "캠페인명", "브랜드명", "캠페인유형", "생성일시",
  "총지원자", "최종선정", "예비선정", "업로드완료", "총조회수", "총인게이지먼트", "인게이지먼트율",
  "총평", "차트:성과", "표:인플루언서",
];
const BUILTIN_TEMPLATES: Record<string, { kind: PptTemplate["kind"]; name: string; placeholders: string[] }> = {
  [BUILTIN_EVENT_TEMPLATE_ID]: { kind: "event", name: "기본 인플루언서 행사 운영안 템플릿", placeholders: BUILTIN_EVENT_PLACEHOLDERS },
  [BUILTIN_SNS_TEMPLATE_ID]: { kind: "sns", name: "기본 SNS 공식 채널 운영 제안서 템플릿", placeholders: BUILTIN_SNS_PLACEHOLDERS },
  [BUILTIN_REPORT_TEMPLATE_ID]: { kind: "report", name: "기본 시딩 결과보고서 템플릿", placeholders: BUILTIN_REPORT_PLACEHOLDERS },
};

function ensureDataDir(filePath: string) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) {
      fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
    }
  } catch (err) {
    console.warn("Could not create data directory, using in-memory mode:", err);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function dateOnly(offsetDays: number) {
  return new Date(Date.now() + 86400000 * offsetDays).toISOString().split("T")[0];
}

function getInitialData(): DatabaseSchema {
  const sampleCampaignId = "c1a2b3c4-0001-4000-8000-000000000001";
  const sampleEventId = "e1a2b3c4-0001-4000-8000-000000000001";
  const sampleSnsAccountId = "s1a2b3c4-0001-4000-8000-000000000001";

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
        created_at: nowIso(),
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
        submitted_at: nowIso(),
      },
    ],
    form_configs: [
      {
        id: "fc_001",
        campaign_id: sampleCampaignId,
        intro_text: "글로우랩 2026 하이드라 앰플 런칭 기념 인플루언서 체험단 모집! 솔직하고 감각적인 리뷰를 남겨주실 크리에이터 여러분을 모십니다.",
        custom_questions: [
          { id: "cq_1", label: "주요 피부 타입", type: "select", required: true, options: ["건성", "지성", "복합성", "민감성"] },
          { id: "cq_2", label: "월 평균 뷰티 콘텐츠 업로드 빈도", type: "text", required: false },
        ],
        is_published: true,
        created_at: nowIso(),
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
        custom_answers: { cq_1: "복합성", cq_2: "주 3회" },
        privacy_agreed: true,
        secondary_use_agreed: true,
        status: "selected",
        status_changed_by: "agency",
        status_changed_at: nowIso(),
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
        custom_answers: { cq_1: "건성" },
        privacy_agreed: true,
        secondary_use_agreed: true,
        status: "selected",
        status_changed_by: "agency",
        status_changed_at: nowIso(),
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
        custom_answers: { cq_1: "지성" },
        privacy_agreed: true,
        secondary_use_agreed: false,
        status: "applied",
        status_changed_by: "agency",
        applied_at: nowIso(),
      },
    ],
    seeding_records: [
      {
        id: "seed_001",
        campaign_id: sampleCampaignId,
        applicant_id: "app_001",
        progress_stage: "가이드전달완료",
        upload_deadline: dateOnly(2),
        upload_link: null,
        views: 0,
        engagement: 0,
        notes: "배송 송장 전달 완료",
        created_at: nowIso(),
        updated_at: nowIso(),
      },
      {
        id: "seed_002",
        campaign_id: sampleCampaignId,
        applicant_id: "app_002",
        progress_stage: "선정완료",
        upload_deadline: dateOnly(5),
        upload_link: null,
        views: 0,
        engagement: 0,
        notes: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ],
    reports: [],
    ppt_templates: Object.entries(BUILTIN_TEMPLATES).map(([id, t]) => ({
      id,
      kind: t.kind,
      name: t.name,
      builtin: true,
      placeholders: t.placeholders,
      uploaded_at: nowIso(),
    })),
    events: [
      {
        id: sampleEventId,
        campaign_id: sampleCampaignId,
        name: "글로우랩 런칭 기념 VIP 프라이빗 뷰티 파티",
        event_at: new Date(Date.now() + 86400000 * 3).toISOString(),
        venue: "서울 성동구 성수이로 88 보테가 성수 2F",
        memo: "신제품 앰플 테이스팅 바 및 포토존 운영",
        status: "preparing",
        created_at: nowIso(),
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
        created_at: nowIso(),
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
        created_at: nowIso(),
      },
    ],
    event_checklist_items: [
      {
        id: "chk_001",
        event_id: sampleEventId,
        label: "VIP 웰컴 기프트 키트 30세트 패키징",
        due_date: dateOnly(1),
        assignee: "박기획 매니저",
        done: false,
        sort_order: 1,
        created_at: nowIso(),
      },
      {
        id: "chk_002",
        event_id: sampleEventId,
        label: "성수 대관 장소 음향 및 조명 사전 리허설",
        due_date: dateOnly(2),
        assignee: "이연출 디렉터",
        done: false,
        sort_order: 2,
        created_at: nowIso(),
      },
    ],
    event_plans: [
      {
        id: "ep_001",
        event_id: sampleEventId,
        template_id: BUILTIN_EVENT_TEMPLATE_ID,
        field_values: {
          브랜드명: "글로우랩 코스메틱",
          행사명: "2026 하이드라 앰플 런칭 VIP 뷰티 나잇",
          행사일시: "2026년 9월 15일(화) 18:00 - 21:00",
          행사장소: "서울 성동구 성수이로 88 보테가 성수 2F",
          행사개요: "글로우랩의 신제품 100시간 수분 앰플 출시를 기념하여 최상위 뷰티 인플루언서 30인을 초청하는 프라이빗 런칭 파티",
          프로그램: "18:00 리셉션 & 웰컴 드링크\n18:30 브랜드 스토리 프레젠테이션 & 제품 시연\n19:15 인플루언서 네트워킹 & 럭키드로우",
        },
        updated_at: nowIso(),
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
        created_at: nowIso(),
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
        submitted_at: nowIso(),
      },
    ],
    sns_plans: [
      {
        id: "sp_001",
        account_id: sampleSnsAccountId,
        template_id: BUILTIN_SNS_TEMPLATE_ID,
        field_values: {
          브랜드명: "글로우랩",
          채널명: "인스타그램 공식 채널 (@glowlab_official)",
          계약기간: "2026.09.01 ~ 2026.11.30 (3개월)",
          운영목표: "오가닉 팔로워 30% 증대 및 런칭 신제품 바이럴 확산",
          타겟오디언스: "스킨케어에 관심이 많은 20-34 여성 타깃",
          콘텐츠방향성: "릴스 중심의 고효율 제형 비포애프터 & 감성적인 피드 큐레이션",
          월별계획: "9월: 런칭 바이럴 및 팔로워 유입 이벤트\n10월: 실사용 후기 중심 릴스 집중 발행\n11월: 홀리데이 에디션 선공개",
        },
        updated_at: nowIso(),
      },
    ],
    sns_contents: [
      {
        id: "sct_001",
        account_id: sampleSnsAccountId,
        title: "3초 속건조 탈출! 하이드라 세럼 제형 릴스",
        scheduled_on: dateOnly(2),
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
        status_changed_at: nowIso(),
        created_at: nowIso(),
      },
      {
        id: "sct_002",
        account_id: sampleSnsAccountId,
        title: "올리브영 단독 기획세트 언박싱 스토리 & 피드",
        scheduled_on: dateOnly(4),
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
        status_changed_at: nowIso(),
        created_at: nowIso(),
      },
      {
        id: "sct_003",
        account_id: sampleSnsAccountId,
        title: "민감 피부를 위한 비건 보습 루틴 카드뉴스",
        scheduled_on: dateOnly(-2),
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
    audit_logs: [],
  };
}

/** 예전 버전 JSON을 현재 스키마에 맞춘다. 파일을 읽을 때마다 멱등하게 실행된다. */
function migrateDb(db: DatabaseSchema) {
  const emptyArrays: (keyof DatabaseSchema)[] = [
    "campaigns", "pre_survey_responses", "form_configs", "applicants", "seeding_records", "reports",
    "ppt_templates", "events", "event_invitees", "event_checklist_items", "event_plans",
    "sns_accounts", "sns_intake_responses", "sns_plans", "sns_contents", "audit_logs",
  ];
  for (const key of emptyArrays) {
    if (!Array.isArray(db[key])) (db as unknown as Record<string, unknown>)[key] = [];
  }

  // 내장 템플릿은 base64를 저장하지 않고 코드에서 매번 생성한다(코드 변경이 즉시 반영되도록).
  for (const t of db.ppt_templates) {
    const builtin = BUILTIN_TEMPLATES[t.id];
    if (builtin) {
      t.builtin = true;
      t.kind = builtin.kind;
      delete t.file_data;
      t.placeholders = builtin.placeholders;
    }
  }
  // 나중에 추가된 내장 템플릿(예: 보고서)은 기존 JSON에 없으므로 채워 넣는다.
  for (const [id, t] of Object.entries(BUILTIN_TEMPLATES)) {
    if (!db.ppt_templates.some((x) => x.id === id)) {
      db.ppt_templates.push({ id, kind: t.kind, name: t.name, builtin: true, placeholders: t.placeholders, uploaded_at: nowIso() });
    }
  }

  for (const a of db.applicants) {
    if ((a.status as string) === "dropped") a.status = "rejected";
  }

  for (const c of db.sns_contents) {
    if (!Array.isArray(c.media_attachments)) c.media_attachments = [];
  }
}

async function persist(data: DatabaseSchema): Promise<void> {
  const filePath = getDbFilePath();
  ensureDataDir(filePath);
  let mtimeMs = Date.now();
  try {
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(/*turbopackIgnore: true*/ tmp, filePath);
    mtimeMs = fs.statSync(/*turbopackIgnore: true*/ filePath).mtimeMs;
  } catch (err) {
    console.warn("Could not persist DB to disk (running in-memory):", err);
  }
  globalThis._marketingDbCache = { filePath, data, mtimeMs };
}

export async function readDb(): Promise<DatabaseSchema> {
  const filePath = getDbFilePath();
  const cached = globalThis._marketingDbCache;

  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      const mtimeMs = fs.statSync(/*turbopackIgnore: true*/ filePath).mtimeMs;
      if (cached && cached.filePath === filePath && cached.mtimeMs === mtimeMs) {
        return cached.data;
      }
      const parsed = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf-8")) as DatabaseSchema;
      migrateDb(parsed);
      globalThis._marketingDbCache = { filePath, data: parsed, mtimeMs };
      return parsed;
    }
  } catch (err) {
    console.warn("Could not read DB file, fallback to cache or initial:", err);
  }

  if (cached && cached.filePath === filePath) {
    return cached.data;
  }

  const initial = getInitialData();
  await persist(initial);
  return initial;
}

/** 쓰기 트랜잭션. 직렬화되어 동시에 하나만 실행된다. */
export async function mutateDb<T>(fn: (db: DatabaseSchema) => T | Promise<T>): Promise<T> {
  const prev = globalThis._marketingDbLock ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis._marketingDbLock = prev.then(() => mine);
  await prev;
  try {
    const db = await readDb();
    const result = await fn(db);
    await persist(db);
    return result;
  } finally {
    release();
  }
}

/** @deprecated mutateDb를 사용할 것. 하위 호환용. */
export async function writeDb(data: DatabaseSchema): Promise<void> {
  await persist(data);
}

// ---------- 공통 검증 유틸 ----------

function requireText(value: unknown, label: string, max = 500): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${label}을(를) 입력해주세요.`);
  }
  if (value.trim().length > max) {
    throw new ValidationError(`${label}은(는) ${max}자 이내로 입력해주세요.`);
  }
  return value.trim();
}

function optionalText(value: unknown, max = 2000): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function nonNegativeInt(value: unknown, label: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new ValidationError(`${label}은(는) 0 이상의 정수여야 합니다.`);
  }
  return n;
}

function optionalDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${label} 형식이 올바르지 않습니다. (YYYY-MM-DD)`);
  }
  return value;
}

function optionalIsoDateTime(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${label} 형식이 올바르지 않습니다.`);
  }
  return new Date(value).toISOString();
}

function optionalUrl(value: unknown, label: string): string | null {
  const t = optionalText(value, 2000);
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    return u.toString();
  } catch {
    throw new ValidationError(`${label}은(는) http(s)로 시작하는 URL이어야 합니다.`);
  }
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(`${label} 값이 올바르지 않습니다.`);
  }
  return value as T;
}

const CAMPAIGN_STATUSES: CampaignStatus[] = ["draft", "recruiting", "selecting", "seeding", "reporting", "completed"];
const APPLICANT_STATUSES: ApplicantStatus[] = ["applied", "selected", "reserved", "rejected"];
const PROGRESS_STAGES: ProgressStage[] = ["선정완료", "발송완료", "가이드전달완료", "수령완료", "방문완료", "확정완료", "업로드완료"];
const EVENT_STATUSES: EventStatus[] = ["preparing", "done", "canceled"];
const RSVP_STATUSES: EventRsvpStatus[] = ["pending", "attending", "not_attending"];
const SNS_PLATFORMS: SnsAccount["platform"][] = ["instagram", "youtube", "tiktok", "other"];

// ---------- 감사 로그 (Audit Log) ----------

function appendAuditLog(
  db: DatabaseSchema,
  entry: {
    campaign_id?: string | null;
    account_id?: string | null;
    entity_type: AuditLogEntry["entity_type"];
    entity_id: string;
    action: string;
    actor_type: AuditActorType;
    actor_name?: string | null;
    summary: string;
    details?: Record<string, unknown> | null;
  }
): AuditLogEntry {
  if (!Array.isArray(db.audit_logs)) db.audit_logs = [];
  const record: AuditLogEntry = {
    id: crypto.randomUUID(),
    campaign_id: entry.campaign_id || null,
    account_id: entry.account_id || null,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    action: entry.action,
    actor_type: entry.actor_type,
    actor_name: entry.actor_name || null,
    summary: entry.summary,
    details: entry.details || null,
    created_at: nowIso(),
  };
  db.audit_logs.unshift(record);
  if (db.audit_logs.length > 1000) {
    db.audit_logs = db.audit_logs.slice(0, 1000);
  }
  return record;
}

export async function recordAuditLog(entry: {
  campaign_id?: string | null;
  account_id?: string | null;
  entity_type: AuditLogEntry["entity_type"];
  entity_id: string;
  action: string;
  actor_type: AuditActorType;
  actor_name?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
}): Promise<AuditLogEntry> {
  return mutateDb((db) => appendAuditLog(db, entry));
}

export async function getAuditLogs(filter?: {
  campaign_id?: string;
  account_id?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  const db = await readDb();
  let logs = db.audit_logs || [];
  if (filter?.campaign_id) {
    logs = logs.filter((l) => l.campaign_id === filter.campaign_id);
  }
  if (filter?.account_id) {
    logs = logs.filter((l) => l.account_id === filter.account_id);
  }
  const limit = filter?.limit || 50;
  return logs.slice(0, limit);
}

// ---------- 1. Campaigns & Seeding (Subproject A) ----------

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
  if (!token) return null;
  const db = await readDb();
  const tokenKey = `${type}_token` as keyof Campaign;
  return db.campaigns.find((c) => c[tokenKey] === token) || null;
}

export async function createCampaign(data: {
  name: string;
  company_name: string;
  campaign_type: "shipping" | "visit";
}): Promise<Campaign> {
  const name = requireText(data.name, "캠페인명", 200);
  const company = requireText(data.company_name, "브랜드명", 200);
  const type = oneOf(data.campaign_type, ["shipping", "visit"] as const, "캠페인 유형");

  return mutateDb((db) => {
    const newCamp: Campaign = {
      id: crypto.randomUUID(),
      name,
      company_name: company,
      campaign_type: type,
      status: "recruiting",
      pre_survey_token: `ps_${crypto.randomUUID().slice(0, 12)}`,
      apply_form_token: `apply_${crypto.randomUUID().slice(0, 12)}`,
      applicants_share_token: `app_share_${crypto.randomUUID().slice(0, 12)}`,
      seeding_sheet_share_token: `seed_share_${crypto.randomUUID().slice(0, 12)}`,
      created_at: nowIso(),
    };
    db.campaigns.unshift(newCamp);

    db.form_configs.push({
      id: crypto.randomUUID(),
      campaign_id: newCamp.id,
      intro_text: `${company}의 ${name} ${
        type === "shipping" ? "제품배송형" : "현장방문형"
      } 인플루언서 체험단을 모집합니다 ✨\n솔직하고 감각적인 리뷰 콘텐츠를 함께 만들어갈 크리에이터 분들의 많은 지원 바랍니다.`,
      custom_questions: [],
      is_published: true,
      created_at: nowIso(),
    });
    return newCamp;
  });
}

export async function updateCampaign(
  id: string,
  patch: { name?: string; company_name?: string; status?: CampaignStatus }
): Promise<Campaign | null> {
  return mutateDb((db) => {
    const camp = db.campaigns.find((c) => c.id === id);
    if (!camp) return null;
    if (patch.name !== undefined) camp.name = requireText(patch.name, "캠페인명", 200);
    if (patch.company_name !== undefined) camp.company_name = requireText(patch.company_name, "브랜드명", 200);
    if (patch.status !== undefined) camp.status = oneOf(patch.status, CAMPAIGN_STATUSES, "캠페인 상태");
    return camp;
  });
}

export async function updateCampaignMessageTemplates(
  campaignId: string,
  templates: Record<string, string>
): Promise<Campaign | null> {
  return mutateDb((db) => {
    const camp = db.campaigns.find((c) => c.id === campaignId);
    if (!camp) return null;
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(templates || {})) {
      if (typeof v === "string") cleaned[k] = v.slice(0, 5000);
    }
    camp.message_templates = cleaned;
    return camp;
  });
}

export async function deleteCampaign(id: string): Promise<boolean> {
  return mutateDb((db) => {
    const idx = db.campaigns.findIndex((c) => c.id === id);
    if (idx < 0) return false;
    const target = db.campaigns[idx];
    appendAuditLog(db, {
      campaign_id: id,
      entity_type: "campaign",
      entity_id: id,
      action: "campaign.deleted",
      actor_type: "agency",
      summary: `[${target.name}] 캠페인을 삭제했습니다.`,
    });
    db.campaigns.splice(idx, 1);

    db.form_configs = db.form_configs.filter((f) => f.campaign_id !== id);
    db.pre_survey_responses = db.pre_survey_responses.filter((r) => r.campaign_id !== id);
    db.applicants = db.applicants.filter((a) => a.campaign_id !== id);
    db.seeding_records = db.seeding_records.filter((s) => s.campaign_id !== id);
    db.reports = db.reports.filter((r) => r.campaign_id !== id);

    const eventIds = db.events.filter((e) => e.campaign_id === id).map((e) => e.id);
    db.events = db.events.filter((e) => e.campaign_id !== id);
    db.event_invitees = db.event_invitees.filter((i) => !eventIds.includes(i.event_id));
    db.event_checklist_items = db.event_checklist_items.filter((c) => !eventIds.includes(c.event_id));
    db.event_plans = db.event_plans.filter((p) => !eventIds.includes(p.event_id));

    return true;
  });
}

export async function updateCampaignWebhookUrl(
  campaignId: string,
  webhookUrl: string | null
): Promise<Campaign | null> {
  return mutateDb((db) => {
    const camp = db.campaigns.find((c) => c.id === campaignId);
    if (!camp) return null;
    camp.webhook_url = webhookUrl ? optionalUrl(webhookUrl, "웹훅 URL") || undefined : undefined;
    appendAuditLog(db, {
      campaign_id: campaignId,
      entity_type: "campaign",
      entity_id: campaignId,
      action: "campaign.webhook_updated",
      actor_type: "agency",
      summary: webhookUrl ? "웹훅 알림 URL을 설정했습니다." : "웹훅 알림 설정을 해제했습니다.",
    });
    return camp;
  });
}

export async function regenerateCampaignToken(
  campaignId: string,
  tokenType: CampaignTokenType
): Promise<Campaign> {
  return mutateDb((db) => {
    const camp = db.campaigns.find((c) => c.id === campaignId);
    if (!camp) throw new ValidationError("캠페인을 찾을 수 없습니다.");

    let tokenField: "apply_form_token" | "pre_survey_token" | "applicants_share_token" | "seeding_sheet_share_token";
    let newToken: string;
    let tokenLabel: string;

    if (tokenType === "apply_form") {
      tokenField = "apply_form_token";
      newToken = `apply_${crypto.randomUUID().slice(0, 12)}`;
      tokenLabel = "인플루언서 지원 신청폼";
    } else if (tokenType === "pre_survey") {
      tokenField = "pre_survey_token";
      newToken = `ps_${crypto.randomUUID().slice(0, 12)}`;
      tokenLabel = "광고주 사전조사";
    } else if (tokenType === "applicants_share") {
      tokenField = "applicants_share_token";
      newToken = `app_share_${crypto.randomUUID().slice(0, 12)}`;
      tokenLabel = "광고주 지원자 선정 공유";
    } else if (tokenType === "seeding_sheet_share") {
      tokenField = "seeding_sheet_share_token";
      newToken = `seed_share_${crypto.randomUUID().slice(0, 12)}`;
      tokenLabel = "광고주 시딩 관리시트 공유";
    } else {
      throw new ValidationError("유효하지 않은 토큰 유형입니다.");
    }

    camp[tokenField] = newToken;

    appendAuditLog(db, {
      campaign_id: campaignId,
      entity_type: "campaign",
      entity_id: campaignId,
      action: "token_regenerated",
      actor_type: "agency",
      summary: `[보안] '${tokenLabel}' 외부 공유 링크 토큰이 재발급되었습니다. 이전 링크는 즉시 무효화되었습니다.`,
    });

    return camp;
  });
}

export async function getPreSurveyTemplate(): Promise<PreSurveyTemplate> {
  const db = await readDb();
  return db.pre_survey_template;
}

export async function updatePreSurveyTemplate(
  questions: PreSurveyTemplate["questions"]
): Promise<PreSurveyTemplate> {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new ValidationError("최소 1개 이상의 질문이 필요합니다.");
  }
  const cleaned = questions.map((q) => ({
    id: requireText(q.id, "질문 ID", 100),
    question: requireText(q.question, "질문 내용", 500),
    placeholder: optionalText(q.placeholder, 500) ?? undefined,
    type: q.type,
    required: Boolean(q.required),
  }));
  return mutateDb((db) => {
    db.pre_survey_template.questions = cleaned;
    return db.pre_survey_template;
  });
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
  return mutateDb((db) => {
    const template = db.pre_survey_template;
    const answers: Record<string, string> = {};
    for (const q of template.questions) {
      const v = data.answers?.[q.id];
      const text = typeof v === "string" ? v.trim() : "";
      if (q.required && !text) {
        throw new ValidationError(`필수 질문에 답변해주세요: ${q.question}`);
      }
      if (text) answers[q.id] = text.slice(0, 5000);
    }

    const existingIdx = db.pre_survey_responses.findIndex((r) => r.campaign_id === data.campaign_id);
    const record: PreSurveyResponse = {
      id: existingIdx >= 0 ? db.pre_survey_responses[existingIdx].id : crypto.randomUUID(),
      campaign_id: data.campaign_id,
      answers,
      used_ai_assist: Boolean(data.used_ai_assist),
      submitted_at: nowIso(),
    };
    if (existingIdx >= 0) db.pre_survey_responses[existingIdx] = record;
    else db.pre_survey_responses.push(record);
    return record;
  });
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
    };
  });

  return mutateDb((db) => {
    const existingIdx = db.form_configs.findIndex((f) => f.campaign_id === data.campaign_id);
    const record: CampaignFormConfig = {
      id: existingIdx >= 0 ? db.form_configs[existingIdx].id : crypto.randomUUID(),
      campaign_id: data.campaign_id,
      intro_text: typeof data.intro_text === "string" ? data.intro_text.slice(0, 5000) : "",
      custom_questions: questions,
      is_published: Boolean(data.is_published),
      created_at: existingIdx >= 0 ? db.form_configs[existingIdx].created_at : nowIso(),
    };
    if (existingIdx >= 0) db.form_configs[existingIdx] = record;
    else db.form_configs.push(record);
    return record;
  });
}

export async function getApplicantsByCampaignId(campaignId: string): Promise<Applicant[]> {
  const db = await readDb();
  return db.applicants.filter((a) => a.campaign_id === campaignId);
}

export async function getApplicantById(id: string): Promise<Applicant | null> {
  const db = await readDb();
  return db.applicants.find((a) => a.id === id) || null;
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
  return mutateDb((db) => {
    const campaign = db.campaigns.find((c) => c.id === data.campaign_id);
    if (!campaign) throw new ValidationError("캠페인을 찾을 수 없습니다.");
    const formConfig = db.form_configs.find((f) => f.campaign_id === campaign.id);
    if (formConfig && !formConfig.is_published) {
      throw new ValidationError("현재 모집이 마감되었습니다.");
    }
    if (!data.privacy_agreed) {
      throw new ValidationError("개인정보 수집 및 이용에 동의해주세요.");
    }

    const name = requireText(data.name, "성함", 100);
    const snsLink = optionalUrl(data.sns_link, "SNS 계정 URL");
    if (!snsLink) throw new ValidationError("SNS 계정 URL을 입력해주세요.");

    const cleanSns = snsLink.trim().toLowerCase().replace(/\/$/, "");
    const existingApplicant = db.applicants.find((a) => {
      if (a.campaign_id !== campaign.id) return false;
      const existingClean = (a.sns_link || "").trim().toLowerCase().replace(/\/$/, "");
      return existingClean === cleanSns;
    });
    if (existingApplicant && !data.allow_duplicate) {
      throw new ValidationError("DUPLICATE_SNS: 이미 동일한 SNS 계정으로 접수된 지원서가 있습니다.");
    }

    const nationality = requireText(data.nationality, "국적", 100);
    const contact = requireText(data.contact, "연락처", 50);

    let shippingAddress: string | undefined;
    let visitSchedule: string | undefined;
    let visitPartySize: number | undefined;
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

    const followerCount = data.follower_count != null && !isNaN(Number(data.follower_count))
      ? Math.max(0, Math.floor(Number(data.follower_count)))
      : undefined;

    const newApp: Applicant = {
      id: crypto.randomUUID(),
      campaign_id: campaign.id,
      name,
      sns_link: snsLink,
      nationality,
      contact,
      follower_count: followerCount,
      category: optionalText(data.category, 100) ?? undefined,
      agency_memo: optionalText(data.agency_memo, 2000) ?? undefined,
      shipping_address: shippingAddress,
      visit_schedule: visitSchedule,
      visit_party_size: visitPartySize,
      custom_answers: customAnswers,
      privacy_agreed: true,
      secondary_use_agreed: Boolean(data.secondary_use_agreed),
      status: "applied",
      status_changed_by: "agency",
      applied_at: nowIso(),
    };
    db.applicants.push(newApp);
    appendAuditLog(db, {
      campaign_id: campaign.id,
      entity_type: "applicant",
      entity_id: newApp.id,
      action: "applicant.applied",
      actor_type: "public",
      actor_name: newApp.name,
      summary: `${newApp.name}님이 체험단에 지원했습니다.`,
    });
    return newApp;
  });
}

export async function updateApplicantAgencyMemo(
  applicantId: string,
  memo: string | null | undefined
): Promise<Applicant | null> {
  return mutateDb((db) => {
    const app = db.applicants.find((a) => a.id === applicantId);
    if (!app) return null;
    const cleaned = typeof memo === "string" ? memo.trim().slice(0, 2000) : "";
    app.agency_memo = cleaned || undefined;
    appendAuditLog(db, {
      campaign_id: app.campaign_id,
      entity_type: "applicant",
      entity_id: app.id,
      action: "applicant.memo_updated",
      actor_type: "agency",
      summary: `${app.name}님의 에이전시 메모를 수정했습니다.`,
    });
    return app;
  });
}

/**
 * 지원자 선정 상태 변경. 멱등: 같은 상태면 아무것도 바꾸지 않는다.
 * `selected`가 되는 순간 seeding_records를 1건 생성하고, 이후 상태가 바뀌어도 기록은 삭제하지 않는다
 * (관리시트/보고서는 `selected`인 지원자만 보여준다).
 */
export async function updateApplicantStatus(
  applicantId: string,
  status: ApplicantStatus,
  changedBy: "agency" | "company"
): Promise<{ applicant: Applicant; changed: boolean } | null> {
  const nextStatus = oneOf(status, APPLICANT_STATUSES, "선정 상태");
  return mutateDb((db) => {
    const app = db.applicants.find((a) => a.id === applicantId);
    if (!app) return null;
    if (app.status === nextStatus) return { applicant: app, changed: false };

    const prevStatus = app.status;
    app.status = nextStatus;
    app.status_changed_by = changedBy;
    app.status_changed_at = nowIso();

    const statusLabel = APPLICANT_STATUS_LABELS[nextStatus] ?? nextStatus;
    const actorLabel = changedBy === "company" ? "광고주" : "에이전시";
    appendAuditLog(db, {
      campaign_id: app.campaign_id,
      entity_type: "applicant",
      entity_id: app.id,
      action: "applicant.status_changed",
      actor_type: changedBy,
      summary: `${actorLabel}가 ${app.name}님의 상태를 [${statusLabel}](으)로 변경했습니다.`,
      details: { previous: prevStatus, next: nextStatus },
    });

    if (nextStatus === "selected") {
      const existing = db.seeding_records.find((s) => s.applicant_id === applicantId);
      if (!existing) {
        db.seeding_records.push({
          id: crypto.randomUUID(),
          campaign_id: app.campaign_id,
          applicant_id: applicantId,
          progress_stage: "선정완료",
          upload_deadline: null,
          upload_link: null,
          views: 0,
          engagement: 0,
          notes: null,
          created_at: nowIso(),
          updated_at: nowIso(),
        });
      }
    }
    return { applicant: app, changed: true };
  });
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
  patch: {
    progress_stage?: ProgressStage;
    upload_deadline?: string | null;
    upload_link?: string | null;
    views?: number;
    engagement?: number;
    notes?: string | null;
  }
): Promise<SeedingRecord | null> {
  return mutateDb((db) => {
    const record = db.seeding_records.find((s) => s.id === seedingId);
    if (!record) return null;
    if (patch.progress_stage !== undefined) record.progress_stage = oneOf(patch.progress_stage, PROGRESS_STAGES, "진행 단계");
    if (patch.upload_deadline !== undefined) record.upload_deadline = optionalDate(patch.upload_deadline, "업로드 기한");
    if (patch.upload_link !== undefined) record.upload_link = optionalUrl(patch.upload_link, "업로드 링크");
    if (patch.views !== undefined) record.views = nonNegativeInt(patch.views, "조회수");
    if (patch.engagement !== undefined) record.engagement = nonNegativeInt(patch.engagement, "인게이지먼트");
    if (patch.notes !== undefined) record.notes = optionalText(patch.notes, 2000);
    record.updated_at = nowIso();

    const app = db.applicants.find((a) => a.id === record.applicant_id);
    const appName = app?.name || "인플루언서";
    appendAuditLog(db, {
      campaign_id: record.campaign_id,
      entity_type: "seeding_record",
      entity_id: record.id,
      action: "seeding.updated",
      actor_type: "agency",
      summary: patch.progress_stage
        ? `${appName}님의 진행 단계를 [${patch.progress_stage}](으)로 변경했습니다.`
        : `${appName}님의 관리시트 정보를 수정했습니다.`,
    });

    return record;
  });
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
  const sections = (customSections || []).map((s) => ({
    id: requireText(s.id, "섹션 ID", 100),
    title: typeof s.title === "string" ? s.title.slice(0, 300) : "",
    content: typeof s.content === "string" ? s.content.slice(0, 10000) : "",
  }));
  return mutateDb((db) => {
    const report = db.reports.find((r) => r.id === reportId);
    if (!report) return null;
    report.custom_sections = sections;
    return report;
  });
}

/** 보고서 생성 시점의 캠페인/지원자/관리시트 스냅샷과 지표를 만든다 (순수 함수, 테스트 가능). */
export function buildReportSnapshot(
  campaign: Campaign,
  applicants: Applicant[],
  seedingRecords: SeedingRecord[]
): ReportSnapshot {
  const seedingByApplicant = new Map(seedingRecords.map((s) => [s.applicant_id, s]));
  const snapshotApplicants = applicants.map((a) => ({
    ...a,
    seeding: seedingByApplicant.get(a.id) ?? null,
  }));
  const selected = snapshotApplicants.filter((a) => a.status === "selected");
  const selectedSeeding = selected.map((a) => a.seeding).filter((s): s is SeedingRecord => Boolean(s));
  const totalViews = selectedSeeding.reduce((acc, s) => acc + (s.views || 0), 0);
  const totalEngagement = selectedSeeding.reduce((acc, s) => acc + (s.engagement || 0), 0);
  return {
    campaign: { ...campaign },
    applicants: snapshotApplicants,
    metrics: {
      totalApplicants: applicants.length,
      selectedCount: selected.length,
      reservedCount: applicants.filter((a) => a.status === "reserved").length,
      completedUploads: selectedSeeding.filter(
        (s) => s.progress_stage === "업로드완료" || Boolean(s.upload_link)
      ).length,
      totalViews,
      totalEngagement,
      avgEngagementRate: totalViews > 0 ? Math.round((totalEngagement / totalViews) * 10000) / 100 : 0,
    },
  };
}

export async function createReport(campaignId: string, title?: string): Promise<CampaignReport> {
  return mutateDb((db) => {
    const campaign = db.campaigns.find((c) => c.id === campaignId);
    if (!campaign) throw new ValidationError("캠페인을 찾을 수 없습니다.");
    const applicants = db.applicants.filter((a) => a.campaign_id === campaignId);
    const seeding = db.seeding_records.filter((s) => s.campaign_id === campaignId);
    const snapshot = buildReportSnapshot(campaign, applicants, seeding);
    const generatedAt = nowIso();
    const newRep: CampaignReport = {
      id: crypto.randomUUID(),
      campaign_id: campaignId,
      title: optionalText(title, 200) || `${campaign.name} 결과보고서`,
      snapshot_data: snapshot,
      custom_sections: [
        {
          id: "sec_default",
          title: "종합 성과 총평",
          content: `총 ${snapshot.metrics.totalApplicants}명 지원, ${snapshot.metrics.selectedCount}명 최종 선정, ${snapshot.metrics.completedUploads}건 업로드 완료.`,
        },
      ],
      generated_at: generatedAt,
      created_at: generatedAt,
    };
    db.reports.push(newRep);
    return newRep;
  });
}

// ---------- 2. Shared PPT Templates (Subprojects B & C) ----------

export async function getPptTemplates(kind?: PptTemplate["kind"]): Promise<PptTemplate[]> {
  const db = await readDb();
  return kind ? db.ppt_templates.filter((t) => t.kind === kind) : db.ppt_templates;
}

export async function getPptTemplateById(id: string): Promise<PptTemplate | null> {
  const db = await readDb();
  return db.ppt_templates.find((t) => t.id === id) || null;
}

/** 템플릿의 실제 pptx 바이너리. 내장 템플릿은 코드에서 생성, 업로드 템플릿은 base64에서 복원. 없으면 null. */
export async function getPptTemplateBuffer(template: PptTemplate): Promise<Buffer | null> {
  if (template.builtin) {
    return generateDefaultPptBuffer(template.kind);
  }
  if (template.file_data) {
    return Buffer.from(template.file_data, "base64");
  }
  return null;
}

export async function savePptTemplate(data: {
  kind: PptTemplate["kind"];
  name: string;
  file_buffer: Buffer;
  placeholders: string[];
}): Promise<PptTemplate> {
  const kind = oneOf(data.kind, ["event", "sns", "report"] as const, "템플릿 종류");
  const name = requireText(data.name, "템플릿 이름", 200);
  if (!data.file_buffer || data.file_buffer.length < 4 || data.file_buffer.toString("latin1", 0, 2) !== "PK") {
    throw new ValidationError("올바른 .pptx 파일이 아닙니다.");
  }
  if (data.file_buffer.length > 15 * 1024 * 1024) {
    throw new ValidationError("템플릿 파일은 15MB 이하만 업로드할 수 있습니다.");
  }
  return mutateDb((db) => {
    const newTemplate: PptTemplate = {
      id: crypto.randomUUID(),
      kind,
      name,
      file_data: data.file_buffer.toString("base64"),
      placeholders: data.placeholders,
      uploaded_at: nowIso(),
    };
    db.ppt_templates.push(newTemplate);
    return newTemplate;
  });
}

export async function deletePptTemplate(id: string): Promise<boolean> {
  return mutateDb((db) => {
    const idx = db.ppt_templates.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    if (db.ppt_templates[idx].builtin) {
      throw new ValidationError("기본 내장 템플릿은 삭제할 수 없습니다.");
    }
    db.ppt_templates.splice(idx, 1);
    return true;
  });
}

// ---------- 3. Events (Subproject B) ----------

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
  const name = requireText(data.name, "행사명", 200);
  const eventAt = optionalIsoDateTime(data.event_at, "행사 일시");
  return mutateDb((db) => {
    if (!db.campaigns.some((c) => c.id === data.campaign_id)) {
      throw new ValidationError("연계할 캠페인을 찾을 수 없습니다.");
    }
    const newEvent: MarketingEvent = {
      id: crypto.randomUUID(),
      campaign_id: data.campaign_id,
      name,
      event_at: eventAt,
      venue: optionalText(data.venue, 300),
      memo: optionalText(data.memo, 3000),
      status: "preparing",
      created_at: nowIso(),
    };
    db.events.push(newEvent);
    return newEvent;
  });
}

export async function updateEvent(
  eventId: string,
  patch: { name?: string; event_at?: string | null; venue?: string | null; memo?: string | null; status?: EventStatus }
): Promise<MarketingEvent | null> {
  return mutateDb((db) => {
    const ev = db.events.find((e) => e.id === eventId);
    if (!ev) return null;
    if (patch.name !== undefined) ev.name = requireText(patch.name, "행사명", 200);
    if (patch.event_at !== undefined) ev.event_at = optionalIsoDateTime(patch.event_at, "행사 일시");
    if (patch.venue !== undefined) ev.venue = optionalText(patch.venue, 300);
    if (patch.memo !== undefined) ev.memo = optionalText(patch.memo, 3000);
    if (patch.status !== undefined) ev.status = oneOf(patch.status, EVENT_STATUSES, "행사 상태");
    return ev;
  });
}

export async function deleteEvent(eventId: string): Promise<boolean> {
  return mutateDb((db) => {
    const idx = db.events.findIndex((e) => e.id === eventId);
    if (idx < 0) return false;
    db.events.splice(idx, 1);
    db.event_invitees = db.event_invitees.filter((i) => i.event_id !== eventId);
    db.event_checklist_items = db.event_checklist_items.filter((c) => c.event_id !== eventId);
    db.event_plans = db.event_plans.filter((p) => p.event_id !== eventId);
    return true;
  });
}

export async function getEventInvitees(eventId: string): Promise<EventInvitee[]> {
  const db = await readDb();
  return db.event_invitees.filter((i) => i.event_id === eventId);
}

export async function addEventInviteesFromApplicants(
  eventId: string,
  applicantIds: string[]
): Promise<EventInvitee[]> {
  return mutateDb((db) => {
    const ev = db.events.find((e) => e.id === eventId);
    if (!ev) throw new ValidationError("행사를 찾을 수 없습니다.");
    const applicants = db.applicants.filter(
      (a) => applicantIds.includes(a.id) && a.campaign_id === ev.campaign_id
    );
    const newInvitees: EventInvitee[] = [];
    for (const app of applicants) {
      const existing = db.event_invitees.find(
        (i) => i.event_id === eventId && i.applicant_id === app.id
      );
      if (existing) continue;
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
        created_at: nowIso(),
      };
      db.event_invitees.push(inv);
      newInvitees.push(inv);
    }
    return newInvitees;
  });
}

export async function addDirectEventInvitee(data: {
  event_id: string;
  name: string;
  sns_url: string | null;
  contact: string | null;
  memo: string | null;
}): Promise<EventInvitee> {
  const name = requireText(data.name, "이름", 100);
  const snsUrl = optionalUrl(data.sns_url, "SNS URL");
  return mutateDb((db) => {
    if (!db.events.some((e) => e.id === data.event_id)) {
      throw new ValidationError("행사를 찾을 수 없습니다.");
    }
    const inv: EventInvitee = {
      id: crypto.randomUUID(),
      event_id: data.event_id,
      applicant_id: null,
      name,
      sns_url: snsUrl,
      contact: optionalText(data.contact, 50),
      rsvp_status: "pending",
      attended: false,
      memo: optionalText(data.memo, 1000),
      created_at: nowIso(),
    };
    db.event_invitees.push(inv);
    return inv;
  });
}

export async function updateEventInvitee(
  inviteeId: string,
  patch: { rsvp_status?: EventRsvpStatus; attended?: boolean; memo?: string | null }
): Promise<EventInvitee | null> {
  return mutateDb((db) => {
    const inv = db.event_invitees.find((i) => i.id === inviteeId);
    if (!inv) return null;
    if (patch.rsvp_status !== undefined) inv.rsvp_status = oneOf(patch.rsvp_status, RSVP_STATUSES, "RSVP 상태");
    if (patch.attended !== undefined) inv.attended = Boolean(patch.attended);
    if (patch.memo !== undefined) inv.memo = optionalText(patch.memo, 1000);
    return inv;
  });
}

export async function deleteEventInvitee(inviteeId: string): Promise<boolean> {
  return mutateDb((db) => {
    const idx = db.event_invitees.findIndex((i) => i.id === inviteeId);
    if (idx < 0) return false;
    db.event_invitees.splice(idx, 1);
    return true;
  });
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
  const label = requireText(data.label, "할 일 내용", 300);
  const dueDate = optionalDate(data.due_date, "마감일");
  return mutateDb((db) => {
    if (!db.events.some((e) => e.id === data.event_id)) {
      throw new ValidationError("행사를 찾을 수 없습니다.");
    }
    const items = db.event_checklist_items.filter((c) => c.event_id === data.event_id);
    const newItem: EventChecklistItem = {
      id: crypto.randomUUID(),
      event_id: data.event_id,
      label,
      due_date: dueDate,
      assignee: optionalText(data.assignee, 100),
      done: false,
      sort_order: items.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1,
      created_at: nowIso(),
    };
    db.event_checklist_items.push(newItem);
    return newItem;
  });
}

export async function updateEventChecklistItem(
  itemId: string,
  patch: { label?: string; due_date?: string | null; assignee?: string | null; done?: boolean }
): Promise<EventChecklistItem | null> {
  return mutateDb((db) => {
    const item = db.event_checklist_items.find((c) => c.id === itemId);
    if (!item) return null;
    if (patch.label !== undefined) item.label = requireText(patch.label, "할 일 내용", 300);
    if (patch.due_date !== undefined) item.due_date = optionalDate(patch.due_date, "마감일");
    if (patch.assignee !== undefined) item.assignee = optionalText(patch.assignee, 100);
    if (patch.done !== undefined) item.done = Boolean(patch.done);
    return item;
  });
}

export async function deleteEventChecklistItem(itemId: string): Promise<boolean> {
  return mutateDb((db) => {
    const idx = db.event_checklist_items.findIndex((c) => c.id === itemId);
    if (idx < 0) return false;
    db.event_checklist_items.splice(idx, 1);
    return true;
  });
}

export async function getEventPlan(eventId: string): Promise<EventPlan | null> {
  const db = await readDb();
  return db.event_plans.find((p) => p.event_id === eventId) || null;
}

function cleanFieldValues(values: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (typeof k !== "string" || !k.trim()) continue;
    out[k.trim()] = typeof v === "string" ? v.slice(0, 5000) : String(v ?? "");
  }
  return out;
}

export async function saveEventPlan(data: {
  event_id: string;
  template_id: string;
  field_values: Record<string, string>;
}): Promise<EventPlan> {
  const values = cleanFieldValues(data.field_values);
  return mutateDb((db) => {
    if (!db.events.some((e) => e.id === data.event_id)) throw new ValidationError("행사를 찾을 수 없습니다.");
    const template = db.ppt_templates.find((t) => t.id === data.template_id && t.kind === "event");
    if (!template) throw new ValidationError("행사용 PPT 템플릿을 선택해주세요.");
    const existingIdx = db.event_plans.findIndex((p) => p.event_id === data.event_id);
    const record: EventPlan = {
      id: existingIdx >= 0 ? db.event_plans[existingIdx].id : crypto.randomUUID(),
      event_id: data.event_id,
      template_id: template.id,
      field_values: values,
      updated_at: nowIso(),
    };
    if (existingIdx >= 0) db.event_plans[existingIdx] = record;
    else db.event_plans.push(record);
    return record;
  });
}

// ---------- 4. SNS Accounts & Operations (Subproject C) ----------

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
  if (!token) return null;
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
  const company = requireText(data.company_name, "브랜드명", 200);
  const platform = oneOf(data.platform, SNS_PLATFORMS, "플랫폼");
  const handle = requireText(data.handle, "계정 핸들", 100).replace(/^@/, "");
  const startsOn = optionalDate(data.starts_on, "계약 시작일");
  const endsOn = optionalDate(data.ends_on, "계약 종료일");
  if (startsOn && endsOn && startsOn > endsOn) {
    throw new ValidationError("계약 종료일은 시작일 이후여야 합니다.");
  }

  return mutateDb((db) => {
    const newAccount: SnsAccount = {
      id: crypto.randomUUID(),
      company_name: company,
      platform,
      handle,
      starts_on: startsOn,
      ends_on: endsOn,
      status: "active",
      intake_token: `sns_intake_${crypto.randomUUID().slice(0, 12)}`,
      approval_token: `sns_appr_${crypto.randomUUID().slice(0, 12)}`,
      created_at: nowIso(),
    };
    db.sns_accounts.unshift(newAccount);

    const defaultSnsTemplate = db.ppt_templates.find((t) => t.kind === "sns");
    db.sns_plans.push({
      id: crypto.randomUUID(),
      account_id: newAccount.id,
      template_id: defaultSnsTemplate?.id || null,
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
    });
    return newAccount;
  });
}

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
  return mutateDb((db) => {
    const acc = db.sns_accounts.find((a) => a.id === id);
    if (!acc) return null;
    if (patch.company_name !== undefined) acc.company_name = requireText(patch.company_name, "브랜드명", 200);
    if (patch.platform !== undefined) acc.platform = oneOf(patch.platform, SNS_PLATFORMS, "플랫폼");
    if (patch.handle !== undefined) acc.handle = requireText(patch.handle, "계정 핸들", 100).replace(/^@/, "");
    if (patch.starts_on !== undefined) acc.starts_on = optionalDate(patch.starts_on, "계약 시작일");
    if (patch.ends_on !== undefined) acc.ends_on = optionalDate(patch.ends_on, "계약 종료일");
    if (patch.status !== undefined) acc.status = oneOf(patch.status, ["active", "ended"] as const, "계정 상태");
    if (acc.starts_on && acc.ends_on && acc.starts_on > acc.ends_on) {
      throw new ValidationError("계약 종료일은 시작일 이후여야 합니다.");
    }
    return acc;
  });
}

export async function regenerateSnsToken(
  accountId: string,
  tokenType: SnsTokenType
): Promise<SnsAccount> {
  return mutateDb((db) => {
    const acc = db.sns_accounts.find((a) => a.id === accountId);
    if (!acc) throw new ValidationError("SNS 계정을 찾을 수 없습니다.");

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

    acc[tokenField] = newToken;

    appendAuditLog(db, {
      account_id: accountId,
      entity_type: "sns_account",
      entity_id: accountId,
      action: "token_regenerated",
      actor_type: "agency",
      summary: `[보안] '${tokenLabel}' 전용 링크 토큰이 재발급되었습니다. 이전 링크는 즉시 무효화되었습니다.`,
    });

    return acc;
  });
}

export async function deleteSnsAccount(id: string): Promise<boolean> {
  return mutateDb((db) => {
    const idx = db.sns_accounts.findIndex((a) => a.id === id);
    if (idx < 0) return false;
    const target = db.sns_accounts[idx];
    appendAuditLog(db, {
      account_id: id,
      entity_type: "sns_account",
      entity_id: id,
      action: "sns_account.deleted",
      actor_type: "agency",
      summary: `[${target.company_name}] (@${target.handle}) SNS 계정을 삭제했습니다.`,
    });
    db.sns_accounts.splice(idx, 1);

    const removedContents = db.sns_contents.filter((c) => c.account_id === id);
    const uploadsDir = getUploadsDirPath();
    if (fs.existsSync(/*turbopackIgnore: true*/ uploadsDir)) {
      try {
        const files = fs.readdirSync(/*turbopackIgnore: true*/ uploadsDir);
        for (const c of removedContents) {
          if (c.media_attachments) {
            for (const att of c.media_attachments) {
              for (const file of files) {
                if (file.startsWith(att.id)) {
                  try { fs.unlinkSync(path.join(/*turbopackIgnore: true*/ uploadsDir, file)); } catch {}
                }
              }
            }
          }
        }
      } catch {}
    }

    db.sns_contents = db.sns_contents.filter((c) => c.account_id !== id);
    db.sns_plans = db.sns_plans.filter((p) => p.account_id !== id);
    db.sns_intake_responses = db.sns_intake_responses.filter((r) => r.account_id !== id);

    return true;
  });
}

export async function getSnsIntakeTemplate(): Promise<SnsIntakeTemplate> {
  const db = await readDb();
  return db.sns_intake_template;
}

export async function updateSnsIntakeTemplate(
  questions: SnsIntakeTemplate["questions"]
): Promise<SnsIntakeTemplate> {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new ValidationError("최소 1개 이상의 질문이 필요합니다.");
  }
  const cleaned = questions.map((q) => ({
    id: requireText(q.id, "질문 ID", 100),
    question: requireText(q.question, "질문 내용", 500),
    placeholder: optionalText(q.placeholder, 500) ?? undefined,
    type: q.type,
    required: Boolean(q.required),
  }));
  return mutateDb((db) => {
    db.sns_intake_template.questions = cleaned;
    return db.sns_intake_template;
  });
}

export async function getSnsIntakeResponse(accountId: string): Promise<SnsIntakeResponse | null> {
  const db = await readDb();
  return db.sns_intake_responses.find((r) => r.account_id === accountId) || null;
}

export async function saveSnsIntakeResponse(data: {
  account_id: string;
  answers: Record<string, string>;
}): Promise<SnsIntakeResponse> {
  return mutateDb((db) => {
    if (!db.sns_accounts.some((a) => a.id === data.account_id)) {
      throw new ValidationError("계정을 찾을 수 없습니다.");
    }
    const answers: Record<string, string> = {};
    for (const q of db.sns_intake_template.questions) {
      const v = data.answers?.[q.id];
      const text = typeof v === "string" ? v.trim() : "";
      if (q.required && !text) throw new ValidationError(`필수 질문에 답변해주세요: ${q.question}`);
      if (text) answers[q.id] = text.slice(0, 5000);
    }
    const existingIdx = db.sns_intake_responses.findIndex((r) => r.account_id === data.account_id);
    const record: SnsIntakeResponse = {
      id: existingIdx >= 0 ? db.sns_intake_responses[existingIdx].id : crypto.randomUUID(),
      account_id: data.account_id,
      answers,
      submitted_at: nowIso(),
    };
    if (existingIdx >= 0) db.sns_intake_responses[existingIdx] = record;
    else db.sns_intake_responses.push(record);
    return record;
  });
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
  const values = cleanFieldValues(data.field_values);
  return mutateDb((db) => {
    if (!db.sns_accounts.some((a) => a.id === data.account_id)) throw new ValidationError("계정을 찾을 수 없습니다.");
    let templateId: string | null = null;
    if (data.template_id) {
      const template = db.ppt_templates.find((t) => t.id === data.template_id && t.kind === "sns");
      if (!template) throw new ValidationError("SNS용 PPT 템플릿을 찾을 수 없습니다.");
      templateId = template.id;
    }
    const existingIdx = db.sns_plans.findIndex((p) => p.account_id === data.account_id);
    const record: SnsPlan = {
      id: existingIdx >= 0 ? db.sns_plans[existingIdx].id : crypto.randomUUID(),
      account_id: data.account_id,
      template_id: templateId,
      field_values: values,
      updated_at: nowIso(),
    };
    if (existingIdx >= 0) db.sns_plans[existingIdx] = record;
    else db.sns_plans.push(record);
    return record;
  });
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
  const title = requireText(data.title, "콘텐츠 제목", 300);
  const scheduledOn = optionalDate(data.scheduled_on, "발행 예정일");
  return mutateDb((db) => {
    if (!db.sns_accounts.some((a) => a.id === data.account_id)) throw new ValidationError("계정을 찾을 수 없습니다.");
    const newContent: SnsContent = {
      id: crypto.randomUUID(),
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
      created_at: nowIso(),
    };
    db.sns_contents.unshift(newContent);
    return newContent;
  });
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

export async function updateSnsContent(id: string, patch: SnsContentPatch): Promise<SnsContent | null> {
  return mutateDb((db) => {
    const content = db.sns_contents.find((c) => c.id === id);
    if (!content) return null;

    if (patch.title !== undefined) content.title = requireText(patch.title, "콘텐츠 제목", 300);
    if (patch.scheduled_on !== undefined) content.scheduled_on = optionalDate(patch.scheduled_on, "발행 예정일");
    if (patch.assignee !== undefined) content.assignee = optionalText(patch.assignee, 100);
    if (patch.caption !== undefined) content.caption = optionalText(patch.caption, 5000);
    if (patch.hashtags !== undefined) content.hashtags = optionalText(patch.hashtags, 1000);
    if (patch.media_note !== undefined) content.media_note = optionalText(patch.media_note, 3000);
    if (patch.post_url !== undefined) content.post_url = optionalUrl(patch.post_url, "게시 링크");

    const perfKeys = ["view_count", "like_count", "comment_count"] as const;
    const labels = { view_count: "조회수", like_count: "좋아요", comment_count: "댓글수" };
    for (const key of perfKeys) {
      if (patch[key] === undefined) continue;
      if (patch[key] === null) {
        content[key] = null;
      } else {
        if (content.status !== "posted" && patch.status !== "posted") {
          throw new ValidationError("성과 수치는 게시완료 상태에서만 입력할 수 있습니다.");
        }
        content[key] = nonNegativeInt(patch[key], labels[key]);
      }
    }

    if (patch.status !== undefined) {
      const next = oneOf(patch.status, SNS_CONTENT_STATUSES, "콘텐츠 상태");
      if (next !== content.status) {
        content.status = next;
        content.status_changed_at = nowIso();
      }
    }
    return content;
  });
}

export async function deleteSnsContent(id: string): Promise<boolean> {
  return mutateDb((db) => {
    const idx = db.sns_contents.findIndex((c) => c.id === id);
    if (idx < 0) return false;
    const [removed] = db.sns_contents.splice(idx, 1);
    if (removed.media_attachments && removed.media_attachments.length > 0) {
      const uploadsDir = getUploadsDirPath();
      if (fs.existsSync(/*turbopackIgnore: true*/ uploadsDir)) {
        try {
          const files = fs.readdirSync(/*turbopackIgnore: true*/ uploadsDir);
          for (const att of removed.media_attachments) {
            for (const file of files) {
              if (file.startsWith(att.id)) {
                try { fs.unlinkSync(path.join(/*turbopackIgnore: true*/ uploadsDir, file)); } catch {}
              }
            }
          }
        } catch {}
      }
    }
    return true;
  });
}

export const ALLOWED_SNS_MEDIA_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

function sanitizeFileName(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._\-\uAC00-\uD7A3]/g, "_");
}

export async function saveSnsMediaAttachment(
  contentId: string,
  file: {
    name: string;
    buffer: Buffer;
    mime_type: string;
    size: number;
  }
): Promise<SnsMediaAttachment> {
  const mime = file.mime_type?.toLowerCase() || "";
  const ext = ALLOWED_SNS_MEDIA_MIME_TYPES[mime];
  if (!ext) {
    throw new ValidationError("지원하지 않는 파일 형식입니다. (JPG, PNG, WebP, GIF, MP4, WebM, MOV 지원)");
  }
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB
  if (file.size > MAX_SIZE || file.buffer.length > MAX_SIZE) {
    throw new ValidationError("파일 크기는 50MB 이하만 업로드할 수 있습니다.");
  }
  if (!file.buffer || file.buffer.length === 0) {
    throw new ValidationError("빈 파일은 업로드할 수 없습니다.");
  }

  const uploadsDir = ensureUploadsDir();
  const attachmentId = crypto.randomUUID();
  const safeName = sanitizeFileName(file.name) || `attachment_${attachmentId}${ext}`;
  const storedFilename = `${attachmentId}${ext}`;
  const targetPath = path.join(/*turbopackIgnore: true*/ uploadsDir, storedFilename);

  fs.writeFileSync(/*turbopackIgnore: true*/ targetPath, file.buffer);

  const attachment: SnsMediaAttachment = {
    id: attachmentId,
    name: safeName,
    url: `/api/media/${attachmentId}`,
    mime_type: mime,
    size: file.size,
    uploaded_at: nowIso(),
  };

  return mutateDb((db) => {
    const content = db.sns_contents.find((c) => c.id === contentId);
    if (!content) {
      try { fs.unlinkSync(/*turbopackIgnore: true*/ targetPath); } catch {}
      throw new ValidationError("콘텐츠를 찾을 수 없습니다.");
    }
    if (!content.media_attachments) {
      content.media_attachments = [];
    }
    content.media_attachments.push(attachment);

    appendAuditLog(db, {
      account_id: content.account_id,
      entity_type: "sns_content",
      entity_id: content.id,
      action: "sns.add_media",
      actor_type: "agency",
      summary: `[${content.title}] 시안 미디어 첨부: ${attachment.name} (${(attachment.size / (1024 * 1024)).toFixed(1)}MB)`,
    });

    return attachment;
  });
}

export async function deleteSnsMediaAttachment(
  contentId: string,
  attachmentId: string
): Promise<boolean> {
  return mutateDb((db) => {
    const content = db.sns_contents.find((c) => c.id === contentId);
    if (!content || !content.media_attachments) return false;

    const idx = content.media_attachments.findIndex((m) => m.id === attachmentId);
    if (idx < 0) return false;

    const [deleted] = content.media_attachments.splice(idx, 1);

    const uploadsDir = getUploadsDirPath();
    if (fs.existsSync(/*turbopackIgnore: true*/ uploadsDir)) {
      try {
        const files = fs.readdirSync(/*turbopackIgnore: true*/ uploadsDir);
        for (const file of files) {
          if (file.startsWith(attachmentId)) {
            try { fs.unlinkSync(path.join(/*turbopackIgnore: true*/ uploadsDir, file)); } catch {}
          }
        }
      } catch (err) {
        console.warn("Failed to delete media file from disk:", err);
      }
    }

    appendAuditLog(db, {
      account_id: content.account_id,
      entity_type: "sns_content",
      entity_id: content.id,
      action: "sns.delete_media",
      actor_type: "agency",
      summary: `[${content.title}] 시안 미디어 삭제: ${deleted.name}`,
    });

    return true;
  });
}

export async function getSnsMediaAttachmentById(
  attachmentId: string
): Promise<{ attachment: SnsMediaAttachment; filePath: string; accountId: string } | null> {
  const db = await readDb();
  for (const content of db.sns_contents) {
    if (content.media_attachments) {
      const att = content.media_attachments.find((m) => m.id === attachmentId);
      if (att) {
        const uploadsDir = getUploadsDirPath();
        if (fs.existsSync(/*turbopackIgnore: true*/ uploadsDir)) {
          const files = fs.readdirSync(/*turbopackIgnore: true*/ uploadsDir);
          const foundFile = files.find((f) => f.startsWith(attachmentId));
          if (foundFile) {
            return {
              attachment: att,
              filePath: path.join(/*turbopackIgnore: true*/ uploadsDir, foundFile),
              accountId: content.account_id,
            };
          }
        }
      }
    }
  }
  return null;
}

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
  return mutateDb((db) => {
    const content = db.sns_contents.find((c) => c.id === data.contentId);
    if (!content || content.account_id !== data.accountId) {
      throw new ValidationError("콘텐츠를 찾을 수 없습니다.");
    }
    if (content.status !== "pending_approval") {
      return { content, changed: false };
    }
    if (decision === "approve") {
      content.status = "approved";
      content.client_comment = null;
    } else {
      content.status = "producing";
      content.client_comment = optionalText(data.comment, 2000) || "수정 요청이 접수되었습니다.";
    }
    content.status_changed_at = nowIso();

    appendAuditLog(db, {
      account_id: data.accountId,
      entity_type: "sns_content",
      entity_id: content.id,
      action: decision === "approve" ? "sns.approved" : "sns.revision_requested",
      actor_type: "company",
      summary: `광고주가 [${content.title}] 시안을 ${decision === "approve" ? "승인" : "수정요청"}했습니다.`,
      details: decision === "request_changes" ? { comment: data.comment } : null,
    });

    return { content, changed: true };
  });
}

// Compatibility aliases for Subproject A
export { savePreSurveyResponse as upsertPreSurveyResponse };
export { getFormConfig as getCampaignFormConfig };
export { saveFormConfig as upsertCampaignFormConfig };
export { saveReportSections as updateReportCustomSections };
