#!/usr/bin/env node
/**
 * Supabase 데이터 백업과 복원.
 *
 *   npm run db:backup                          → 전체 테이블을 JSON 한 파일로 내려받는다
 *   npm run db:backup -- --list                → 받아둔 백업 목록
 *   npm run db:backup -- --restore <파일> --yes → 그 백업으로 되돌린다 (현재 데이터를 전부 지운다)
 *
 * 캠페인 하나만 되살리기 (지금 데이터는 건드리지 않고 그 캠페인만 다시 넣는다):
 *   npm run db:backup -- --from <파일> --campaigns              → 백업에 담긴 캠페인 목록
 *   npm run db:backup -- --from <파일> --campaign <이름|id> --yes → 그 캠페인만 복구
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
const argAfter = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] ?? null : null;
};
const isTest = args.includes("--test");
const wantList = args.includes("--list");
const restoreTarget = argAfter("--restore");
const fromFile = argAfter("--from");
const listCampaigns = args.includes("--campaigns");
const campaignTarget = argAfter("--campaign");
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

/** 백업 파일을 읽는다. 경로는 절대경로거나 .data/backups 안의 파일명. */
function loadDump(name) {
  const src = path.isAbsolute(name) ? name : path.join(backupDir, name);
  if (!fs.existsSync(src)) {
    console.error(`백업 파일을 찾을 수 없습니다: ${src}`);
    process.exit(1);
  }
  const dump = JSON.parse(fs.readFileSync(src, "utf-8"));
  if (!dump.tables) {
    console.error("백업 파일 형식이 올바르지 않습니다.");
    process.exit(1);
  }
  return { dump, src };
}

/** 한 행을 넣는다. 이미 같은 id 가 있으면 건너뛴다. */
async function insertRow(table, row) {
  const cols = Object.keys(row);
  if (cols.length === 0) return false;
  const params = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((c) => (row[c] !== null && typeof row[c] === "object" ? JSON.stringify(row[c]) : row[c]));
  const res = await client.query(
    `insert into public.${table} (${cols.map((c) => `"${c}"`).join(", ")}) values (${params}) on conflict do nothing`,
    values
  );
  return res.rowCount > 0;
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  if (fromFile && (listCampaigns || campaignTarget)) {
    // ---------- 캠페인 하나만 되살리기 ----------
    const { dump, src } = loadDump(fromFile);
    const campaigns = dump.tables.campaigns || [];

    if (listCampaigns) {
      console.log(`백업: ${path.basename(src)} (${dump.created_at})`);
      if (campaigns.length === 0) {
        console.log("담긴 캠페인이 없습니다.");
      } else {
        console.log(`담긴 캠페인 ${campaigns.length}개:`);
        for (const c of campaigns) {
          const apps = (dump.tables.applicants || []).filter((a) => a.campaign_id === c.id).length;
          const evs = (dump.tables.events || []).filter((e) => e.campaign_id === c.id).length;
          console.log(`  ${c.name}  [${c.company_name}]  지원자 ${apps}명, 행사 ${evs}건`);
          console.log(`    id: ${c.id}`);
        }
        console.log(`\n복구: npm run db:backup -- --from ${path.basename(src)} --campaign "<이름 또는 id>" --yes`);
      }
      process.exit(0);
    }

    const needle = campaignTarget.toLowerCase();
    const matches = campaigns.filter(
      (c) => c.id.toLowerCase() === needle || c.name.toLowerCase().includes(needle)
    );
    if (matches.length === 0) {
      console.error(`백업에서 "${campaignTarget}" 에 해당하는 캠페인을 찾지 못했습니다.`);
      console.error(`담긴 캠페인을 보려면: npm run db:backup -- --from ${path.basename(src)} --campaigns`);
      process.exit(1);
    }
    if (matches.length > 1) {
      console.error(`"${campaignTarget}" 에 해당하는 캠페인이 ${matches.length}개입니다. id 로 정확히 지정하세요.`);
      for (const c of matches) console.error(`  ${c.name}  id: ${c.id}`);
      process.exit(1);
    }

    const camp = matches[0];
    const exists = await client.query("select 1 from public.campaigns where id = $1", [camp.id]);
    if (exists.rowCount > 0) {
      console.error(`이 캠페인은 이미 DB 에 있습니다: ${camp.name} (${camp.id})`);
      console.error("지워진 캠페인만 되살릴 수 있습니다. 덮어쓰지 않습니다.");
      process.exit(1);
    }

    // 캠페인에 딸린 것만 추린다. 부모 → 자식 순서.
    const T = dump.tables;
    const applicants = (T.applicants || []).filter((r) => r.campaign_id === camp.id);
    const events = (T.events || []).filter((r) => r.campaign_id === camp.id);
    const eventIds = new Set(events.map((e) => e.id));
    const applicantIds = new Set(applicants.map((a) => a.id));
    const plan = [
      ["campaigns", [camp]],
      ["form_configs", (T.form_configs || []).filter((r) => r.campaign_id === camp.id)],
      ["pre_survey_responses", (T.pre_survey_responses || []).filter((r) => r.campaign_id === camp.id)],
      ["applicants", applicants],
      ["seeding_records", (T.seeding_records || []).filter((r) => r.campaign_id === camp.id)],
      ["reports", (T.reports || []).filter((r) => r.campaign_id === camp.id)],
      ["events", events],
      // 지원자가 함께 복구되지 않으면 초대 기록의 applicant_id 가 외래키에 걸린다. 그 경우 비운다.
      [
        "event_invitees",
        (T.event_invitees || [])
          .filter((r) => eventIds.has(r.event_id))
          .map((r) => (r.applicant_id && !applicantIds.has(r.applicant_id) ? { ...r, applicant_id: null } : r)),
      ],
      ["event_checklist_items", (T.event_checklist_items || []).filter((r) => eventIds.has(r.event_id))],
      ["event_plans", (T.event_plans || []).filter((r) => eventIds.has(r.event_id))],
      ["audit_logs", (T.audit_logs || []).filter((r) => r.campaign_id === camp.id)],
    ];

    console.log(`대상 : ${isTest ? "테스트" : "운영"} (${new URL(url).hostname})`);
    console.log(`백업 : ${path.basename(src)} (${dump.created_at})`);
    console.log(`캠페인: ${camp.name} [${camp.company_name}]  id ${camp.id}`);
    console.log("복구할 행:");
    for (const [t, rows] of plan) if (rows.length) console.log(`  ${t}: ${rows.length}`);

    if (!confirmed) {
      console.error(
        "\n이 작업은 지금 있는 데이터를 지우지 않고 위 행만 다시 넣습니다." + "\n실행하려면 --yes 를 붙이세요."
      );
      process.exit(1);
    }

    await client.query("begin");
    try {
      let inserted = 0;
      for (const [table, rows] of plan) {
        for (const row of rows) if (await insertRow(table, row)) inserted++;
      }
      await client.query("commit");
      console.log(`\n복구 완료. ${inserted}행을 되살렸습니다.`);
      console.log("다른 데이터는 건드리지 않았습니다.");
    } catch (err) {
      await client.query("rollback");
      console.error(`\n복구 실패, 아무것도 바뀌지 않았습니다:\n${err.message}`);
      process.exit(1);
    }
  } else if (restoreTarget) {
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
