import { chromium } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import pg from "pg";
import { AUTH_DIR, BASE_URL, E2E_OWNER, OWNER_STATE_FILE, SEED_FILE, loadTestEnv } from "./env";

/**
 * E2E 전역 준비. Playwright 가 webServer 를 띄운 뒤, 첫 spec 전에 한 번 실행한다.
 *
 *  1. 가드: 테스트 프로젝트가 운영과 겹치면 즉시 중단 (loadTestEnv)
 *  2. 마이그레이션: supabase/migrations 를 테스트 DB 에 적용 (다른 작업으로 생긴 새 테이블 반영)
 *  3. 초기화: public 스키마의 모든 테이블 truncate + auth.users 삭제
 *  4. 계정: e2e_owner 를 만들고 profiles 를 owner/active 로 올린다
 *  5. 로그인: 실제 /login 화면으로 로그인해 storageState 를 tests/e2e/.auth/owner.json 에 저장
 *  6. 시드: spec 이 기대는 캠페인·지원자·행사·SNS 계정·콘텐츠를 service_role 로 직접 insert 하고
 *     id·토큰을 tests/e2e/.auth/seed.json 에 남긴다 (fixtures.ts 가 읽는다)
 *
 * lib/db 를 import 하지 않는다. 앱 코드가 바뀌어도 준비 단계는 흔들리지 않아야 한다.
 * 컬럼 이름은 supabase/migrations/0001_init.sql 기준이다.
 */

export interface SeedData {
  campaignId: string;
  campaignName: string;
  eventId: string;
  snsAccountId: string;
  preSurveyToken: string;
  applyToken: string;
  applicantsShareToken: string;
  seedingShareToken: string;
  snsIntakeToken: string;
  snsApprovalToken: string;
  /** 초기 상태 applied 인 지원자 */
  appliedApplicantName: string;
  appliedApplicantContact: string;
  /** 초기 상태 selected 이고 관리시트에 올라 있는 지원자. 연락처·주소는 공개 페이지에 나오면 안 된다. */
  selectedApplicantName: string;
  selectedApplicantContact: string;
  selectedApplicantAddress: string;
  /** 초기 상태 pending_approval 인 SNS 콘텐츠 */
  pendingContentTitle: string;
  pendingContentMediaNote: string;
  /** 승인 페이지에 보이면 안 되는 planning / posted 콘텐츠 */
  planningContentTitle: string;
  postedContentTitle: string;
}

// ---------- 날짜 (KST). 앱의 lib/seeding/dday 를 import 하지 않으려고 직접 계산한다 ----------

function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()); // YYYY-MM-DD
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** KST 날짜·시각을 ISO(UTC) 로. 예: ("2026-09-20", "18:30") → 2026-09-20T09:30:00.000Z */
function kstToIso(ymd: string, hm: string): string {
  return new Date(`${ymd}T${hm}:00+09:00`).toISOString();
}

function token(prefix: string): string {
  return `${prefix}${randomBytes(16).toString("base64url")}`;
}

// ---------- 단계 ----------

function runMigrations(): void {
  // scripts/db-migrate.mjs --test 는 SUPABASE_TEST_DB_URL 을 읽는다. 이미 적용한 파일은 건너뛴다.
  execFileSync(process.execPath, [path.join(process.cwd(), "scripts", "db-migrate.mjs"), "--test"], {
    stdio: "inherit",
    env: process.env,
  });
}

