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

if (hasTestDb) {
  // 운영 프로젝트를 테스트 DB 로 잘못 지정하면 테스트가 운영 데이터를 전부 지운다.
  if (testUrl === prodUrl) {
    throw new Error(
      "SUPABASE_TEST_URL 이 운영 SUPABASE_URL 과 같습니다. 테스트는 모든 테이블을 비우므로 중단합니다."
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
}

export async function closeTestDb(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
  }
}
