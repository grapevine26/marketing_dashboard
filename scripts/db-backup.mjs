#!/usr/bin/env node
/**
 * Supabase 데이터 백업과 복원.
 *
 *   npm run db:backup                          → 전체 테이블을 JSON 한 파일로 내려받는다
 *   npm run db:backup -- --list                → 받아둔 백업 목록 (.data/backups/)
 *   npm run db:backup -- --restore <파일> --prod --yes → 그 백업으로 되돌린다 (현재 데이터를 전부 지운다)
 *
 * 크론이 매일 Vercel Blob(backups/)에 쌓는 백업을 로컬로 가져오기 (BLOB_READ_WRITE_TOKEN 필요):
 *   npm run db:backup -- --list-remote         → Blob 에 있는 백업 목록 (이름·크기·시각)
 *   npm run db:backup -- --pull                → 가장 최근 것 하나를 .data/backups/ 에 저장
 *   npm run db:backup -- --pull <이름>          → 그 이름의 백업을 저장
 *
 * 하나만 되살리기 (지금 데이터는 건드리지 않고 그것만 다시 넣는다):
 *   npm run db:backup -- --from <파일> --campaigns                 → 백업에 담긴 캠페인 목록
 *   npm run db:backup -- --from <파일> --campaign <이름|id> --yes    → 그 캠페인만 복구
 *   npm run db:backup -- --from <파일> --sns-accounts              → 백업에 담긴 SNS 계정 목록
 *   npm run db:backup -- --from <파일> --sns <이름|핸들|id> --yes     → 그 SNS 계정만 복구
 *
 * 대상은 기본이 운영(SUPABASE_DB_URL)이고, `--test` 를 붙이면 테스트 프로젝트다.
 * 다만 데이터를 바꾸는 작업은 운영이면 `--prod` 를 따로 붙여야 실행된다.
 *
 * 잘못 복원했으면: --restore 직전 상태가 .data/backups/pre-restore-*.json 에 남으므로
 * 그 파일로 다시 --restore 하면 된다.
 *
 * 계정 테이블(profiles)은 여기서 백업·복원하지 않는다. 크론 백업(lib/db/backup.ts)에는 profiles 가
 * 들어 있지만, --restore 는 아래 TABLES 만 truncate 하고 덤프의 나머지 테이블은 무시한다.
 * profiles 를 비우면 auth.users 와 어긋나 로그인이 깨진다. 로그인 계정 자체(auth.users)는
 * 어느 백업에도 없고 Supabase 가 보관한다.
 *
 * Supabase 플랜에 따라 자동 백업이 없을 수 있어서 둔다. 중요한 작업 전에 한 번 받아두면
 * 실수로 지웠을 때 되돌릴 수 있다.
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import { isLegacyPathname, LEGACY_DOC_PREFIX } from "./legacy-blob.mjs";

const HELP = `사용법:
  npm run db:backup                                   지금 DB 를 .data/backups/ 에 받는다
  npm run db:backup -- --list                         받아둔 백업 목록
  npm run db:backup -- --restore <파일> --prod --yes   그 백업으로 되돌린다 (현재 데이터를 전부 지운다)
  npm run db:backup -- --list-remote                  Vercel Blob(backups/)의 크론 백업 목록
  npm run db:backup -- --pull [이름]                   Blob 백업을 .data/backups/ 로 내려받는다 (생략 시 최신)
  npm run db:backup -- --purge-legacy                 Blob 에 남은 전환 전 데이터를 보여준다 (지우지 않음)
  npm run db:backup -- --purge-legacy --yes --prod    그것들을 .data/legacy-blob/ 로 내려받은 뒤 지운다
                                                      (Blob 은 토큰이 하나뿐이라 --test 대상이 없다. 언제나 운영이다)
  npm run db:backup -- --from <파일> --campaigns       백업에 담긴 캠페인 목록
  npm run db:backup -- --from <파일> --campaign <이름|id> --yes   그 캠페인만 복구
  npm run db:backup -- --from <파일> --sns-accounts    백업에 담긴 SNS 계정 목록
  npm run db:backup -- --from <파일> --sns <이름|핸들|id> --yes   그 SNS 계정만 복구
  --test 를 붙이면 운영 대신 테스트 프로젝트(SUPABASE_TEST_DB_URL)를 대상으로 한다.
  데이터를 바꾸는 작업(--restore, --campaign, --sns)을 운영에 하려면 --prod 를 함께 붙여야 한다.

--list-remote / --pull 은 BLOB_READ_WRITE_TOKEN 이 필요하다 (.env.local 에는 없다):
  PowerShell : $env:BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."; npm run db:backup -- --pull
  Git Bash   : BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... npm run db:backup -- --pull
  토큰 위치  : Vercel 대시보드 → Storage → Blob 스토어 → ".env.local" 탭

잘못 복원했으면 .data/backups/pre-restore-*.json 으로 다시 --restore 하면 된다.
계정 테이블(profiles)과 로그인(auth.users)은 이 스크립트가 건드리지 않는다.`;

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
const listSnsAccounts = args.includes("--sns-accounts");
const snsTarget = argAfter("--sns");
const confirmed = args.includes("--yes");
const allowProd = args.includes("--prod");
const wantHelp = args.includes("--help") || args.includes("-h");
const wantListRemote = args.includes("--list-remote");
const wantPull = args.includes("--pull");
const pullTarget = argAfter("--pull");
const wantPurgeLegacy = args.includes("--purge-legacy");
const skipArchive = args.includes("--no-archive");

if (wantHelp) {
  console.log(HELP);
  process.exit(0);
}

/**
 * 운영 DB 에 쓰는 작업을 막는 빗장.
 *
 * 읽기(백업 받기, 목록 보기)는 운영이 기본이어야 편하다. 쓰기는 다르다.
 * --restore 는 운영 데이터를 통째로 지우고, --campaign/--sns 복구는 행을 집어넣는다.
 * 대상이 기본값이라 아무 플래그 없이 치면 곧장 운영을 맞춘다. 테스트에 돌리려던 명령에서
 * --test 한 단어만 빠져도 사고가 난다.
 *
 * 그래서 운영에 쓰려면 --prod 를 손으로 적게 한다. --yes 는 "내용을 봤다"이고
 * --prod 는 "운영인 줄 안다"라서 서로 다른 확인이다. 한 플래그가 둘을 겸하면
 * 손에 익는 순간 확인이 아니게 된다.
 */
