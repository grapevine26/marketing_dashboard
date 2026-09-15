import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, OWNER_STATE_FILE, PORT, loadTestEnv } from "./tests/e2e/env";

/**
 * E2E 테스트 설정.
 *
 * - dev 서버를 **3400 포트**에 띄운다. 데이터는 **테스트 Supabase 프로젝트**(SUPABASE_TEST_*)만 쓴다.
 *   운영 키(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)는 서버 환경에서 테스트 값으로 덮어쓴다.
 *   Next 는 이미 있는 process.env 를 .env.local 로 덮지 않으므로 이 값이 이긴다.
 * - tests/e2e/global-setup.ts 가 매 실행마다 테스트 DB 를 비우고, 마이그레이션을 적용하고,
 *   e2e_owner 계정을 만들어 실제 로그인 화면으로 로그인한 뒤 storageState 를 저장한다.
 *   모든 spec 은 그 storageState(로그인된 상태)로 시작한다. 로그인 없이 검증해야 하는 공개 링크
 *   spec 은 `test.use({ storageState: { cookies: [], origins: [] } })` 로 빈 컨텍스트를 쓴다.
 * - 서버와 DB 를 공유하므로 워커 1개로 순차 실행한다.
 *
 * **유닛 테스트(`npm test`)와 동시에 돌리지 마라.** 둘 다 같은 테스트 프로젝트의 모든 테이블을
 * 비운다(tests/unit/test-db.ts). 겹치면 e2e 가 만든 로그인 계정이 중간에 지워져, 그때부터 모든
 * 화면이 /login 으로 튕기면서 관계없는 테스트가 무더기로 깨진다. 원인을 찾기 아주 어려운 모양이라
 * CI 에서도 needs 와 같은 concurrency group 으로 막아 뒀다(.github/workflows/ci.yml).
 *
 * 필요한 환경변수는 tests/e2e/env.ts 상단 주석 참고. 특히 **SUPABASE_TEST_ANON_KEY** 가
 * 없으면 service_role 키가 anon 자리에 들어간다. 그래도 테스트는 전부 통과하므로 **어긋난 줄
 * 모른 채 운영과 다른 권한으로 검증하게 된다.** .env.local 과 CI Secrets 양쪽에 넣어 둘 것.
 */
const testEnv = loadTestEnv();

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: OWNER_STATE_FILE,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      SUPABASE_URL: testEnv.url,
      SUPABASE_SERVICE_ROLE_KEY: testEnv.serviceRoleKey,
      SUPABASE_ANON_KEY: testEnv.anonKey ?? testEnv.serviceRoleKey,
      // 운영 DB 주소가 앱에 흘러들지 않게 테스트 주소로 덮는다 (백업 스크립트 등이 읽는다).
      SUPABASE_DB_URL: testEnv.dbUrl,
      GEMINI_API_KEY: "", // 테스트에서는 AI 를 호출하지 않는다 (폴백 경로 검증)
      // .env.local 에 Blob 토큰이 들어와도 e2e 가 만든 파일이 운영 저장소에 섞이지 않게 한다.
      // 유닛 테스트(tests/unit/setup.ts)에는 같은 방어가 이미 있다.
      BLOB_READ_WRITE_TOKEN: "",
      BLOB_STORE_ID: "",
    },
  },
});
