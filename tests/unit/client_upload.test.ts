import { describe, it, expect } from "vitest";
import {
  createSnsAccount,
  createSnsContent,
  prepareSnsMediaUpload,
  recordUploadedSnsMedia,
  getSnsMediaAttachmentById,
  getAuditLogs,
  ValidationError,
} from "@/lib/db";
import { putFile, statFile } from "@/lib/db/storage";
import { buildUploadPathname } from "@/lib/db/types";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngBytes = (filler = "png-body-bytes") => Buffer.concat([PNG_HEADER, Buffer.from(filler)]);

async function makeContent() {
  const acc = await createSnsAccount({
    company_name: "글로우랩",
    handle: "glowlab",
    platform: "instagram",
    starts_on: "2026-09-01",
    ends_on: "2026-11-30",
  });
  const content = await createSnsContent({
    account_id: acc.id,
    title: "제형 클로즈업 릴스 시안",
    scheduled_on: "2026-09-15",
    assignee: null,
    caption: null,
    hashtags: null,
    media_note: null,
  });
  return { acc, content };
}

/**
 * 브라우저가 저장소에 직접 올리는 경로.
 *
 * Vercel 함수는 요청 본문을 4.5MB 로 자르기 때문에 파일이 서버를 거치면 안 된다.
 * 대신 파일이 서버를 안 거치므로, 기록할 때 실물과 내용을 서버가 다시 확인해야 한다.
 * 그 확인이 실제로 도는지를 본다.
 */
describe("클라이언트 직접 업로드", () => {
  describe("prepareSnsMediaUpload", () => {
    it("형식에 맞는 저장 경로를 만들어준다", async () => {
      const { content } = await makeContent();
      const prep = await prepareSnsMediaUpload(content.id, "시안 컷.png", "image/png", 1234);

      expect(prep.storedFilename).toBe(`${prep.attachmentId}.png`);
      expect(prep.pathname).toBe(buildUploadPathname(prep.attachmentId, ".png"));
      expect(prep.safeName).toBe("시안_컷.png");
    });

    it("허용하지 않는 형식과 50MB 초과는 거부한다", async () => {
      const { content } = await makeContent();
      await expect(prepareSnsMediaUpload(content.id, "x.exe", "application/x-msdownload", 10)).rejects.toBeInstanceOf(
        ValidationError
      );
      await expect(prepareSnsMediaUpload(content.id, "big.mp4", "video/mp4", 51 * 1024 * 1024)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it("없는 콘텐츠에는 자리를 내주지 않는다", async () => {
      await expect(prepareSnsMediaUpload("없는-콘텐츠", "a.png", "image/png", 10)).rejects.toBeInstanceOf(
        ValidationError
      );
    });
  });

  describe("recordUploadedSnsMedia", () => {
    it("올라온 파일을 확인하고 기록한다. 크기는 저장소에서 읽는다", async () => {
      const { acc, content } = await makeContent();
      const prep = await prepareSnsMediaUpload(content.id, "sample.png", "image/png", 999);
      const bytes = pngBytes();
      await putFile(prep.storedFilename, bytes, "image/png");

      const attachment = await recordUploadedSnsMedia(content.id, {
        attachmentId: prep.attachmentId,
        storedFilename: prep.storedFilename,
        name: "sample.png",
        mime_type: "image/png",
      });

      // 클라이언트가 보낸 크기가 아니라 실제 저장된 크기를 쓴다.
      expect(attachment.size).toBe(bytes.length);
      expect(attachment.url).toBe(`/api/media/${prep.attachmentId}`);

      const found = await getSnsMediaAttachmentById(prep.attachmentId);
      expect(found?.storageKey).toBe(prep.storedFilename);

      const logs = await getAuditLogs({ account_id: acc.id });
      expect(logs.some((l) => l.action === "sns.add_media")).toBe(true);
    });

    it("내용이 형식과 다르면 거부하고 올라온 파일을 지운다", async () => {
      const { content } = await makeContent();
      const prep = await prepareSnsMediaUpload(content.id, "가짜.png", "image/png", 100);
      // 확장자만 png 이고 내용은 아니다.
      await putFile(prep.storedFilename, Buffer.from("이건 그냥 텍스트입니다"), "image/png");

      await expect(
        recordUploadedSnsMedia(content.id, {
          attachmentId: prep.attachmentId,
          storedFilename: prep.storedFilename,
          name: "가짜.png",
          mime_type: "image/png",
        })
      ).rejects.toBeInstanceOf(ValidationError);

      // 고아 파일을 남기지 않는다.
      expect(await statFile(prep.storedFilename)).toBeNull();
    });

    it("올라온 파일이 없으면 거부한다", async () => {
      const { content } = await makeContent();
      const prep = await prepareSnsMediaUpload(content.id, "없음.png", "image/png", 100);

      await expect(
        recordUploadedSnsMedia(content.id, {
          attachmentId: prep.attachmentId,
          storedFilename: prep.storedFilename,
          name: "없음.png",
          mime_type: "image/png",
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("경로 모양이 어긋나면 거부한다", async () => {
      const { content } = await makeContent();
      await expect(
        recordUploadedSnsMedia(content.id, {
          attachmentId: "x",
          storedFilename: "../../db/marketing_db.json",
          name: "x.png",
          mime_type: "image/png",
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
