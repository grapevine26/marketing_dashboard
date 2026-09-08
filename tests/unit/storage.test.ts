import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  ConcurrentWriteError,
  readDoc,
  writeDoc,
  putFile,
  readFile,
  statFile,
  findFileKeyByPrefix,
  deleteFilesByPrefixes,
  isBlobBackend,
  getUploadsDirPath,
} from "@/lib/db/storage";
import { mutateDb, readDb } from "@/lib/db";
import type { Campaign } from "@/lib/db/types";

async function drain(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

function makeCampaign(id: string): Campaign {
  return {
    id,
    name: `캠페인 ${id}`,
    company_name: "테스트",
    campaign_type: "shipping" as const,
    status: "recruiting" as const,
    pre_survey_token: `pre-${id}`,
    apply_form_token: `form-${id}`,
    applicants_share_token: `app-${id}`,
    seeding_sheet_share_token: `seed-${id}`,
    webhook_url: undefined,
    created_at: new Date().toISOString(),
  };
}

/**
 * 저장소 추상화 계약 테스트.
 * 테스트 환경에는 BLOB_READ_WRITE_TOKEN 이 없으므로 파일 백엔드를 검증한다.
 * Blob 백엔드도 같은 계약을 지켜야 하므로, Supabase 로 옮길 때 이 파일이 기준이 된다.
 */
describe("저장소 추상화", () => {
  it("테스트는 파일 백엔드로 돈다", () => {
    expect(isBlobBackend()).toBe(false);
  });

  describe("문서 (JSON DB)", () => {
    it("쓰고 읽으면 같은 내용과 버전이 나온다", async () => {
      const version = await writeDoc(JSON.stringify({ hello: "세계" }), null);
      const snap = await readDoc();
      expect(snap).not.toBeNull();
      expect(JSON.parse(snap!.text).hello).toBe("세계");
      expect(snap!.version).toBe(version);
    });

    it("버전이 어긋나면 ConcurrentWriteError 로 거부한다", async () => {
      await writeDoc(JSON.stringify({ n: 1 }), null);
      const stale = await readDoc();

      // 다른 곳에서 먼저 저장한 상황을 만든다. mtime 이 실제로 달라지도록 기다린다.
      await new Promise((r) => setTimeout(r, 20));
      await writeDoc(JSON.stringify({ n: 2 }), null);

      await expect(writeDoc(JSON.stringify({ n: 3 }), stale!.version)).rejects.toBeInstanceOf(
        ConcurrentWriteError
      );

      // 거부된 쓰기는 반영되지 않는다.
      const after = await readDoc();
      expect(JSON.parse(after!.text).n).toBe(2);
    });

    it("최신 버전으로 쓰면 통과한다", async () => {
      await writeDoc(JSON.stringify({ n: 1 }), null);
      const current = await readDoc();
      await new Promise((r) => setTimeout(r, 20));
      await writeDoc(JSON.stringify({ n: 2 }), current!.version);
      const after = await readDoc();
      expect(JSON.parse(after!.text).n).toBe(2);
    });
  });

  describe("mutateDb 동시 쓰기", () => {
    it("병렬 변경이 하나도 유실되지 않는다", async () => {
      await mutateDb((db) => {
        db.campaigns = [];
        return null;
      });

      await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          mutateDb((db) => {
            db.campaigns.push(makeCampaign(`c${i}`));
            return null;
          })
        )
      );

      const db = await readDb();
      expect(db.campaigns).toHaveLength(12);
      expect(new Set(db.campaigns.map((c) => c.id)).size).toBe(12);
    });

    it("다른 인스턴스가 먼저 저장하면 다시 읽어서 변경을 다시 적용한다", async () => {
      await mutateDb((db) => {
        db.campaigns = [];
        return null;
      });

      let interfered = false;
      const result = await mutateDb(async (db) => {
        // 첫 시도에서만, 이 인스턴스 밖에서 먼저 저장한 상황을 만든다.
        if (!interfered) {
          interfered = true;
          const snap = await readDoc();
          const outside = JSON.parse(snap!.text);
          outside.campaigns.push(makeCampaign("outside"));
          await new Promise((r) => setTimeout(r, 20));
          await writeDoc(JSON.stringify(outside), null);
        }
        db.campaigns.push(makeCampaign("mine"));
        return db.campaigns.length;
      });

      const db = await readDb();
      const ids = db.campaigns.map((c) => c.id).sort();
      // 남의 저장을 덮어쓰지 않고 둘 다 남아야 한다.
      expect(ids).toEqual(["mine", "outside"]);
      expect(result).toBe(2);
    });

    it("계속 충돌해도 마지막에는 조건 없이 써서 저장을 끝낸다", async () => {
      await mutateDb((db) => {
        db.campaigns = [];
        return null;
      });

      let attempts = 0;
      const result = await mutateDb(async (db) => {
        attempts++;
        // 매 시도마다 밖에서 먼저 저장한다. 낙관적 잠금은 끝내 통과하지 못한다.
        const snap = await readDoc();
        const outside = JSON.parse(snap!.text);
        outside.campaigns = [makeCampaign(`outside-${attempts}`)];
        await new Promise((r) => setTimeout(r, 20));
        await writeDoc(JSON.stringify(outside), null);

        db.campaigns = [makeCampaign("mine")];
        return attempts;
      });

      // 재시도를 모두 쓰고, 마지막 한 번을 조건 없이 쓴다.
      expect(result).toBe(5);

      // 저장은 반드시 끝나야 한다. 저장이 안 되는 것보다는 덮어쓰는 게 낫다.
      const db = await readDb();
      expect(db.campaigns.map((c) => c.id)).toEqual(["mine"]);
    });
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
