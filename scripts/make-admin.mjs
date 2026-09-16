#!/usr/bin/env node
/**
 * 첫 대표 관리자를 만든다.
 *
 *   npm run db:make-admin <아이디> -- --test    테스트 프로젝트
 *   npm run db:make-admin <아이디> -- --prod    운영 (손으로 적어야 한다)
 *
 * 등급 변경은 대표 관리자만 할 수 있는데, 처음에는 대표가 하나도 없다.
 * 그 닭과 달걀을 푸는 스크립트다. 평범하게 가입한 뒤 이 명령으로 대표 겸 활성으로 올린다.
 * Supabase 대시보드에서 손으로 고치는 것보다 안전하고, 무엇이 바뀌는지 눈에 보인다.
 *
 * 두 번째부터는 앱 안의 사용자 관리 화면에서 한다.
 */
import path from "path";
import pg from "pg";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  /* 셸 환경변수를 쓴다 */
}

const args = process.argv.slice(2);
const isTest = args.includes("--test");
const allowProd = args.includes("--prod");
const username = args.find((a) => !a.startsWith("--"));

if (!username) {
  console.error("아이디를 적어주세요.");
  console.error("  npm run db:make-admin <아이디> -- --test    (테스트)");
  console.error("  npm run db:make-admin <아이디> -- --prod    (운영)");
  process.exit(1);
}

/**
 * 운영 DB 를 바꾸는 것을 막는 빗장. db-backup.mjs 의 requireProdFlag 와 같은 규칙이다.
 *
 * 이 스크립트는 **대상이 기본값으로 운영**이다. 그래서 `npm run db:make-admin <아이디>`
 * 를 그냥 치면 운영 계정이 그 자리에서 대표 관리자 겸 활성으로 올라간다. 테스트에
 * 돌리려던 명령에서 `--test` 한 단어만 빠져도 사고가 나고, 되돌리려면 다시 DB 를 만져야 한다.
 *
 * 읽기(계정 조회, 목록 보기)는 그대로 둔다. 막아야 하는 것은 쓰기다.
 */
function requireProdFlag(what) {
  if (isTest || allowProd) return;
  console.error("");
  console.error(`${what} 작업은 운영 데이터베이스를 바꿉니다.`);
  console.error("테스트에 하려던 것이면 --test 를, 정말 운영에 할 것이면 --prod 를 붙이세요.");
  console.error(`  예) npm run db:make-admin ${username} -- --prod`);
  process.exit(1);
}

const envName = isTest ? "SUPABASE_TEST_DB_URL" : "SUPABASE_DB_URL";
const url = process.env[envName];
if (!url) {
  console.error(`${envName} 이 .env.local 에 없습니다.`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows } = await client.query(
    "select id, username, display_name, role, status from public.profiles where username = $1",
    [username]
  );
  if (rows.length === 0) {
    console.error(`"${username}" 계정을 찾을 수 없습니다.`);
    console.error("먼저 /signup 에서 가입한 뒤 다시 실행하세요.");
    const all = await client.query("select username, status, role from public.profiles order by created_at");
    if ((all.rowCount ?? 0) > 0) {
      console.error("\n등록된 계정:");
      for (const r of all.rows) console.error(`  ${r.username}  (${r.status}, ${r.role})`);
    } else {
      console.error("\n아직 가입한 계정이 없습니다.");
    }
    process.exit(1);
  }

  const before = rows[0];
  if (before.role === "owner" && before.status === "active") {
    console.log(`"${username}" 은(는) 이미 활성 대표 관리자입니다. 바꿀 것이 없습니다.`);
    process.exit(0);
  }

  // 여기까지는 읽기만 했다. 실제로 바꾸기 직전에 빗장을 확인한다.
  // 앞에 두면 "계정을 못 찾았다 / 이미 대표다" 같은 안내조차 --prod 없이는 못 보게 된다.
  requireProdFlag(`"${username}" 을(를) 대표 관리자로 올리는`);

  await client.query(
    "update public.profiles set role = 'owner', status = 'active', approved_at = coalesce(approved_at, now()) where id = $1",
    [before.id]
  );
  console.log(`"${before.display_name}" (@${username}) 계정을 대표 관리자로 올렸습니다.`);
  console.log(`  역할 ${before.role} → owner`);
  console.log(`  상태 ${before.status} → active`);
  console.log(`\n이제 로그인해서 설정 > 사용자 관리에서 다른 사람을 승인할 수 있습니다. (${isTest ? "테스트" : "운영"})`);
} finally {
  await client.end();
}
