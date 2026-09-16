import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  putFile,
  readFile,
  statFile,
  findFileKeyByPrefix,
  deleteFilesByPrefixes,
  isBlobBackend,
  getUploadsDirPath,
} from "@/lib/db/storage";

async function drain(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

/**
 * 파일 저장소 계약 테스트.
 * 테스트 환경에는 BLOB_READ_WRITE_TOKEN 이 없으므로 파일 백엔드를 검증한다.
 * Blob 백엔드도 같은 계약을 지켜야 한다. (DB 문서는 Supabase 로 옮겨 여기서 다루지 않는다.)
 */
describe("저장소 추상화", () => {
  it("테스트는 파일 백엔드로 돈다", () => {
    expect(isBlobBackend()).toBe(false);
  });

  describe("업로드 파일", () => {
    const key = "abc-123.png";
    const bytes = Buffer.from("0123456789");

    it("저장하고 전체를 다시 읽는다", async () => {
      await putFile(key, bytes, "image/png");

      const stat = await statFile(key);
      expect(stat?.size).toBe(bytes.length);

      const file = await readFile(key);
      expect(file).not.toBeNull();
      expect(file!.status).toBe(200);
      expect(await drain(file!.stream)).toEqual(bytes);
    });

    it("Range 를 주면 부분만 206 으로 돌려준다", async () => {
      await putFile(key, bytes, "image/png");

      const file = await readFile(key, "bytes=2-5");
      expect(file).not.toBeNull();
      expect(file!.status).toBe(206);
      expect(file!.contentRange).toBe(`bytes 2-5/${bytes.length}`);
      expect((await drain(file!.stream)).toString()).toBe("2345");
    });

    it("범위를 벗어난 Range 는 null 이다", async () => {
      await putFile(key, bytes, "image/png");
      expect(await readFile(key, "bytes=99-200")).toBeNull();
    });

    it("숫자가 아닌 Range 는 null 이다", async () => {
      await putFile(key, bytes, "image/png");
      // 끝 위치가 NaN 이면 `end >= size` 도 `start > end` 도 false 라
      // 시작 위치만 검사하던 예전 코드는 이것을 통과시켰다.
      expect(await readFile(key, "bytes=0-abc")).toBeNull();
      expect(await readFile(key, "bytes=abc-5")).toBeNull();
      expect(await readFile(key, "bytes=abc")).toBeNull();
      // 끝을 비우면 파일 끝까지라는 뜻이다. 이것은 막지 않는다.
      const rest = await readFile(key, "bytes=8-");
      expect(rest).not.toBeNull();
      expect((await drain(rest!.stream)).toString()).toBe("89");
    });

    it("없는 키는 null 이다", async () => {
      expect(await statFile("존재하지-않음.png")).toBeNull();
      expect(await readFile("존재하지-않음.png")).toBeNull();
      expect(await findFileKeyByPrefix("존재하지-않음")).toBeNull();
    });

    it("접두사로 키를 찾고 지운다", async () => {
      await putFile(key, bytes, "image/png");
      expect(await findFileKeyByPrefix("abc-123")).toBe(key);

      await deleteFilesByPrefixes(["abc-123"]);
      expect(await findFileKeyByPrefix("abc-123")).toBeNull();
      expect(await statFile(key)).toBeNull();
    });

    it("빈 접두사 목록은 아무것도 지우지 않는다", async () => {
      await putFile(key, bytes, "image/png");
      await deleteFilesByPrefixes([]);
      expect(await statFile(key)).not.toBeNull();
      fs.rmSync(path.join(getUploadsDirPath(), key), { force: true });
    });
  });
});
