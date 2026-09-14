import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, afterAll } from "vitest";
import { hasTestDb, resetTestDb, closeTestDb } from "./test-db";

// 업로드 파일(시안 미디어, PPT 템플릿)은 테스트 실행마다 임시 폴더를 쓴다.
// 템플릿 폴더는 uploads 의 형제 폴더이므로 같은 임시 폴더 아래에 생긴다.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "marketing-mvp-test-"));
process.env.UPLOADS_DIR = path.join(dir, "uploads");
process.env.GEMINI_API_KEY = "";

beforeEach(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  if (hasTestDb) await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
