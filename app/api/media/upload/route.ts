import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSnsContentById } from "@/lib/db";
import { ALLOWED_SNS_MEDIA_MIME_TYPES, MAX_SNS_MEDIA_BYTES } from "@/lib/db/types";
import { isBlobBackend } from "@/lib/db/storage";

export const dynamic = "force-dynamic";

/**
 * 브라우저가 Blob 에 직접 올릴 수 있게 업로드 토큰을 발급한다.
 *
 * Vercel 함수는 요청 본문을 4.5MB 로 자른다. 파일이 서버를 거치면 그보다 큰 건 못 올린다.
 * 그래서 파일은 브라우저에서 저장소로 바로 보내고, 서버는 무엇을 어디에 받을지만 정한다.
 *
 * 여기서 막는 것:
 * - 경로가 uploads/<UUID>.<확장자> 모양인지
 * - 그 확장자가 주장한 형식과 맞는지
 * - 그 첨부를 붙일 콘텐츠가 실제로 있는지
 * - 이미 있는 키를 덮어쓰려는 건 아닌지 (allowOverwrite: false)
 *
 * 내용이 진짜 이미지/영상인지는 업로드가 끝난 뒤 recordUploadedSnsMedia 가 앞부분을 읽어 확인한다.
 */
export async function POST(request: Request) {
  if (!isBlobBackend()) {
    return NextResponse.json(
      { error: "이 배포에는 Blob 저장소가 연결돼 있지 않습니다." },
      { status: 501 }
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const match = /^uploads\/([0-9a-f-]{36})(\.[a-z0-9]{3,4})$/i.exec(pathname);
        if (!match) {
          throw new Error("허용되지 않은 업로드 경로입니다.");
        }
        const ext = match[2].toLowerCase();

        let contentId = "";
        let mime = "";
        try {
          const parsed = JSON.parse(clientPayload || "{}") as { contentId?: string; mime?: string };
          contentId = parsed.contentId || "";
          mime = (parsed.mime || "").toLowerCase();
        } catch {
          throw new Error("잘못된 업로드 요청입니다.");
        }

        const expectedExt = ALLOWED_SNS_MEDIA_MIME_TYPES[mime];
        if (!expectedExt || expectedExt !== ext) {
          throw new Error("지원하지 않는 파일 형식입니다.");
        }

        // 아무나 저장소를 채우지 못하게, 붙일 자리가 실제로 있는지 확인한다.
        const content = await getSnsContentById(contentId);
        if (!content) {
          throw new Error("콘텐츠를 찾을 수 없습니다.");
        }

        return {
          allowedContentTypes: [mime],
          maximumSizeInBytes: MAX_SNS_MEDIA_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "업로드를 시작할 수 없습니다.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
