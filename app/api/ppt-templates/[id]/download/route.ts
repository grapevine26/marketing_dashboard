import { NextResponse } from "next/server";
import { getPptTemplateById, getPptTemplateBuffer } from "@/lib/db";
import { fileDownloadResponse } from "@/lib/http/fileResponse";

export const dynamic = "force-dynamic";

/**
 * 등록된 템플릿 원본 내려받기.
 *
 * 올린 파일을 다시 꺼낼 수 없으면, 디자인을 조금 고치려 해도 원본을 따로 보관하고 있어야 한다.
 * 기본 내장 템플릿은 코드에서 만들어 내려준다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const template = await getPptTemplateById(id);
  if (!template) {
    return new NextResponse("템플릿을 찾을 수 없습니다.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const buffer = await getPptTemplateBuffer(template);
  if (!buffer) {
    return new NextResponse("템플릿 파일을 불러오지 못했습니다. 다시 업로드해주세요.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const filename = encodeURIComponent(`${template.name}.pptx`);
  return fileDownloadResponse(
    buffer,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    filename
  );
}