function requireProdFlag(what) {
  if (isTest || allowProd) return;
  console.error("");
  console.error(`${what} 작업은 운영 데이터베이스를 바꿉니다.`);
  console.error("테스트에 하려던 것이면 --test 를, 정말 운영에 할 것이면 --prod 를 붙이세요.");
  console.error("  예) npm run db:backup -- --restore <파일> --prod --yes");
  process.exit(1);
}

/**
 * 잡은 값에서 사람이 읽을 메시지를 꺼낸다.
 * JS 는 Error 가 아닌 것도 throw 할 수 있어서(문자열, 객체 …) `err.message` 가 undefined 가
 * 되면 화면에 "undefined" 만 찍힌다. 되돌리기 어려운 작업의 실패 사유라 그러면 안 된다.
 * @param {unknown} err
 * @returns {string}
 */
function errMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

const backupDir = path.join(process.cwd(), ".data", "backups");

/** 크론이 Blob 에 쓰는 갈래. lib/db/storage.ts 의 BACKUP_PREFIX 와 같아야 한다. */
const REMOTE_PREFIX = "backups/";

/**
 * 부모 → 자식 순서. 복원할 때 이 순서로 넣어야 외래키가 걸리지 않는다.
 *
 * profiles 는 일부러 뺐다. 크론 백업(lib/db/backup.ts 의 BACKUP_TABLES)에는 들어 있지만,
 * 여기서 truncate 하면 auth.users 와 어긋나 모든 계정의 로그인이 깨진다. --restore 는 이
 * 목록만 돌기 때문에 덤프에 profiles 가 있어도 무시한다.
 */
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

// ---------- Blob 의 크론 백업 (DB 연결 없이 동작) ----------

/** 덤프의 테이블별 행 수를 "테이블=N" 꼴로 이어 붙인다. 빈 테이블은 뺀다. */
function describeCounts(tables) {
  return Object.entries(tables)
    .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
    .map(([t, rows]) => `${t}=${rows.length}`)
    .join(" ");
}

function requireBlobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return;
  console.error(
    [
      "BLOB_READ_WRITE_TOKEN 이 없습니다. Blob 의 백업 목록은 이 토큰으로만 읽을 수 있습니다.",
      "",
      "토큰 위치: Vercel 대시보드 → Storage → Blob 스토어 → \".env.local\" 탭 → BLOB_READ_WRITE_TOKEN",
      "",
      "셸에서 한 번만 넣고 실행하세요 (.env.local 에는 넣지 않는 게 낫습니다. 로컬 앱이 Blob 을 타게 됩니다):",
      "  PowerShell : $env:BLOB_READ_WRITE_TOKEN=\"vercel_blob_rw_...\"; npm run db:backup -- --pull",
      "  Git Bash   : BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... npm run db:backup -- --pull",
    ].join("\n")
  );
  process.exit(1);
}

/** Blob 의 backups/supabase-*.json 을 전부 나열한다. 최신이 앞. */
async function listRemoteBackups() {
  const { list } = await import("@vercel/blob");
  const out = [];
  let cursor;
  do {
    const res = await list({ prefix: REMOTE_PREFIX, cursor });
    for (const b of res.blobs) {
      const key = b.pathname.slice(REMOTE_PREFIX.length);
      if (/^supabase-\d{8}-\d{6}\.json$/.test(key)) {
        out.push({ key, pathname: b.pathname, size: b.size, uploadedAt: new Date(b.uploadedAt) });
      }
    }
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);
  // 이름이 UTC 시각이라 이름 역순이 곧 최신순이다.
  return out.sort((a, b) => b.key.localeCompare(a.key));
}

/**
 * Supabase 로 옮기기 전 저장 계층이 Blob 에 남긴 것을 전부 나열한다. 경로순.
 *
 * 두 갈래만 훑는다 — `db/`(전환 전 문서)와 `backups/`(전환 전 자동 백업).
 * **`uploads/` 와 `templates/` 는 훑지도 않는다.** 거기엔 지금 쓰는 파일이 있다.
 * 그렇게 좁혀 놓고도, 고른 것마다 `isLegacyPathname` 으로 한 번 더 확인한다.
 * 목록을 만드는 곳과 지워도 되는지 판정하는 곳이 따로 있어야 한쪽이 틀려도 안 지워진다.
 */
