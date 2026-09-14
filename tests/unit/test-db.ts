import path from "path";
import pg from "pg";

/**
 * 테스트 DB 연결.
 *
 * DB 를 건드리는 테스트는 실제 Postgres 가 필요하다. 별도 Supabase 테스트 프로젝트를
 * SUPABASE_TEST_* 로 연결하고, 테스트마다 모든 테이블을 비운다.
 * 테스트 프로젝트가 없으면 hasTestDb 가 false 이고, DB 스위트는 skip 된다.
 */

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  /* CI 처럼 .env.local 이 없는 환경 */
}

const prodUrl = process.env.SUPABASE_URL;
const testUrl = process.env.SUPABASE_TEST_URL;
const testKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const testDbUrl = process.env.SUPABASE_TEST_DB_URL;

export const hasTestDb = Boolean(testUrl && testKey && testDbUrl);

/**
 * 연결 문자열에서 Supabase 프로젝트 ref 를 뽑는다.
 * - API URL:      https://<ref>.supabase.co
 * - pooler:       postgresql://postgres.<ref>:…@aws-0-….pooler.supabase.com
 * - 직접 연결:    postgresql://postgres:…@db.<ref>.supabase.co
 */
function projectRef(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const fromUser = /^postgres\.([a-z0-9]+)$/i.exec(u.username);
    if (fromUser) return fromUser[1];
    const fromHost = /^(?:db\.)?([a-z0-9]+)\.supabase\.(?:co|com)$/i.exec(u.hostname);
    if (fromHost && fromHost[1] !== "pooler") return fromHost[1];
    return null;
  } catch {
    return null;
  }
}

if (hasTestDb) {
  const prodRef = projectRef(prodUrl);
  const testRef = projectRef(testUrl);
  const testDbRef = projectRef(testDbUrl);
  const prodDbRef = projectRef(process.env.SUPABASE_DB_URL);

  // 테스트는 매 테스트마다 모든 테이블을 truncate 한다. 대상이 운영이면 실제 데이터가 전부 사라진다.
  // 아래 세 가지를 모두 확인한다. 하나라도 어긋나면 한 줄도 지우지 않고 멈춘다.

  // 1. 테스트 API URL 이 운영과 다른가.
  if (testUrl === prodUrl || (testRef && prodRef && testRef === prodRef)) {
    throw new Error(
      "SUPABASE_TEST_URL 이 운영 SUPABASE_URL 과 같은 프로젝트입니다. 테스트는 모든 테이블을 비우므로 중단합니다."
    );
  }

  // 2. 실제로 truncate 가 접속하는 주소가 운영 프로젝트가 아닌가.
  //    가장 흔한 사고다. 두 연결 문자열은 프로젝트 ref 만 달라서 잘못 붙여넣기 쉽다.
  if (testDbRef && prodDbRef && testDbRef === prodDbRef) {
    throw new Error(
      "SUPABASE_TEST_DB_URL 이 운영 SUPABASE_DB_URL 과 같은 프로젝트를 가리킵니다. " +
        "테스트는 이 주소의 모든 테이블을 비우므로 중단합니다."
    );
  }
  if (testDbRef && prodRef && testDbRef === prodRef) {
    throw new Error(
      "SUPABASE_TEST_DB_URL 이 운영 프로젝트를 가리킵니다. 테스트는 모든 테이블을 비우므로 중단합니다."
    );
  }

  // 3. 테스트 API URL 과 테스트 DB URL 이 같은 프로젝트인가.
  //    둘이 다르면 어느 한쪽이 잘못 들어간 것이므로, 무엇을 지우게 될지 알 수 없다.
  if (testRef && testDbRef && testRef !== testDbRef) {
    throw new Error(
      `SUPABASE_TEST_URL(${testRef}) 과 SUPABASE_TEST_DB_URL(${testDbRef}) 이 서로 다른 프로젝트입니다. ` +
        "설정이 어긋났으므로 중단합니다."
    );
  }

  process.env.SUPABASE_URL = testUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = testKey;
}

/** 자식 → 부모 순서. truncate cascade 라 순서가 필수는 아니지만 읽기 쉽게 둔다. */
const TABLES = [
  "audit_logs",
  "sns_contents", "sns_plans", "sns_intake_responses", "sns_intake_template", "sns_accounts",
  "event_plans", "event_checklist_items", "event_invitees", "events",
  "hidden_builtin_templates", "ppt_templates",
  "reports", "seeding_records", "applicants", "form_configs", "pre_survey_responses", "pre_survey_template",
  "campaigns",
  "profiles",
];

let client: pg.Client | null = null;

async function conn(): Promise<pg.Client> {
  if (!client) {
    client = new pg.Client({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
  }
  return client;
}

export async function resetTestDb(): Promise<void> {
  const c = await conn();
  await c.query(`truncate table ${TABLES.map((t) => `public.${t}`).join(", ")} cascade`);
  // 로그인 계정도 비운다. auth 스키마는 truncate 대상이 아니고, 남아 있으면 아이디가 중복된다.
  // profiles 는 auth.users 를 참조하므로 여기서 지우면 함께 사라진다.
  await c.query("delete from auth.users");
}

export async function closeTestDb(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
  }
}
