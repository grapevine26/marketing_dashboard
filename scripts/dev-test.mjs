#!/usr/bin/env node
/**
 * 테스트 DB 로 개발 서버를 띄운다.
 *
 *   npm run dev:test        → http://localhost:3401
 *
 * **왜 따로 있나** — `npm run dev` 는 `.env.local` 을 읽어 **운영 DB** 에 붙는다. 화면을
 * 눌러보며 확인하려면 캠페인을 만들고 지원자를 넣고 상태를 바꿔야 하는데, 그게 전부
 * 운영 데이터에 그대로 남는다. 실사용자가 쓰는 곳이라 그러면 안 된다.
 *
 * 그래서 E2E 와 같은 방식으로 환경변수를 테스트 프로젝트 값으로 덮어쓴다. Next 는 이미 있는
 * process.env 를 .env.local 로 덮지 않으므로 여기서 넣은 값이 이긴다
 * (playwright.config.ts 의 webServer.env 와 같은 원리).
 *
 * 포트는 3401 이다. 3000(운영 dev)과 3400(E2E)에 겹치지 않게 띄워, 어느 창이 어느 DB 를
 * 보고 있는지 포트만으로 구분되게 한다.
 *
 * **데이터는 E2E 가 남긴 것을 그대로 쓴다.** 비우지 않는다 — 비우는 것은 E2E 의 몫이고,
 * 여기서까지 비우면 눌러보던 상태가 사라진다. 계정은 e2e_owner 다(tests/e2e/env.ts).
 */
import { spawn } from "child_process";
import path from "path";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  /* 셸 환경변수를 쓴다 */
}

/** 연결 문자열에서 Supabase 프로젝트 ref 를 뽑는다. (tests/e2e/env.ts 와 같은 규칙) */
function projectRef(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const fromUser = /^postgres\.([a-z0-9]+)$/i.exec(u.username);
    if (fromUser) return fromUser[1] ?? null;
    const fromHost = /^(?:db\.)?([a-z0-9]+)\.supabase\.(?:co|com)$/i.exec(u.hostname);
    if (fromHost?.[1] && fromHost[1] !== "pooler") return fromHost[1];
    return null;
  } catch {
    return null;
  }
}

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const dbUrl = process.env.SUPABASE_TEST_DB_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY || serviceRoleKey;

const 없는것 = [
  ["SUPABASE_TEST_URL", url],
  ["SUPABASE_TEST_SERVICE_ROLE_KEY", serviceRoleKey],
  ["SUPABASE_TEST_DB_URL", dbUrl],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (없는것.length > 0) {
  console.error(`테스트 프로젝트 환경변수가 없습니다: ${없는것.join(", ")}`);
  console.error(".env.local 을 확인하세요.");
  process.exit(1);
}

// **운영을 가리키면 멈춘다.** 이 서버로 눌러보는 것은 전부 쓰기다. 대상이 운영이면
// 확인하려다 실사용 데이터를 어지럽힌다. E2E 와 같은 기준으로 막는다.
const 운영 = projectRef(process.env.SUPABASE_URL);
const 운영DB = projectRef(process.env.SUPABASE_DB_URL);
const 테스트 = projectRef(url);
const 테스트DB = projectRef(dbUrl);

if (url === process.env.SUPABASE_URL || (테스트 && 운영 && 테스트 === 운영)) {
  console.error("SUPABASE_TEST_URL 이 운영 프로젝트와 같습니다. 중단합니다.");
  process.exit(1);
}
if (테스트DB && (운영DB || 운영) && (테스트DB === 운영DB || 테스트DB === 운영)) {
  console.error("SUPABASE_TEST_DB_URL 이 운영 프로젝트를 가리킵니다. 중단합니다.");
  process.exit(1);
}
if (테스트 && 테스트DB && 테스트 !== 테스트DB) {
  console.error(`SUPABASE_TEST_URL(${테스트}) 과 SUPABASE_TEST_DB_URL(${테스트DB}) 이 다른 프로젝트입니다. 중단합니다.`);
  process.exit(1);
}

const PORT = process.env.DEV_TEST_PORT || "3401";
console.log(`테스트 DB 로 개발 서버를 띄웁니다 → http://localhost:${PORT}  (프로젝트 ${테스트})`);
console.log("운영 데이터는 건드리지 않습니다. 로그인 계정은 e2e_owner 입니다.");

const child = spawn("npx", ["next", "dev", "-p", PORT], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    SUPABASE_ANON_KEY: anonKey,
    SUPABASE_DB_URL: dbUrl,
    // 확인용 서버가 운영 저장소에 파일을 섞지 않게 한다. E2E 와 같은 방어다.
    BLOB_READ_WRITE_TOKEN: "",
    BLOB_STORE_ID: "",
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
