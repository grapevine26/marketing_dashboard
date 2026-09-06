import { NextRequest, NextResponse } from "next/server";
import { getSnsMediaAttachmentById, getSnsAccountById } from "@/lib/db";
import fs from "fs";

export const dynamic = "force-dynamic";

/**
 * SNS 시안 미디어 스트리밍.
 * - `?token=` 은 필수다. 해당 콘텐츠가 속한 계정의 승인 토큰 또는 사전설문 토큰만 통과한다.
 *   (대시보드도 계정의 approval_token 을 붙여 요청한다.)
 * - 광고주 시안이므로 캐시는 브라우저 개인 캐시로만 제한한다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse("Media not found", { status: 404 });
  }

  const mediaInfo = await getSnsMediaAttachmentById(id);
  if (!mediaInfo || !fs.existsSync(/*turbopackIgnore: true*/ mediaInfo.filePath)) {
    return new NextResponse("Media not found", { status: 404 });
  }
  const { attachment, filePath, accountId } = mediaInfo;

  const token = request.nextUrl.searchParams.get("token") || "";
  const account = token ? await getSnsAccountById(accountId) : null;
  if (!account || (account.approval_token !== token && account.intake_token !== token)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": attachment.mime_type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
  };

  const stat = fs.statSync(/*turbopackIgnore: true*/ filePath);
  const fileSize = stat.size;
  const range = request.headers.get("range");

  // 영상 탐색(seek)을 위한 Range 요청 지원
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (Number.isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${fileSize}` } });
    }

    const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ filePath, { start, end });
    const stream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => controller.enqueue(chunk));
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new NextResponse(stream, {
      status: 206,
      headers: { ...baseHeaders, "Content-Range": `bytes ${start}-${end}/${fileSize}`, "Content-Length": String(end - start + 1) },
    });
  }

  const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ filePath);
  const stream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(chunk));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
  return new NextResponse(stream, { status: 200, headers: { ...baseHeaders, "Content-Length": String(fileSize) } });
}
