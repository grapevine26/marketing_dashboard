import { NextRequest, NextResponse } from "next/server";
import { getSnsMediaAttachmentById, getSnsAccountById } from "@/lib/db";
import { readFile, statFile } from "@/lib/db/storage";

export const dynamic = "force-dynamic";

/**
 * SNS 시안 미디어 스트리밍.
 * - `?token=` 은 필수다. 해당 콘텐츠가 속한 계정의 승인 토큰 또는 사전설문 토큰만 통과한다.
 *   (대시보드도 계정의 approval_token 을 붙여 요청한다.)
 * - 광고주 시안이므로 캐시는 브라우저 개인 캐시로만 제한한다.
 * - 실제 바이트는 저장소 계층(로컬 파일 또는 Vercel Blob)에서 가져온다.
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
  if (!mediaInfo) {
    return new NextResponse("Media not found", { status: 404 });
  }
  const { attachment, storageKey, accountId } = mediaInfo;

  const token = request.nextUrl.searchParams.get("token") || "";
  const account = token ? await getSnsAccountById(accountId) : null;
  if (!account || (account.approval_token !== token && account.intake_token !== token)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const stat = await statFile(storageKey);
  if (!stat) {
    return new NextResponse("Media not found", { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": attachment.mime_type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
  };

  // 영상 탐색(seek)을 위한 Range 요청 지원
  const range = request.headers.get("range");
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    if (Number.isNaN(start) || start >= stat.size || end >= stat.size || start > end) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
  }

  const file = await readFile(storageKey, range);
  if (!file) {
    return new NextResponse("Media not found", { status: 404 });
  }

  // 저장소가 Range 를 무시하면 contentRange 가 비어 온다. 그때는 전체 응답(200)으로 돌려준다.
  if (file.status === 206 && file.contentRange) {
    return new NextResponse(file.stream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": file.contentRange,
        ...(file.size !== null ? { "Content-Length": String(file.size) } : {}),
      },
    });
  }

  return new NextResponse(file.stream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(file.size ?? stat.size) },
  });
}
