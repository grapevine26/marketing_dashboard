#!/usr/bin/env node
/**
 * Supabase 데이터 백업과 복원.
 *
 *   npm run db:backup                          → 전체 테이블을 JSON 한 파일로 내려받는다
 *   npm run db:backup -- --list                → 받아둔 백업 목록
 *   npm run db:backup -- --restore <파일> --yes → 그 백업으로 되돌린다 (현재 데이터를 전부 지운다)
 *
 * 대상은 기본이 운영(SUPABASE_DB_URL)이고, `--test` 를 붙이면 테스트 프로젝트다.
 *
 * Supabase 플랜에 따라 자동 백업이 없을 수 있어서 둔다. 중요한 작업 전에 한 번 받아두면
 * 실수로 지웠을 때 되돌릴 수 있다.
 */
import fs from "fs";
import path from "path";
import pg from "pg";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  /* 셸 환경변수를 쓴다 */
}

/**
 * date 컬럼(oid 1082)을 문자열 그대로 받는다.
 *
 * 기본값은 자바스크립트 Date 객체인데, 그걸 JSON 으로 쓰면 현지 자정이 UTC 기준 전날로
 * 바뀐다(한국은 -9시간). 그 상태로 복원하면 날짜가 하루씩 밀린다. 업로드 기한과
 * 체크리스트 마감일이 실제로 하루 당겨지는 걸 확인했다.
 * timestamptz(1184)는 시점 자체라 변환해도 값이 보존되므로 건드리지 않는다.
 */
pg.types.setTypeParser(1082, (v) => v);

const args = process.argv.slice(2);
const isTest = args.includes("--test");
const wantList = args.includes("--list");
const restoreIdx = args.indexOf("--restore");
const restoreTarget = restoreIdx >= 0 ? args[restoreIdx + 1] : null;
const confirmed = args.includes("--yes");

const envName = isTest ? "SUPABASE_TEST_DB_URL" : "SUPABASE_DB_URL";
const url = process.env[envName];
if (!url) {
  console.error(`${envName} 이 .env.local 에 없습니다.`);
  process.exit(1);
}

const backupDir = path.join(process.cwd(), ".data", "backups");

/** 부모 → 자식 순서. 복원할 때 이 순서로 넣어야 외래키가 걸리지 않는다. */
const TABLES = [
  "campaigns",
  "pre_survey_template",
  "pre_survey_responses",
  "form_configs",
  "applicants",
  "seeding_records",
  "reports",
  "ppt_templates",
  "hidden_builtin_templates",
  "events",
  "event_invitees",
  "event_checklist_items",
  "event_plans",
  "sns_accounts",
  "sns_intake_template",
  "sns_intake_responses",
  "sns_plans",
  "sns_contents",
  "audit_logs",
];

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((f) => /^supabase-\d{8}-\d{6}\.json$/.test(f))
    .sort()
    .reverse()
    .map((f) => ({ file: f, size: fs.statSync(path.join(backupDir, f)).size }));
}

if (wantList) {
  const all = listBackups();
  if (all.length === 0) {
    console.log(`백업이 없습니다. (${backupDir})\nnpm run db:backup 으로 하나 받아두세요.`);
  } else {
    console.log(`백업 ${all.length}개 (${backupDir}):`);
    for (const b of all) console.log(`  ${b.file}  ${(b.size / 1024).toFixed(0)} KB`);
  }
  process.exit(0);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  if (restoreTarget) {
    // ---------- 복원 ----------
    const src = path.isAbsolute(restoreTarget) ? restoreTarget : path.join(backupDir, restoreTarget);
    if (!fs.existsSync(src)) {
      console.error(`백업 파일을 찾을 수 없습니다: ${src}`);
      process.exit(1);
    }
    const dump = JSON.parse(fs.readFileSync(src, "utf-8"));
    if (!dump.tables) {
      console.error("백업 파일 형식이 올바르지 않습니다.");
      process.exit(1);
    }

    const counts = Object.entries(dump.tables).filter(([, rows]) => rows.length > 0);
    console.log(`복원 대상: ${isTest ? "테스트" : "운영"} (${new URL(url).hostname})`);
    console.log(`백업 시각: ${dump.created_at}`);
    console.log(`담긴 행  : ${counts.map(([t, r]) => `${t}=${r.length}`).join(" ") || "(없음)"}`);

    if (!confirmed) {
      console.error(
        "\n이 작업은 현재 데이터를 전부 지우고 백업 내용으로 덮어씁니다. 되돌릴 수 없습니다." +
          "\n실행하려면 --yes 를 붙이세요."
      );
      process.exit(1);
    }

    // 덮어쓰기 전에 지금 상태를 먼저 받아둔다. 복원이 잘못돼도 돌아올 자리가 있어야 한다.
    const safety = await dumpAll();
    const safetyPath = writeDump(safety, "pre-restore");
    console.log(`\n현재 상태를 먼저 보관했습니다: ${safetyPath}`);

    await client.query("begin");
    try {
      await client.query(`truncate table ${TABLES.map((t) => `public.${t}`).join(", ")} cascade`);
      for (const table of TABLES) {
        const rows = dump.tables[table] || [];
        for (const row of rows) {
          const cols = Object.keys(row);
          if (cols.length === 0) continue;
          const params = cols.map((_, i) => `$${i + 1}`).join(", ");
          const values = cols.map((c) => (row[c] !== null && typeof row[c] === "object" ? JSON.stringify(row[c]) : row[c]));
          await client.query(
            `insert into public.${table} (${cols.map((c) => `"${c}"`).join(", ")}) values (${params})`,
            values
          );
        }
        if (rows.length) console.log(`  ${table}: ${rows.length}행`);
      }
      await client.query("commit");
      console.log("\n복원 완료.");
    } catch (err) {
      await client.query("rollback");
      console.error(`\n복원 실패, 아무것도 바뀌지 않았습니다:\n${err.message}`);
      process.exit(1);
    }
  } else {
    // ---------- 백업 ----------
    const dump = await dumpAll();
    const dest = writeDump(dump);
    const total = Object.values(dump.tables).reduce((a, r) => a + r.length, 0);
    console.log(`백업 완료 (${isTest ? "테스트" : "운영"}): ${dest}`);
    console.log(`전체 ${total}행`);
    const nonEmpty = Object.entries(dump.tables).filter(([, r]) => r.length > 0);
    if (nonEmpty.length) console.log(nonEmpty.map(([t, r]) => `  ${t}: ${r.length}`).join("\n"));
  }
} finally {
  await client.end();
}

async function dumpAll() {
  const tables = {};
  for (const table of TABLES) {
    const { rows } = await client.query(`select * from public.${table}`);
    tables[table] = rows;
  }
  return { created_at: new Date().toISOString(), source: new URL(url).hostname, tables };
}

function writeDump(dump, prefix = "supabase") {
  fs.mkdirSync(backupDir, { recursive: true });
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const name = `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}.json`;
  const dest = path.join(backupDir, name);
  fs.writeFileSync(dest, JSON.stringify(dump, null, 2), "utf-8");
  return dest;
}
