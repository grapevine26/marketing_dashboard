import { describe, it, expect } from "vitest";
import {
  createSnsAccount,
  createSnsContent,
  saveSnsMediaAttachment,
  deleteSnsMediaAttachment,
  getSnsMediaAttachmentById,
  getAuditLogs,
  ValidationError,
} from "@/lib/db";
import { toReviewableSnsContent } from "@/lib/db/types";
import { GET } from "@/app/api/media/[id]/route";
import { NextRequest } from "next/server";
import fs from "fs";

describe("Phase 3: SNS 시안 미디어 첨부 및 광고주 갤러리", () => {
  it("saveSnsMediaAttachment로 이미지 시안을 첨부하고 감사 로그를 기록한다", async () => {
    const acc = await createSnsAccount({
      company_name: "미디어테스트사",
      platform: "instagram",
      handle: "media_test_brand",
      starts_on: "2026-09-01",
      ends_on: "2026-11-30",
    });

    const content = await createSnsContent({
      account_id: acc.id,
      title: "제형 클로즈업 릴스 시안",
      scheduled_on: "2026-09-15",
      assignee: "홍길동",
      caption: "촉촉한 수분감 가득!",
      hashtags: "#앰플 #뷰티",
      media_note: "4K 원본 컷",
    });

    const dummyImageBuffer = Buffer.from("fake-png-image-binary-data");
    const attachment = await saveSnsMediaAttachment(content.id, {
      name: "sample_feed_draft.png",
      buffer: dummyImageBuffer,
      mime_type: "image/png",
      size: dummyImageBuffer.length,
    });

    expect(attachment.id).toBeDefined();
    expect(attachment.name).toBe("sample_feed_draft.png");
    expect(attachment.mime_type).toBe("image/png");
    expect(attachment.url).toBe(`/api/media/${attachment.id}`);

    // Verify lookup helper
    const found = await getSnsMediaAttachmentById(attachment.id);
    expect(found).not.toBeNull();
    expect(found?.attachment.name).toBe("sample_feed_draft.png");
    expect(found?.accountId).toBe(acc.id);
    expect(fs.existsSync(found!.filePath)).toBe(true);

    // Verify audit log
    const logs = await getAuditLogs({ account_id: acc.id });
    const mediaLog = logs.find((l) => l.action === "sns.add_media");
    expect(mediaLog).toBeDefined();
    expect(mediaLog?.summary).toContain("sample_feed_draft.png");
  });

  it("비디오 파일 첨부 및 파일 형식 검증이 정상 동작한다", async () => {
    const acc = await createSnsAccount({
      company_name: "비디오테스트사",
      platform: "instagram",
      handle: "video_brand",
      starts_on: null,
      ends_on: null,
    });

    const content = await createSnsContent({
      account_id: acc.id,
      title: "동영상 릴스 테스트",
      scheduled_on: null,
      assignee: null,
      caption: null,
      hashtags: null,
      media_note: null,
    });

    // 1. Valid MP4 upload
    const dummyVideo = Buffer.from("dummy-mp4-video-content-bytes");
    const videoAtt = await saveSnsMediaAttachment(content.id, {
      name: "reels_draft_v1.mp4",
      buffer: dummyVideo,
      mime_type: "video/mp4",
      size: dummyVideo.length,
    });
    expect(videoAtt.mime_type).toBe("video/mp4");

    // 2. Unsupported format rejection
    await expect(
      saveSnsMediaAttachment(content.id, {
        name: "malicious.exe",
        buffer: Buffer.from("MZ..."),
        mime_type: "application/x-msdownload",
        size: 10,
      })
    ).rejects.toBeInstanceOf(ValidationError);

    // 3. Empty file rejection
    await expect(
      saveSnsMediaAttachment(content.id, {
        name: "empty.jpg",
        buffer: Buffer.alloc(0),
        mime_type: "image/jpeg",
        size: 0,
      })
    ).rejects.toBeInstanceOf(ValidationError);

    // 4. Exceeding 50MB rejection
    await expect(
      saveSnsMediaAttachment(content.id, {
        name: "giant_video.mp4",
        buffer: Buffer.alloc(10),
        mime_type: "video/mp4",
        size: 51 * 1024 * 1024, // 51MB
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("toReviewableSnsContent가 광고주 승인 화면에 media_attachments를 전달한다", async () => {
    const acc = await createSnsAccount({
      company_name: "광고주승인미디어",
      platform: "instagram",
      handle: "brand_review",
      starts_on: null,
      ends_on: null,
    });

    const content = await createSnsContent({
      account_id: acc.id,
      title: "승인 검토 시안",
      scheduled_on: "2026-09-20",
      assignee: "담당자",
      caption: "광고주 컨펌용 캡션",
      hashtags: "#컨펌",
      media_note: "내부 메모 비밀",
    });

    const att = await saveSnsMediaAttachment(content.id, {
      name: "proposal_image.webp",
      buffer: Buffer.from("webp-data"),
      mime_type: "image/webp",
      size: 9,
    });

    const { getSnsContentById } = await import("@/lib/db");
    const updatedContent = await getSnsContentById(content.id);
    expect(updatedContent).not.toBeNull();

    const reviewable = toReviewableSnsContent(updatedContent!);
    expect(reviewable.media_attachments).toHaveLength(1);
    expect(reviewable.media_attachments![0].name).toBe("proposal_image.webp");
    // Ensure media_note is not leaked
    expect((reviewable as unknown as Record<string, unknown>).media_note).toBeUndefined();
  });

  it("deleteSnsMediaAttachment로 미디어 삭제 시 디스크 파일과 감사 로그가 정리된다", async () => {
    const acc = await createSnsAccount({
      company_name: "삭제테스트사",
      platform: "instagram",
      handle: "delete_brand",
      starts_on: null,
      ends_on: null,
    });

    const content = await createSnsContent({
      account_id: acc.id,
      title: "삭제 대상 시안",
      scheduled_on: null,
      assignee: null,
      caption: null,
      hashtags: null,
      media_note: null,
    });

    const att = await saveSnsMediaAttachment(content.id, {
      name: "to_delete.jpg",
      buffer: Buffer.from("delete-me-bytes"),
      mime_type: "image/jpeg",
      size: 15,
    });

    const foundBefore = await getSnsMediaAttachmentById(att.id);
    expect(foundBefore).not.toBeNull();
    const filePath = foundBefore!.filePath;
    expect(fs.existsSync(filePath)).toBe(true);

    const deleted = await deleteSnsMediaAttachment(content.id, att.id);
    expect(deleted).toBe(true);

    // File on disk removed
    expect(fs.existsSync(filePath)).toBe(false);

    // Cannot find attachment anymore
    const foundAfter = await getSnsMediaAttachmentById(att.id);
    expect(foundAfter).toBeNull();

    // Audit log recorded
    const logs = await getAuditLogs({ account_id: acc.id });
    const deleteLog = logs.find((l) => l.action === "sns.delete_media");
    expect(deleteLog).toBeDefined();
    expect(deleteLog?.summary).toContain("to_delete.jpg");
  });

  it("미디어 서빙 API 라우트(/api/media/[id])가 스트리밍과 Range 헤더를 올바르게 처리한다", async () => {
    const acc = await createSnsAccount({
      company_name: "스트리밍테스트사",
      platform: "youtube",
      handle: "streaming_brand",
      starts_on: null,
      ends_on: null,
    });

    const content = await createSnsContent({
      account_id: acc.id,
      title: "스트리밍 시안",
      scheduled_on: null,
      assignee: null,
      caption: null,
      hashtags: null,
      media_note: null,
    });

    const testVideoContent = "0123456789ABCDEF0123456789ABCDEF"; // 32 bytes
    const att = await saveSnsMediaAttachment(content.id, {
      name: "stream_sample.mp4",
      buffer: Buffer.from(testVideoContent),
      mime_type: "video/mp4",
      size: 32,
    });

    // 1. Full GET request with token
    const fullReq = new NextRequest(`http://localhost:3000/api/media/${att.id}?token=${acc.approval_token}`);
    const fullRes = await GET(fullReq, { params: Promise.resolve({ id: att.id }) });
    expect(fullRes.status).toBe(200);
    expect(fullRes.headers.get("Content-Type")).toBe("video/mp4");
    expect(fullRes.headers.get("Content-Length")).toBe("32");

    // 2. Range request (bytes=0-9)
    const rangeReq = new NextRequest(`http://localhost:3000/api/media/${att.id}`, {
      headers: { Range: "bytes=0-9" },
    });
    const rangeRes = await GET(rangeReq, { params: Promise.resolve({ id: att.id }) });
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers.get("Content-Range")).toBe("bytes 0-9/32");
    expect(rangeRes.headers.get("Content-Length")).toBe("10");

    // 3. Unauthorized token
    const badTokenReq = new NextRequest(`http://localhost:3000/api/media/${att.id}?token=invalid_token`);
    const badTokenRes = await GET(badTokenReq, { params: Promise.resolve({ id: att.id }) });
    expect(badTokenRes.status).toBe(401);

    // 4. Missing ID
    const notFoundReq = new NextRequest("http://localhost:3000/api/media/non-existent-id");
    const notFoundRes = await GET(notFoundReq, { params: Promise.resolve({ id: "non-existent-id" }) });
    expect(notFoundRes.status).toBe(404);
  });
});
