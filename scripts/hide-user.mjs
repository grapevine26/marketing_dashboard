#!/usr/bin/env node
/**
 * 계정을 사용자 관리 목록에서 감추거나 다시 보이게 한다.
 *
 *   npm run db:hide-user -- --list           숨긴 계정 목록
 *   npm run db:hide-user <아이디>             감춘다
 *   npm run db:hide-user <아이디> -- --show   다시 보이게 한다
 *   (뒤에 --test 를 붙이면 테스트 프로젝트)
 *
 * 개발자가 점검용으로 쓰는 계정을 위한 것이다. 고객이 보는 목록에 섞이면 혼란스럽다.
 *
 * **이 스위치를 화면에 두지 않는 이유**: 숨김 버튼이 사용자 관리 화면에 있으면
 * 그 버튼과 대상이 목록에 드러나야 한다. 그러면 감추는 의미가 없다. 그래서 명령으로만 바꾼다.
 *
 * 숨긴 계정도 권한은 그대로다. 대표 관리자면 여전히 모든 것을 할 수 있고,
 * 마지막 대표 관리자 보호 같은 규칙에도 그대로 들어간다. 목록에만 안 보일 뿐이다.
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
const wantList = args.includes("--list");
const unhide = args.includes("--show");
const username = args.find((a) => !a.startsWith("--"));

const envName = isTest ? "SUPABASE_TEST_DB_URL" : "SUPABASE_DB_URL";
const url = process.env[envName];
if (!url) {
  console.error(`${envName} 이 .env.local 에 없습니다.`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  if (wantList) {
    const { rows } = await client.query(
      "select username, display_name, role, status from public.profiles where hidden = true order by created_at"
    );
    if (rows.length === 0) {
      console.log(`숨긴 계정이 없습니다. (${isTest ? "테스트" : "운영"})`);
    } else {
      console.log(`숨긴 계정 ${rows.length}개 (${isTest ? "테스트" : "운영"}):`);
      for (const r of rows) {
        console.log(`  ${r.username.padEnd(16)} ${r.display_name.padEnd(14)} ${r.role.padEnd(6)} ${r.status}`);
      }
      console.log("\n이 계정들은 사용자 관리 화면에 나오지 않습니다. 권한은 그대로입니다.");
    }
    process.exit(0);
  }

  if (!username) {
    console.error("아이디를 적어주세요.\n  npm run db:hide-user <아이디>\n  npm run db:hide-user -- --list");
    process.exit(1);
  }

  const { rows } = await client.query(
    "select id, username, display_name, role, status, hidden from public.profiles where username = $1",
    [username]
  );
  if (rows.length === 0) {
    console.error(`"${username}" 계정을 찾을 수 없습니다.`);
    process.exit(1);
  }

  const target = rows[0];
  const next = !unhide;
  if (target.hidden === next) {
    console.log(`"${username}" 은(는) 이미 ${next ? "숨긴" : "보이는"} 상태입니다. 바꿀 것이 없습니다.`);
    process.exit(0);
  }

  await client.query("update public.profiles set hidden = $2 where id = $1", [target.id, next]);
  console.log(`"${target.display_name}" (@${username}) 계정을 ${next ? "목록에서 감췄습니다" : "다시 보이게 했습니다"}.`);
  console.log(`  등급 ${target.role} / 상태 ${target.status} 는 그대로입니다.`);
  if (next) {
    console.log("\n사용자 관리 화면에 더 이상 나오지 않습니다. 로그인과 권한은 영향이 없습니다.");
    console.log("되돌리려면: npm run db:hide-user " + username + " -- --show");
  }
} finally {
  await client.end();
}
