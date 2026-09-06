#!/usr/bin/env node
/**
 * JSON DB 백업 목록 조회 / 복원.
 *   npm run db:restore            → 백업 목록 출력
 *   npm run db:restore -- <파일명> → 해당 백업으로 .data/db.json 을 덮어쓴다 (현재 파일은 .data/backups/pre-restore-*.json 으로 보관)
 * 서버를 내린 상태에서 실행할 것 (실행 중이면 메모리 캐시가 mtime 을 보고 다시 읽긴 하지만, 그 사이 쓰기와 충돌할 수 있다).
 */
import fs from "fs";
import path from "path";

const dbFile = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(process.cwd(), ".data", "db.json");
const backupDir = process.env.DB_BACKUP_DIR ? path.resolve(process.env.DB_BACKUP_DIR) : path.join(path.dirname(dbFile), "backups");
const target = process.argv[2];

const list = fs.existsSync(backupDir)
  ? fs.readdirSync(backupDir).filter((f) => /^db-\d{8}-\d{6}\.json$/.test(f)).sort().reverse()
  : [];

if (!target) {
  if (list.length === 0) {
    console.log(`백업이 없습니다. (${backupDir})\n앱이 데이터를 저장할 때 10분 간격으로 자동 생성됩니다.`);
  } else {
    console.log(`백업 ${list.length}개 (${backupDir}):`);
    for (const f of list) {
      const st = fs.statSync(path.join(backupDir, f));
      console.log(`  ${f}  ${(st.size / 1024).toFixed(0)} KB`);
    }
    console.log(`\n복원: npm run db:restore -- ${list[0]}`);
  }
  process.exit(0);
}

const src = path.isAbsolute(target) ? target : path.join(backupDir, target);
if (!fs.existsSync(src)) {
  console.error(`백업 파일을 찾을 수 없습니다: ${src}`);
  process.exit(1);
}
try {
  JSON.parse(fs.readFileSync(src, "utf-8"));
} catch {
  console.error("백업 파일이 올바른 JSON이 아닙니다. 복원을 중단합니다.");
  process.exit(1);
}

if (fs.existsSync(dbFile)) {
  fs.mkdirSync(backupDir, { recursive: true });
  const keep = path.join(backupDir, `pre-restore-${Date.now()}.json`);
  fs.copyFileSync(dbFile, keep);
  console.log(`현재 DB를 보관했습니다: ${keep}`);
}
fs.copyFileSync(src, dbFile);
console.log(`복원 완료: ${src} → ${dbFile}`);