async function resetDb(dbUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // 목록을 고정하지 않는다. 다른 작업으로 테이블이 늘어도(auth_throttle, signup_invites …) 같이 비운다.
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'schema_migrations'`
    );
    if (rows.length > 0) {
      await client.query(`truncate table ${rows.map((r) => `public."${r.table_name}"`).join(", ")} cascade`);
    }
    // 로그인 계정도 비운다. profiles 는 auth.users 를 참조하므로 함께 사라진다.
    await client.query("delete from auth.users");
  } finally {
    await client.end();
  }
}

async function createOwner(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: E2E_OWNER.email,
    password: E2E_OWNER.password,
    email_confirm: true,
    user_metadata: { username: E2E_OWNER.username, display_name: E2E_OWNER.displayName },
  });
  if (error || !data.user) throw new Error(`e2e_owner 계정 생성 실패: ${error?.message}`);

  // 가입 트리거(handle_new_user)가 profiles 행을 pending/staff 로 만든다. 대표 관리자로 올린다.
  const { error: pErr } = await admin
    .from("profiles")
    .update({ role: "owner", status: "active", approved_at: new Date().toISOString() })
    .eq("id", data.user.id);
  if (pErr) throw new Error(`profiles 승격 실패: ${pErr.message}`);
  return data.user.id;
}

async function loginAndSaveState(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator("#login-username").fill(E2E_OWNER.username);
    await page.locator("#login-password").fill(E2E_OWNER.password);
    await page.getByRole("button", { name: "로그인" }).click();
    // 로그인에 성공하면 홈으로 이동한다. 실패하면 화면의 오류 문구를 그대로 보여준다.
    try {
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
    } catch {
      const err = await page.locator("form").innerText().catch(() => "");
      throw new Error(`e2e_owner 로그인 실패. 화면: ${err.replace(/\s+/g, " ").slice(0, 300)}`);
    }
    await context.storageState({ path: OWNER_STATE_FILE });
    await context.close();
  } finally {
    await browser.close();
  }
}

async function insertOne<T extends { id: string }>(
  admin: SupabaseClient,
  table: string,
  row: Record<string, unknown>
): Promise<T> {
  const { data, error } = await admin.from(table).insert(row).select("*").single<T>();
  if (error || !data) throw new Error(`${table} 시드 실패: ${error?.message}`);
  return data;
}

async function seed(admin: SupabaseClient): Promise<SeedData> {
  const today = kstToday();
  const tokens = {
    preSurveyToken: token("ps_"),
    applyToken: token("apply_"),
    applicantsShareToken: token("app_share_"),
    seedingShareToken: token("seed_share_"),
    snsIntakeToken: token("sns_intake_"),
    snsApprovalToken: token("sns_appr_"),
  };

  // 캠페인 (배송형, 시딩 진행 중)
  const campaign = await insertOne<{ id: string }>(admin, "campaigns", {
    name: "E2E 글로우랩 하이드라 세럼 시딩",
    company_name: "E2E 글로우랩",
    campaign_type: "shipping",
    status: "seeding",
    pre_survey_token: tokens.preSurveyToken,
    apply_form_token: tokens.applyToken,
    applicants_share_token: tokens.applicantsShareToken,
    seeding_sheet_share_token: tokens.seedingShareToken,
  });
  await insertOne<{ id: string }>(admin, "form_configs", {
    campaign_id: campaign.id,
    intro_text: "E2E 모집 안내문입니다.",
    custom_questions: [],
    is_published: true,
  });

  // 지원자 2명: applied 1명, selected 1명(관리시트 행)
  const applied = {
    name: "박민우",
    contact: "010-9988-7766",
  };
  const selected = {
    name: "김서연",
    contact: "010-3849-2819",
    address: "서울특별시 강남구 테헤란로 123 401호",
  };
  await insertOne<{ id: string }>(admin, "applicants", {
    campaign_id: campaign.id,
    name: applied.name,
    sns_link: "https://instagram.com/e2e_minwoo",
    nationality: "대한민국",
    contact: applied.contact,
    follower_count: 12000,
    category: "뷰티",
    shipping_address: "부산광역시 해운대구 E2E로 2",
    status: "applied",
  });
  const selectedRow = await insertOne<{ id: string }>(admin, "applicants", {
    campaign_id: campaign.id,
    name: selected.name,
    sns_link: "https://instagram.com/e2e_seoyeon",
    nationality: "대한민국",
    contact: selected.contact,
    follower_count: 48000,
    category: "뷰티",
    shipping_address: selected.address,
    status: "selected",
    status_changed_at: new Date().toISOString(),
  });
  // 업로드 마감이 D-2 라 오버뷰의 임박 목록에 뜬다.
  // seeding_records.shipping_address / visit_scheduled_at 은 옛 데이터에서 넘어온 컬럼이라
  // 지금 앱은 쓰지 않는다. 앱이 만들지 않는 값을 시드가 넣으면 실제로는 일어나지 않는 상태를
  // 검사하게 되므로 여기서도 넣지 않는다. 주소는 applicants 쪽에만 둔다.
  await insertOne<{ id: string }>(admin, "seeding_records", {
    campaign_id: campaign.id,
    applicant_id: selectedRow.id,
    progress_stage: "발송완료",
    upload_deadline: addDays(today, 2),
  });

  // 행사 (D-2, 준비 중) + 체크리스트 1개 (D-1)
  const event = await insertOne<{ id: string }>(admin, "events", {
    campaign_id: campaign.id,
    name: "E2E 하이드라 세럼 런칭 파티",
    event_at: kstToIso(addDays(today, 2), "18:30"),
    venue: "서울 성수 E2E 라운지",
    memo: "E2E 시드 행사",
    status: "preparing",
  });
  await insertOne<{ id: string }>(admin, "event_checklist_items", {
    event_id: event.id,
    label: "E2E 케이터링 확정",
    due_date: addDays(today, 1),
    assignee: "E2E 담당",
    done: false,
    sort_order: 0,
  });

  // SNS 계정 + 콘텐츠 3개 (승인대기 / 기획 / 게시완료)
  const account = await insertOne<{ id: string }>(admin, "sns_accounts", {
    company_name: "E2E 글로우랩",
    platform: "instagram",
    handle: "@e2e_glowlab",
    starts_on: addDays(today, -30),
    ends_on: addDays(today, 60),
    status: "active",
    intake_token: tokens.snsIntakeToken,
    approval_token: tokens.snsApprovalToken,
  });
  const pending = { title: "3초 속건조 탈출! 하이드라 세럼 제형 릴스", mediaNote: "유리볼 롤링 클로즈업" };
  const planningTitle = "올리브영 단독 기획세트 오픈 안내";
  const postedTitle = "비건 보습 루틴 카드뉴스";
  await insertOne<{ id: string }>(admin, "sns_contents", {
    account_id: account.id,
    title: pending.title,
    scheduled_on: addDays(today, 1),
    assignee: "E2E 에디터",
    status: "pending_approval",
    caption: "3초 만에 스며드는 하이드라 세럼",
    hashtags: "#하이드라세럼 #속건조",
    media_note: pending.mediaNote,
    status_changed_at: new Date().toISOString(),
  });
  await insertOne<{ id: string }>(admin, "sns_contents", {
    account_id: account.id,
    title: planningTitle,
    scheduled_on: addDays(today, 5),
    status: "planning",
  });
  await insertOne<{ id: string }>(admin, "sns_contents", {
    account_id: account.id,
    title: postedTitle,
    scheduled_on: addDays(today, -3),
    status: "posted",
    post_url: "https://instagram.com/p/e2e_posted",
    view_count: 1200,
    like_count: 80,
    comment_count: 5,
  });

  return {
    campaignId: campaign.id,
    campaignName: "E2E 글로우랩 하이드라 세럼 시딩",
    eventId: event.id,
    snsAccountId: account.id,
    ...tokens,
    appliedApplicantName: applied.name,
    appliedApplicantContact: applied.contact,
    selectedApplicantName: selected.name,
    selectedApplicantContact: selected.contact,
    selectedApplicantAddress: selected.address,
    pendingContentTitle: pending.title,
    pendingContentMediaNote: pending.mediaNote,
    planningContentTitle: planningTitle,
    postedContentTitle: postedTitle,
  };
}

export default async function globalSetup(): Promise<void> {
  const env = loadTestEnv();
  if (!env.anonKey) {
    console.warn(
      "[e2e] SUPABASE_TEST_ANON_KEY 가 없어 service_role 키로 로그인합니다. 테스트 프로젝트 anon 키를 .env.local 에 넣어 주세요."
    );
  }
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  runMigrations();
  await resetDb(env.dbUrl);

  const admin = createClient(env.url, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await createOwner(admin);
  await loginAndSaveState();

  const seedData = await seed(admin);
  fs.writeFileSync(SEED_FILE, JSON.stringify(seedData, null, 2), "utf-8");
  console.log(`[e2e] 준비 완료: 캠페인 ${seedData.campaignId}, SNS 계정 ${seedData.snsAccountId}`);
}
