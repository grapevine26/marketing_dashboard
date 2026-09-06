import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, afterAll } from "vitest";

// 각 테스트 파일이 자기만의 임시 JSON DB를 쓰도록 DB_FILE을 격리한다.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "marketing-mvp-test-"));
process.env.DB_FILE = path.join(dir, `db-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
process.env.GEMINI_API_KEY = "";

beforeEach(() => {
  // 파일과 메모리 캐시를 모두 비워 테스트 간 상태가 새지 않게 한다.
  try {
    fs.rmSync(process.env.DB_FILE as string, { force: true });
  } catch {
    /* ignore */
  }
  (globalThis as unknown as { _marketingDbCache?: unknown })._marketingDbCache = undefined;
});

afterAll(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
