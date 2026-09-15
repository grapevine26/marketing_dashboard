import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getSnsMediaAttachmentById, getSnsAccountById, isSnsAccountClosed } from "@/lib/db";
import { readFile, statFile } from "@/lib/db/storage";

export const dynamic = "force-dynamic";

/**
 * SNS 시안 미디어 스트리밍.
 * - 광고주는 `?token=` 이 필수다. 해당 콘텐츠가 속한 계정의 **승인 토큰만** 통과한다.
 *   사전설문(intake) 토큰은 받지 않는다. 그쪽은 시안을 볼 자리가 아니다.
 *   (대시보드도 계정의 approval_token 을 붙여 요청하지만, 직원은 토큰 없이도 통과한다.)
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
  const { attachment, storageKey, accountId, contentStatus } = mediaInfo;

  // 이 파일을 볼 수 있는 사람은 둘이고, 조건이 서로 다르다.
  //
  // **직원**: 로그인해 있으면 상태와 무관하게 본다. 자기가 만드는 시안이라 기획 단계도 봐야 한다.
  //   (대시보드 화면도 이 경로로 이미지를 그린다.)
  //
  // **광고주**: 승인 링크의 토큰으로만 본다. 그리고 **승인 화면이 보여주는 범위와 같아야 한다.**
  //   화면은 막았는데 파일만 열려 있으면 파일이 곧 우회 경로가 된다.
  //   - 사전설문 토큰은 안 받는다. 그 화면은 시안을 다루지 않는다.
  //   - 계약이 끝났으면 닫는다.
  //   - 승인 대기 중인 콘텐츠만 연다. 한 번 본 사람이 지난 시안까지 영구히 받아가면 안 된다.
  const viewer = await getCurrentUser();
  const isStaff = viewer?.status === "active";

  const token = request.nextUrl.searchParams.get("token") || "";
  const account = await getSnsAccountById(accountId);
  const advertiserAllowed =
    account !== null &&
    token !== "" &&
    account.approval_token === token &&
    // 계약이 끝났으면(상태가 "ended" 이거나 종료일이 지났으면) 파일도 닫는다.
    // 화면만 닫고 파일을 열어 두면 그 파일이 곧 우회 경로가 된다.
    !isSnsAccountClosed(account) &&
    contentStatus === "pending_approval";

  if (!account || (!isStaff && !advertiserAllowed)) {
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
