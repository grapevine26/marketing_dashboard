#!/usr/bin/env node
/**
 * 저장소(Vercel Blob)에 남았지만 DB 어디에서도 가리키지 않는 파일을 정리한다.
 *
 *   npm run blob:orphans                       → 목록만 보여준다 (아무것도 지우지 않는다)
 *   npm run blob:orphans -- --yes --prod       → 내려받아 보관한 뒤 지운다
 *   npm run blob:orphans -- --yes --prod --no-archive   → 보관 없이 바로 지운다
 *
 * 토큰이 필요하다 (.env.local 에는 넣지 않는 게 좋다. 로컬 앱이 운영 Blob 을 타게 된다):
 *   PowerShell : $env:BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."; npm run blob:orphans
 *   Git Bash   : BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... npm run blob:orphans
 *
 * **대상은 언제나 운영이다.** Blob 토큰이 하나뿐이라 테스트 저장소가 따로 없다.
 * 그래서 --test 로는 면제되지 않고 --prod 를 손으로 적게 한다. --yes 는 "목록을 봤다",
 * --prod 는 "운영인 줄 안다" 로 서로 다른 확인이다.
 *
 * `backups/`(크론 백업)와 `db/`(전환 전 데이터)는 훑지도 않는다. 앞의 것은 지우면 유일한
 * 백업이 사라지고, 뒤의 것은 `db:backup -- --purge-legacy` 가 따로 다룬다.
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import { dbSsl } from "./db-ssl.mjs";
import {
  UPLOAD_PREFIX,
  TEMPLATE_PREFIX,
  isOrphan,
  isOrphanCandidate,
  referenceKeyOf,
} from "./blob-orphans-rules.mjs";

if (fs.existsSync(path.join(process.cwd(), ".env.local"))) {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
}

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const allowProd = args.includes("--prod");
const skipArchive = args.includes("--no-archive");
const isTest = args.includes("--test");

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "사용법:",
      "  npm run blob:orphans                                 목록만 본다 (지우지 않음)",
      "  npm run blob:orphans -- --yes --prod                 내려받아 보관한 뒤 지운다",
      "  npm run blob:orphans -- --yes --prod --no-archive    보관 없이 바로 지운다",
      "  --test 를 붙이면 참조를 테스트 DB 에서 읽는다 (Blob 자체는 언제나 운영이다).",
    ].join("\n")
  );
  process.exit(0);
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error(
    [
      "BLOB_READ_WRITE_TOKEN 이 없습니다. 저장소 목록은 이 토큰으로만 읽을 수 있습니다.",
      "",
      '토큰 위치: Vercel 대시보드 → Storage → Blob 스토어 → ".env.local" 탭 → BLOB_READ_WRITE_TOKEN',
      "",
      "셸에서 한 번만 넣고 실행하세요:",
      '  PowerShell : $env:BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."; npm run blob:orphans',
      "  Git Bash   : BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... npm run blob:orphans",
    ].join("\n")
  );
  process.exit(1);
}

// ---------- DB 가 가리키는 키를 모은다 ----------

/**
 * **여기서 실패하면 아무것도 지우지 않고 멈춘다.**
 * 참조 집합이 비어 보이는 것과 "못 읽었다" 를 구분하지 못하면, 조회가 깨진 날
 * 저장소 전체가 고아로 판정된다. 조회 실패는 빈 집합이 아니라 중단이어야 한다.
 */
async function readReferencedKeys() {
  const envName = isTest ? "SUPABASE_TEST_DB_URL" : "SUPABASE_DB_URL";
  const url = process.env[envName];
  if (!url) {
    console.error(`${envName} 이 .env.local 에 없습니다. 참조를 읽을 수 없어 멈춥니다.`);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url, ssl: dbSsl() });
  await client.connect();
  try {
    const { rows: atts } = await client.query(
      `select a->>'id' as id
         from sns_contents, jsonb_array_elements(coalesce(media_attachments, '[]'::jsonb)) a
        where a->>'id' is not null`
    );
    const { rows: tmpls } = await client.query(
      `select file_key from ppt_templates where file_key is not null`
    );
    return {
      host: new URL(url).host,
      keys: new Set([...atts.map((r) => r.id), ...tmpls.map((r) => r.file_key)]),
      counts: { 첨부: atts.length, 템플릿: tmpls.length },
    };
  } finally {
    await client.end();
  }
}

