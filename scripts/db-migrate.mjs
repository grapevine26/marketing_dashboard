#!/usr/bin/env node
/**
 * supabase/migrations/*.sql 을 이름순으로 적용한다.
 *   npm run db:migrate            → SUPABASE_DB_URL (운영)
 *   npm run db:migrate -- --test  → SUPABASE_TEST_DB_URL (테스트 프로젝트)
 *
 * 적용한 파일은 schema_migrations 에 기록하고 다시 실행하지 않는다.
 * Supabase CLI 인증 없이도 돌릴 수 있게 pg 로 직접 연결한다.
 * 연결 문자열은 Session pooler 주소를 써야 한다. 직접 연결 주소는 IPv6 전용이다.
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import { dbSsl } from "./db-ssl.mjs";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  /* .env.local 이 없으면 셸 환경변수를 쓴다 */
}

const isTest = process.argv.includes("--test");
const envName = isTest ? "SUPABASE_TEST_DB_URL" : "SUPABASE_DB_URL";
const url = process.env[envName];
if (!url) {
  console.error(`${envName} 이 .env.local 에 없습니다.`);
  process.exit(1);
}

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: dbSsl() });
await client.connect();
try {
  await client.query(`create table if not exists public.schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);
  const { rows } = await client.query("select name from public.schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  let count = 0;
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf-8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public.schema_migrations (name) values ($1)", [f]);
      await client.query("commit");
      console.log(`적용: ${f}`);
      count++;
    } catch (err) {
      await client.query("rollback");
      console.error(`실패: ${f}\n${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }
  if (count > 0) {
    // PostgREST 는 스키마를 캐시한다. 알리지 않으면 새 테이블이 REST 에서 한동안 보이지 않는다.
    await client.query("notify pgrst, 'reload schema'");
  }
  console.log(
    count === 0
      ? `적용할 마이그레이션이 없습니다. (${isTest ? "테스트" : "운영"})`
      : `${count}개 적용 완료 (${isTest ? "테스트" : "운영"}).`
  );
} finally {
  await client.end();
}
