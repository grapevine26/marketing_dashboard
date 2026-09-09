import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { MAX_PPT_TEMPLATE_BYTES } from "@/lib/db/types";
import { isBlobBackend } from "@/lib/db/storage";

export const dynamic = "force-dynamic";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * PPT 템플릿을 브라우저에서 저장소로 바로 올리기 위한 토큰 발급.
 *
 * Vercel 함수는 요청 본문을 4.5MB 로 자른다. 이미지가 든 pptx 는 그보다 쉽게 커진다.
 * 파일이 진짜 pptx 인지는 업로드가 끝난 뒤 recordUploadedPptTemplate 가 앞부분을 읽어 확인한다.
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
      onBeforeGenerateToken: async (pathname) => {
        // 새 등록은 templates/<id>.pptx, 파일 교체는 templates/<id>-<버전>.pptx 로 온다.
        if (!/^templates\/[0-9a-f-]{36}(-\d{1,20})?\.pptx$/i.test(pathname)) {
          throw new Error("허용되지 않은 업로드 경로입니다.");
        }
        return {
          allowedContentTypes: [PPTX_MIME, "application/octet-stream"],
          maximumSizeInBytes: MAX_PPT_TEMPLATE_BYTES,
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
