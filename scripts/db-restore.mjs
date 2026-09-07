#!/usr/bin/env node
/**
 * JSON DB 백업 목록 조회 / 복원.
 *   npm run db:restore            → 백업 목록 출력
 *   npm run db:restore -- <파일명> → 해당 백업으로 현재 DB를 덮어쓴다 (현재 DB는 pre-restore-*.json 으로 보관)
 *
 * 저장소는 두 가지다. lib/db/storage.ts 와 같은 규칙을 쓴다.
 * - BLOB_READ_WRITE_TOKEN 이 있으면 Vercel Blob (db/marketing_db.json, backups/)
 * - 없으면 로컬 파일 (.data/db.json, .data/backups/)
 *
 * 로컬 파일 모드는 서버를 내린 상태에서 실행할 것.
 */
import fs from "fs";
import path from "path";

const DOC_KEY = "db/marketing_db.json";
const BACKUP_PREFIX = "backups/";
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const target = process.argv[2];

const dbFile = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(process.cwd(), ".data", "db.json");
const backupDir = process.env.DB_BACKUP_DIR ? path.resolve(process.env.DB_BACKUP_DIR) : path.join(path.dirname(dbFile), "backups");

/** @returns {Promise<{file: string, size: number}[]>} 최신순 */
async function listBackups() {
  if (useBlob) {
    const { list } = await import("@vercel/blob");
    const res = await list({ prefix: BACKUP_PREFIX });
    return res.blobs
      .map((b) => ({ file: b.pathname.slice(BACKUP_PREFIX.length), size: b.size }))
      .filter((b) => /^(db|pre-restore)-/.test(b.file))
      .sort((a, b) => b.file.localeCompare(a.file));
  }
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((f) => /^db-\d{8}-\d{6}\.json$/.test(f))
    .sort()
    .reverse()
    .map((f) => ({ file: f, size: fs.statSync(path.join(backupDir, f)).size }));
}

async function readBackup(name) {
  if (useBlob) {
    const { get, BlobNotFoundError } = await import("@vercel/blob");
    try {
      const res = await get(`${BACKUP_PREFIX}${name}`, { access: "private", useCache: false });
      return res?.stream ? await new Response(res.stream).text() : null;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    }
  }
  const src = path.isAbsolute(name) ? name : path.join(backupDir, name);
  return fs.existsSync(src) ? fs.readFileSync(src, "utf-8") : null;
}

async function readCurrentDoc() {
  if (useBlob) {
    const { get, BlobNotFoundError } = await import("@vercel/blob");
    try {
      const res = await get(DOC_KEY, { access: "private", useCache: false });
      return res?.stream ? await new Response(res.stream).text() : null;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    }
  }
  return fs.existsSync(dbFile) ? fs.readFileSync(dbFile, "utf-8") : null;
}

async function writeDoc(text) {
  if (useBlob) {
    const { put } = await import("@vercel/blob");
    await put(DOC_KEY, text, {
      access: "private",
      contentType: "application/json",
      allowOverwrite: true,
      addRandomSuffix: false,
    });
    return DOC_KEY;
  }
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  fs.writeFileSync(dbFile, text, "utf-8");
  return dbFile;
}

async function writeBackup(name, text) {
  if (useBlob) {
    const { put } = await import("@vercel/blob");
    await put(`${BACKUP_PREFIX}${name}`, text, {
      access: "private",
      contentType: "application/json",
      allowOverwrite: true,
      addRandomSuffix: false,
    });
    return `${BACKUP_PREFIX}${name}`;
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const dest = path.join(backupDir, name);
  fs.writeFileSync(dest, text, "utf-8");
  return dest;
}

const where = useBlob ? "Vercel Blob" : backupDir;
const backups = await listBackups();

if (!target) {
  if (backups.length === 0) {
    console.log(`백업이 없습니다. (${where})\n앱이 데이터를 저장할 때 10분 간격으로 자동 생성됩니다.`);
  } else {
    console.log(`백업 ${backups.length}개 (${where}):`);
    for (const b of backups) console.log(`  ${b.file}  ${(b.size / 1024).toFixed(0)} KB`);
    console.log(`\n복원: npm run db:restore -- ${backups[0].file}`);
  }
  process.exit(0);
}

const text = await readBackup(target);
if (text === null) {
  console.error(`백업 파일을 찾을 수 없습니다: ${target} (${where})`);
  process.exit(1);
}
try {
  JSON.parse(text);
} catch {
  console.error("백업 파일이 올바른 JSON이 아닙니다. 복원을 중단합니다.");
  process.exit(1);
}

const current = await readCurrentDoc();
if (current !== null) {
  const kept = await writeBackup(`pre-restore-${Date.now()}.json`, current);
  console.log(`현재 DB를 보관했습니다: ${kept}`);
}

const dest = await writeDoc(text);
console.log(`복원 완료: ${target} → ${dest}`);