async function listLegacyBlobs() {
  const { list } = await import("@vercel/blob");
  const out = [];
  for (const prefix of [LEGACY_DOC_PREFIX, REMOTE_PREFIX]) {
    let cursor;
    do {
      const res = await list({ prefix, cursor });
      for (const b of res.blobs) {
        if (!isLegacyPathname(b.pathname)) continue;
        out.push({ pathname: b.pathname, url: b.url, size: b.size, uploadedAt: new Date(b.uploadedAt) });
      }
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
  }
  return out.sort((a, b) => a.pathname.localeCompare(b.pathname));
}

const fmtKst = (d) => d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

if (wantPurgeLegacy) {
  requireBlobToken();
  const legacy = await listLegacyBlobs();
  if (legacy.length === 0) {
    console.log("Blob 에 전환 전 데이터가 없습니다. 정리할 것이 없습니다.");
    process.exit(0);
  }

  const totalKb = (legacy.reduce((n, f) => n + f.size, 0) / 1024).toFixed(0);
  console.log(`전환 전 데이터 ${legacy.length}개 (${totalKb} KB, 시각은 KST):`);
  for (const f of legacy) {
    console.log(`  ${f.pathname.padEnd(40)} ${(f.size / 1024).toFixed(0).padStart(5)} KB  ${fmtKst(f.uploadedAt)}`);
  }
  console.log("");
  console.log("이것들은 Supabase 로 옮기기 전(2026-09-14) 저장 계층이 남긴 것입니다.");
  console.log("지금 코드는 이 경로들을 쓰지 않습니다. 지우면 되돌릴 수 없습니다.");
  console.log("uploads/ 와 templates/ 는 훑지도 않았으므로 목록에 있을 수 없습니다.");

  if (!confirmed) {
    console.log("");
    console.log("아무것도 지우지 않았습니다. 실제로 지우려면 --yes 를 붙이세요:");
    console.log("  npm run db:backup -- --purge-legacy --yes --prod              내려받아 보관한 뒤 지운다(권장)");
    console.log("  npm run db:backup -- --purge-legacy --yes --prod --no-archive 보관 없이 바로 지운다");
    process.exit(0);
  }

  // **여기는 requireProdFlag 를 쓰지 않는다.** 그 함수는 --test 면 그냥 통과시키는데,
  // Blob 저장소는 토큰이 하나뿐이라 **--test 를 붙여도 대상이 운영 Blob 이다.**
  // 그래서 --test 로는 면제될 수 없고, --prod 를 반드시 손으로 적게 한다.
  // --yes 는 "목록을 봤다", --prod 는 "운영인 줄 안다" 로 서로 다른 확인이다.
  if (!allowProd) {
    console.error("");
    console.error("이 삭제는 **언제나 운영 Blob** 을 대상으로 합니다. Blob 토큰이 하나뿐이라 테스트 대상이 없습니다.");
    console.error("정말 지울 것이면 --prod 를 함께 붙이세요.");
    console.error("  예) npm run db:backup -- --purge-legacy --yes --prod");
    process.exit(1);
  }

  // 지우기 전에 내려받는다. "정리" 는 자리를 비우는 것이지 없애는 것이 아니다.
  // 한 개라도 못 받으면 **아무것도 지우지 않고** 멈춘다 — 반만 지우면 무엇이 남았는지 알 수 없다.
  if (!skipArchive) {
    const archiveDir = path.join(process.cwd(), ".data", "legacy-blob");
    fs.mkdirSync(archiveDir, { recursive: true });
    const { get } = await import("@vercel/blob");
    console.log("");
    console.log(`내려받는 중 → ${archiveDir}`);
    for (const f of legacy) {
      // Blob 의 경로 모양 그대로 저장한다. 납작하게 펴면 어느 갈래에 있던 것인지 잃는다.
      const dest = path.join(archiveDir, ...f.pathname.split("/"));
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        console.log(`  건너뜀(이미 있음) ${f.pathname}`);
        continue;
      }
      const res = await get(f.pathname, { access: "private" });
      if (!res || res.statusCode !== 200 || !res.stream) {
        console.error(`  실패 ${f.pathname} — 아무것도 지우지 않고 멈춥니다.`);
        process.exit(1);
      }
      const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
      if (buf.length === 0) {
        console.error(`  빈 파일 ${f.pathname} — 아무것도 지우지 않고 멈춥니다.`);
        process.exit(1);
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      console.log(`  받음 ${f.pathname}  ${(buf.length / 1024).toFixed(0)} KB`);
    }
    console.log(`보관 완료. .data/ 는 git 에 올라가지 않으니 필요하면 다른 곳으로 옮기세요.`);
  } else {
    console.log("");
    console.log("--no-archive: 내려받지 않고 바로 지웁니다.");
  }

  const { del } = await import("@vercel/blob");
  console.log("");
  for (const f of legacy) {
    // 지우기 직전에 한 번 더 본다. 여기까지 잘못된 것이 왔다면 목록 만드는 쪽이 깨진 것이다.
    if (!isLegacyPathname(f.pathname)) {
      console.error(`  멈춤 — 옛 데이터가 아닌 것이 목록에 있습니다: ${f.pathname}`);
      process.exit(1);
    }
    await del(f.url);
    console.log(`  지움 ${f.pathname}`);
  }
  console.log(`\n전환 전 데이터 ${legacy.length}개를 지웠습니다.`);
  console.log("크론 백업(backups/supabase-*.json)과 업로드 파일은 건드리지 않았습니다.");
  process.exit(0);
}

if (wantListRemote) {
  requireBlobToken();
  const all = await listRemoteBackups();
  if (all.length === 0) {
    console.log(`Blob(${REMOTE_PREFIX})에 백업이 없습니다. 크론(/api/cron/backup)이 돌았는지 확인하세요.`);
  } else {
    console.log(`Blob 백업 ${all.length}개 (${REMOTE_PREFIX}, 시각은 KST):`);
    for (const b of all) console.log(`  ${b.key}  ${(b.size / 1024).toFixed(0).padStart(6)} KB  ${fmtKst(b.uploadedAt)}`);
    console.log(`\n내려받기: npm run db:backup -- --pull ${all[0]?.key ?? ""}   (이름을 빼면 최신 것)`);
  }
  process.exit(0);
}

if (wantPull) {
  requireBlobToken();
  const { get } = await import("@vercel/blob");

  // 이름은 "supabase-….json" 이든 "backups/supabase-….json" 이든 받는다.
  let key = pullTarget && !pullTarget.startsWith("--") ? pullTarget.replace(/^backups\//, "") : null;
  if (!key) {
    // 값을 꺼내 보는 것이 곧 "비어 있는가" 검사다. length 를 따로 보면
    // 아래에서 꺼낸 값이 또 없을 수도 있는 것처럼 읽힌다.
    const [latest] = await listRemoteBackups();
    if (!latest) {
      console.error(`Blob(${REMOTE_PREFIX})에 백업이 없습니다.`);
      process.exit(1);
    }
    key = latest.key;
    console.log(`최신 백업: ${key} (${fmtKst(latest.uploadedAt)})`);
  }
  // 위 분기에서 반드시 채워지지만, let 재할당이라 타입이 string|null 로 남는다.
  // 한 번 더 확인해 확정한다 — 여기 걸릴 일은 없고, 걸린다면 위 분기가 깨진 것이다.
  const resolvedKey = key;
  if (!resolvedKey) {
    console.error("받아올 백업 이름을 정하지 못했습니다.");
    process.exit(1);
  }
  if (!/^supabase-\d{8}-\d{6}\.json$/.test(resolvedKey)) {
    console.error(`백업 이름 형식이 아닙니다: ${resolvedKey}  (예: supabase-20260915-180000.json)`);
    process.exit(1);
  }

  const res = await get(`${REMOTE_PREFIX}${resolvedKey}`, { access: "private" });
  if (!res || res.statusCode !== 200 || !res.stream) {
    console.error(`Blob 에서 찾지 못했습니다: ${REMOTE_PREFIX}${resolvedKey}\n목록: npm run db:backup -- --list-remote`);
    process.exit(1);
  }
  const text = Buffer.from(await new Response(res.stream).arrayBuffer()).toString("utf-8");

  // 저장 전에 형식을 검사한다. 깨진 파일을 .data/backups 에 두면 --list 에 섞여 헷갈린다.
  let dump;
  try {
    dump = JSON.parse(text);
  } catch (err) {
    console.error(`JSON 으로 읽을 수 없습니다: ${errMessage(err)}`);
    process.exit(1);
  }
  if (!dump || typeof dump !== "object" || !dump.tables || typeof dump.tables !== "object") {
    console.error("백업 파일 형식이 올바르지 않습니다 (tables 가 없음). lib/db/backup.ts 의 BackupDump 형식이어야 합니다.");
    process.exit(1);
  }

  // 크론이 만든 파일은 이미 --restore 가 읽는 형식(created_at, source, tables)이라 그대로 둔다.
  // 다만 압축돼 있어 사람이 보기 어려우니 로컬 백업과 같이 들여쓰기해서 저장한다.
  fs.mkdirSync(backupDir, { recursive: true });
  const dest = path.join(backupDir, resolvedKey);
  fs.writeFileSync(dest, JSON.stringify(dump, null, 2), "utf-8");

  const total = Object.values(dump.tables).reduce((a, r) => a + (Array.isArray(r) ? r.length : 0), 0);
  console.log(`저장: ${dest}`);
  console.log(`백업 시각: ${dump.created_at ?? "?"}  출처: ${dump.source ?? "?"}`);
  console.log(`전체 ${total}행`);
  for (const [t, rows] of Object.entries(dump.tables)) {
    if (Array.isArray(rows) && rows.length) console.log(`  ${t}: ${rows.length}`);
  }
  const extra = Object.keys(dump.tables).filter((t) => !TABLES.includes(t));
  if (extra.length) {
    console.log(`\n참고: ${extra.join(", ")} 은(는) --restore 가 건드리지 않습니다 (계정 테이블은 복원 대상이 아님).`);
  }
  console.log(`\n캠페인 하나만 복구: npm run db:backup -- --from ${key} --campaigns`);
  process.exit(0);
}

// ---------- 여기부터는 DB 연결이 필요하다 ----------

const envName = isTest ? "SUPABASE_TEST_DB_URL" : "SUPABASE_DB_URL";
const rawUrl = process.env[envName];
if (!rawUrl) {
  console.error(`${envName} 이 .env.local 에 없습니다.`);
  process.exit(1);
}
// 위에서 없으면 종료하므로 여기서는 반드시 있다. 아래 함수들이 이 값을 쓰는데,
// 함수 선언은 호이스팅되어 "언제 불리는지" 를 알 수 없어 위 가드만으로는 타입이 좁혀지지 않는다.
// 확정된 값을 새 상수에 담아 그 사실을 코드로 남긴다.
const url = rawUrl;

// 데이터를 바꾸는 작업이면 대상이 운영인지 여기서 먼저 확인한다.
// 미리보기(--yes 없이)는 읽기만 하므로 막지 않는다. 실행 직전에만 빗장을 건다.
if (confirmed && (restoreTarget || campaignTarget || snsTarget)) {
  requireProdFlag(restoreTarget ? "전체 복원" : "부분 복구");
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
  return (res.rowCount ?? 0) > 0;
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

/** 백업에서 하나를 골라 딸린 행과 함께 다시 넣는다. 기존 데이터는 건드리지 않는다. */
async function restoreOne({ label, name, id, plan, warn, from, at }) {
  console.log(`대상 : ${isTest ? "테스트" : "운영"} (${new URL(url).hostname})`);
  console.log(`백업 : ${from} (${at})`);
  console.log(`${label}: ${name}  id ${id}`);
  console.log("복구할 행:");
  for (const [t, rows] of plan) if (rows.length) console.log(`  ${t}: ${rows.length}`);
  if (warn) console.log(`\n${warn}`);

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
    console.error(`\n복구 실패, 아무것도 바뀌지 않았습니다:\n${errMessage(err)}`);
    process.exit(1);
  }
}

/** 이름·id 로 하나를 찾는다. 없거나 여럿이면 안내하고 끝낸다. */
function pickOne(rows, needleRaw, describe, srcName, listFlag) {
  const needle = needleRaw.toLowerCase();
  const matches = rows.filter((r) => describe(r).some((v) => v && v.toLowerCase() === needle))
    .concat(rows.filter((r) => describe(r).some((v) => v && v.toLowerCase().includes(needle))));
  const unique = [...new Map(matches.map((r) => [r.id, r])).values()];
  if (unique.length === 0) {
    console.error(`백업에서 "${needleRaw}" 에 해당하는 항목을 찾지 못했습니다.`);
    console.error(`담긴 목록을 보려면: npm run db:backup -- --from ${srcName} ${listFlag}`);
    process.exit(1);
  }
  if (unique.length > 1) {
    console.error(`"${needleRaw}" 에 해당하는 항목이 ${unique.length}개입니다. id 로 정확히 지정하세요.`);
    for (const r of unique) {
      const shown = describe(r).filter((v) => v && v !== r.id).join(" / ");
      console.error(`  ${shown}  id: ${r.id}`);
    }
    process.exit(1);
  }
  return unique[0];
}

try {
  if (fromFile && (listSnsAccounts || snsTarget)) {
    // ---------- SNS 계정 하나만 되살리기 ----------
    const { dump, src } = loadDump(fromFile);
    const accounts = dump.tables.sns_accounts || [];

    if (listSnsAccounts) {
      console.log(`백업: ${path.basename(src)} (${dump.created_at})`);
      if (accounts.length === 0) {
        console.log("담긴 SNS 계정이 없습니다.");
      } else {
        console.log(`담긴 SNS 계정 ${accounts.length}개:`);
        for (const a of accounts) {
          const contents = (dump.tables.sns_contents || []).filter((c) => c.account_id === a.id);
          const media = contents.reduce((n, c) => n + (Array.isArray(c.media_attachments) ? c.media_attachments.length : 0), 0);
          console.log(`  ${a.company_name} (@${a.handle})  ${a.platform}  콘텐츠 ${contents.length}건, 첨부 ${media}개`);
          console.log(`    id: ${a.id}`);
        }
        console.log(`\n복구: npm run db:backup -- --from ${path.basename(src)} --sns "<이름·핸들 또는 id>" --yes`);
      }
      process.exit(0);
    }

    const acc = pickOne(
      accounts,
      snsTarget,
      (a) => [a.id, a.company_name, a.handle],
      path.basename(src),
      "--sns-accounts"
    );

    const exists = await client.query("select 1 from public.sns_accounts where id = $1", [acc.id]);
    if ((exists.rowCount ?? 0) > 0) {
      console.error(`이 계정은 이미 DB 에 있습니다: ${acc.company_name} (@${acc.handle})`);
      console.error("지워진 계정만 되살릴 수 있습니다. 덮어쓰지 않습니다.");
      process.exit(1);
    }
    // 토큰은 unique 라, 그 사이 다른 계정이 같은 토큰을 받았으면 충돌한다. 미리 잡아 알려준다.
    const tokenClash = await client.query(
      "select company_name, handle from public.sns_accounts where intake_token = $1 or approval_token = $2",
      [acc.intake_token, acc.approval_token]
    );
    if ((tokenClash.rowCount ?? 0) > 0) {
      const other = tokenClash.rows[0];
      console.error(`공유 링크 토큰이 다른 계정과 겹칩니다: ${other.company_name} (@${other.handle})`);
      console.error("그 계정의 토큰을 재발급한 뒤 다시 시도하세요.");
      process.exit(1);
    }

    const T = dump.tables;
    const contents = (T.sns_contents || []).filter((r) => r.account_id === acc.id);
    const mediaCount = contents.reduce(
      (n, c) => n + (Array.isArray(c.media_attachments) ? c.media_attachments.length : 0),
      0
    );
    const plan = [
      ["sns_accounts", [acc]],
      ["sns_intake_responses", (T.sns_intake_responses || []).filter((r) => r.account_id === acc.id)],
      ["sns_plans", (T.sns_plans || []).filter((r) => r.account_id === acc.id)],
      ["sns_contents", contents],
      ["audit_logs", (T.audit_logs || []).filter((r) => r.account_id === acc.id)],
    ];

    await restoreOne({
      label: "계정",
      name: `${acc.company_name} (@${acc.handle})`,
      id: acc.id,
      plan,
      from: path.basename(src),
      at: dump.created_at,
      warn:
        mediaCount > 0
          ? `주의: 시안 미디어 ${mediaCount}개의 기록은 되살아나지만, 계정을 앱에서 삭제했다면 실제 이미지·영상 파일은\n` +
            "      그때 저장소에서 함께 지워졌다. 그런 경우 화면에서 미디어가 깨져 보인다. 다시 올려야 한다."
          : null,
    });
  } else if (fromFile && (listCampaigns || campaignTarget)) {
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

    const camp = pickOne(
      campaigns,
      campaignTarget,
      (c) => [c.id, c.name],
      path.basename(src),
      "--campaigns"
    );
    const exists = await client.query("select 1 from public.campaigns where id = $1", [camp.id]);
    if ((exists.rowCount ?? 0) > 0) {
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

    await restoreOne({
      label: "캠페인",
      name: `${camp.name} [${camp.company_name}]`,
      id: camp.id,
      plan,
      warn: null,
      from: path.basename(src),
      at: dump.created_at,
    });
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

    console.log(`복원 대상: ${isTest ? "테스트" : "운영"} (${new URL(url).hostname})`);
    console.log(`백업 시각: ${dump.created_at}`);
    console.log(`담긴 행  : ${describeCounts(dump.tables) || "(없음)"}`);
    // 크론 백업에는 profiles 처럼 이 스크립트가 복원하지 않는 테이블이 섞여 있다. 그건 그대로 둔다.
    const skipped = Object.keys(dump.tables).filter((t) => !TABLES.includes(t));
    if (skipped.length) console.log(`건너뜀  : ${skipped.join(", ")} (계정 테이블은 복원하지 않는다)`);

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
      console.error(`\n복원 실패, 아무것도 바뀌지 않았습니다:\n${errMessage(err)}`);
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
