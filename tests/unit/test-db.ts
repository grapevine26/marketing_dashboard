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
    // 캡처 못 했으면 ref 를 모른다는 뜻이다. null 로 떨어뜨려 검사가 막히는 쪽으로 둔다.
    if (fromUser) return fromUser[1] ?? null;
    const fromHost = /^(?:db\.)?([a-z0-9]+)\.supabase\.(?:co|com)$/i.exec(u.hostname);
    if (fromHost?.[1] && fromHost[1] !== "pooler") return fromHost[1];
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

  // 2-1. 애초에 ref 를 읽어내지 못하면 위 두 검사가 통째로 무력해진다.
  //      `projectRef` 가 null 을 돌려주면 비교문이 전부 false 가 되어 조용히 통과한다.
  //      주소 형식이 바뀌거나 자체 호스팅 Postgres 를 붙이는 날이 그 날이다.
  //      확인하지 못했으면 통과가 아니라 중단이다.
  if (!testDbRef) {
    throw new Error(
      "SUPABASE_TEST_DB_URL 에서 Supabase 프로젝트 ref 를 읽지 못했습니다. " +
        "운영인지 확인할 수 없으므로 중단합니다. 주소 형식을 확인하세요."
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
  "auth_throttle", "signup_invites",
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

/**
 * 이 DB 가 정말 테스트용인지 DB 안에서 직접 확인한다.
 *
 * 위쪽 검사는 전부 **환경변수를 서로 비교하는** 방식이다. `.env.local` 을 통째로
 * 운영 값으로 덮어쓰면 셋 다 사이좋게 통과한다(운영 URL 을 SUPABASE_TEST_* 에도
 * 넣으면 "테스트와 운영이 다른가"가 아니라 "테스트와 테스트가 다른가"를 묻게 된다).
 *
 * 그래서 마지막 관문은 DB 안에 둔다. 테스트 프로젝트에만 손으로 만들어 둔 표식
 * 테이블이 있어야 truncate 를 한다. 운영에는 이 테이블이 없으므로, 주소를 아무리
 * 잘못 넣어도 한 줄도 지워지지 않는다. 없으면 통과가 아니라 중단이다.
 */
const MARKER_TABLE = "test_db_marker";
let markerChecked = false;

async function assertTestDatabase(c: pg.Client): Promise<void> {
  if (markerChecked) return;
  const { rows } = await c.query(
    "select to_regclass($1) is not null as found",
    [`public.${MARKER_TABLE}`]
  );
  if (!rows[0]?.found) {
    const lines = [
      `이 데이터베이스에 표식 테이블 public.${MARKER_TABLE} 이 없습니다.`,
      "테스트는 모든 테이블을 비우므로, 테스트 DB 임이 확인되지 않으면 실행하지 않습니다.",
      "테스트 Supabase 프로젝트의 SQL 편집기에서 아래를 한 번 실행하세요:",
      `  create table public.${MARKER_TABLE} (note text);`,
      `  alter table public.${MARKER_TABLE} enable row level security;`,
    ];
    throw new Error(lines.join("\n"));
  }
  markerChecked = true;
}

export async function resetTestDb(): Promise<void> {
  const c = await conn();
  await assertTestDatabase(c);
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
