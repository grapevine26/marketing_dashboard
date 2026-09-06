import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * E2E 테스트 설정.
 * - 테스트 전용 dev 서버를 3210 포트에 띄우고, DB는 임시 파일(DB_FILE)을 써서
 *   개발 중인 `.data/db.json`을 건드리지 않는다. 매 실행마다 초기 샘플 데이터로 시작한다.
 * - 서버와 DB를 공유하므로 워커 1개로 순차 실행한다.
 */
const PORT = 3210;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const dbDir = path.join(os.tmpdir(), "marketing-mvp-e2e");
fs.mkdirSync(dbDir, { recursive: true });
const DB_FILE = path.join(dbDir, `db-${Date.now()}.json`);

export default defineConfig({
  testDir: "./tests/e2e",
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
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `npx next dev -p ${PORT} --hostname 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DB_FILE,
      GEMINI_API_KEY: "", // 테스트에서는 AI를 호출하지 않는다 (폴백 경로 검증)
    },
  },
});