/** uploads/ 와 templates/ 만 훑는다. backups/ 와 db/ 는 목록에 들어올 수조차 없다. */
async function listCandidates() {
  const { list } = await import("@vercel/blob");
  const out = [];
  for (const prefix of [UPLOAD_PREFIX, TEMPLATE_PREFIX]) {
    let cursor;
    do {
      const res = await list({ prefix, cursor });
      for (const b of res.blobs) {
        if (!isOrphanCandidate(b.pathname)) continue;
        out.push({ pathname: b.pathname, url: b.url, size: b.size, uploadedAt: new Date(b.uploadedAt) });
      }
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
  }
  return out.sort((a, b) => a.pathname.localeCompare(b.pathname));
}

const KB = (n) => `${(n / 1024).toFixed(0)} KB`;
const fmtKst = (d) => d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

const { host, keys, counts } = await readReferencedKeys();
const candidates = await listCandidates();
const orphans = candidates.filter((f) => isOrphan(f.pathname, keys));
const kept = candidates.length - orphans.length;

console.log(`참조를 읽은 DB : ${host}`);
console.log(`DB 가 가리키는 파일 : 첨부 ${counts.첨부}개, 템플릿 ${counts.템플릿}개`);
console.log(`저장소의 대상 파일 : ${candidates.length}개 (uploads/, templates/ 만)\n`);

if (orphans.length === 0) {
  console.log("고아 파일이 없습니다. 정리할 것이 없습니다.");
  process.exit(0);
}

console.log(`어디에도 붙어 있지 않은 파일 ${orphans.length}개 (${KB(orphans.reduce((n, f) => n + f.size, 0))}, 시각은 KST):`);
for (const f of orphans) {
  console.log(`  ${f.pathname.padEnd(52)} ${KB(f.size).padStart(8)}  ${fmtKst(f.uploadedAt)}`);
}
if (kept > 0) console.log(`\n쓰이고 있어 남긴 파일 ${kept}개.`);
console.log("크론 백업(backups/)과 전환 전 데이터(db/)는 훑지 않았습니다.");

if (!confirmed) {
  console.log("\n아무것도 지우지 않았습니다. 실제로 지우려면 --yes 와 --prod 를 붙이세요:");
  console.log("  npm run blob:orphans -- --yes --prod              내려받아 보관한 뒤 지운다(권장)");
  console.log("  npm run blob:orphans -- --yes --prod --no-archive 보관 없이 바로 지운다");
  process.exit(0);
}

if (!allowProd) {
  console.error("\n이 삭제는 **언제나 운영 저장소** 를 대상으로 합니다. 토큰이 하나뿐이라 테스트 대상이 없습니다.");
  console.error("정말 지울 것이면 --prod 를 함께 붙이세요.");
  console.error("  예) npm run blob:orphans -- --yes --prod");
  process.exit(1);
}

// 지우기 전에 내려받는다. 하나라도 못 받으면 **아무것도 지우지 않고** 멈춘다.
if (!skipArchive) {
  const dir = path.join(process.cwd(), ".data", "orphan-blob");
  const { get } = await import("@vercel/blob");
  console.log(`\n내려받는 중 → ${dir}`);
  for (const f of orphans) {
    const dest = path.join(dir, ...f.pathname.split("/"));
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
    console.log(`  받음 ${f.pathname}  ${KB(buf.length)}`);
  }
  console.log(".data/ 는 git 에 올라가지 않습니다. 오래 두려면 다른 곳으로 옮기세요.");
} else {
  console.log("\n--no-archive: 내려받지 않고 바로 지웁니다.");
}

const { del } = await import("@vercel/blob");
console.log("");
for (const f of orphans) {
  // 지우기 직전에 한 번 더 판정한다. 여기까지 잘못된 것이 왔다면 목록 만드는 쪽이 깨진 것이다.
  if (!isOrphan(f.pathname, keys)) {
    console.error(`  멈춤 — 고아가 아닌 것이 목록에 있습니다: ${f.pathname}`);
    process.exit(1);
  }
  await del(f.url);
  console.log(`  지움 ${f.pathname}  (참조키 ${referenceKeyOf(f.pathname)})`);
}
console.log(`\n고아 파일 ${orphans.length}개를 지웠습니다. 크론 백업은 건드리지 않았습니다.`);
