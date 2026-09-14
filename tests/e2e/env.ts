import path from "path";

/**
 * E2E 가 쓰는 환경값. playwright.config.ts 와 global-setup.ts 가 함께 쓴다.
 *
 * E2E 는 **테스트 Supabase 프로젝트**(SUPABASE_TEST_*)만 쓴다. 매 실행마다 그 프로젝트의
 * 모든 테이블을 비우고 계정을 지우므로, 운영 프로젝트를 가리키는 순간 실제 데이터가 사라진다.
 * 그래서 tests/unit/test-db.ts 와 같은 3중 가드를 여기서도 건다. 하나라도 어긋나면 config 를
 * 읽는 단계에서 바로 멈춘다.
 *
 * 필요한 환경변수 (.env.local 또는 CI secrets):
 *   SUPABASE_TEST_URL               테스트 프로젝트 API URL
 *   SUPABASE_TEST_SERVICE_ROLE_KEY  테스트 프로젝트 service_role 키 (데이터 시드·계정 생성)
 *   SUPABASE_TEST_DB_URL            테스트 프로젝트 Session pooler 주소 (truncate·마이그레이션)
 *   SUPABASE_TEST_ANON_KEY          테스트 프로젝트 anon 키 (로그인). **아직 .env.local 에 없다.**
 *                                   없으면 service_role 키를 anon 자리에 대신 넣어 로그인시킨다.
 *                                   테스트 프로젝트 한정이고 키가 브라우저로 나가지는 않지만,
 *                                   운영과 같은 경로로 검증하려면 Supabase 대시보드
 *                                   (Settings → API → anon public) 값을 넣어 두는 것이 맞다.
 */

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  /* CI 처럼 .env.local 이 없는 환경. 셸 환경변수를 그대로 쓴다. */
}

/** 서버는 이 포트만 쓴다. 개발 서버(3000)와 겹치지 않게 고정. */
export const PORT = 3400;
export const BASE_URL = `http://localhost:${PORT}`;

export const AUTH_DIR = path.join(process.cwd(), "tests", "e2e", ".auth");
export const OWNER_STATE_FILE = path.join(AUTH_DIR, "owner.json");
export const SEED_FILE = path.join(AUTH_DIR, "seed.json");

/** E2E 전용 계정. 매 실행마다 auth.users 를 비우고 새로 만든다. */
export const E2E_OWNER = {
  username: "e2e_owner",
  email: "e2e_owner@moa.local",
  password: "e2e-owner-pass-2026!",
  displayName: "E2E 대표 관리자",
} as const;

/**
 * 연결 문자열에서 Supabase 프로젝트 ref 를 뽑는다. (tests/unit/test-db.ts 와 같은 로직)
 * - API URL:      https://<ref>.supabase.co
 * - pooler:       postgresql://postgres.<ref>:…@aws-0-….pooler.supabase.com
 * - 직접 연결:    postgresql://postgres:…@db.<ref>.supabase.co
 */
export function projectRef(raw: string | undefined): string | null {
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

export interface TestEnv {
  url: string;
  serviceRoleKey: string;
  dbUrl: string;
  /** SUPABASE_TEST_ANON_KEY. 없으면 null — 그때는 service_role 키로 대신 로그인한다. */
  anonKey: string | null;
}

/**
 * 테스트 프로젝트 환경값을 읽고 운영 프로젝트와 겹치지 않는지 확인한다.
 * 값이 빠졌거나 운영을 가리키면 throw 한다. E2E 는 DB 없이는 의미가 없으므로 skip 하지 않는다.
 */
export function loadTestEnv(): TestEnv {
  const prodUrl = process.env.SUPABASE_URL;
  const prodDbUrl = process.env.SUPABASE_DB_URL;
  const url = process.env.SUPABASE_TEST_URL;
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_TEST_DB_URL;
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY || null;

  const missing = [
    ["SUPABASE_TEST_URL", url],
    ["SUPABASE_TEST_SERVICE_ROLE_KEY", serviceRoleKey],
    ["SUPABASE_TEST_DB_URL", dbUrl],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0 || !url || !serviceRoleKey || !dbUrl) {
    throw new Error(`E2E 에 필요한 환경변수가 없습니다: ${missing.join(", ")} (.env.local 또는 CI secrets)`);
  }

  const prodRef = projectRef(prodUrl);
  const prodDbRef = projectRef(prodDbUrl);
  const testRef = projectRef(url);
  const testDbRef = projectRef(dbUrl);

  // 1. 테스트 API URL 이 운영과 다른가.
  if (url === prodUrl || (testRef && prodRef && testRef === prodRef)) {
    throw new Error(
      "SUPABASE_TEST_URL 이 운영 SUPABASE_URL 과 같은 프로젝트입니다. E2E 는 모든 테이블을 비우므로 중단합니다."
    );
  }
  // 2. truncate 가 실제로 접속하는 주소가 운영이 아닌가.
  if (testDbRef && prodDbRef && testDbRef === prodDbRef) {
    throw new Error(
      "SUPABASE_TEST_DB_URL 이 운영 SUPABASE_DB_URL 과 같은 프로젝트를 가리킵니다. E2E 는 이 주소의 모든 테이블을 비우므로 중단합니다."
    );
  }
  if (testDbRef && prodRef && testDbRef === prodRef) {
    throw new Error("SUPABASE_TEST_DB_URL 이 운영 프로젝트를 가리킵니다. E2E 는 모든 테이블을 비우므로 중단합니다.");
  }
  // 3. 테스트 API URL 과 테스트 DB URL 이 같은 프로젝트인가.
  if (testRef && testDbRef && testRef !== testDbRef) {
    throw new Error(
      `SUPABASE_TEST_URL(${testRef}) 과 SUPABASE_TEST_DB_URL(${testDbRef}) 이 서로 다른 프로젝트입니다. 설정이 어긋났으므로 중단합니다.`
    );
  }

  return { url, serviceRoleKey, dbUrl, anonKey };
}
