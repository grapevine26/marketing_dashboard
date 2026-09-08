import { NextRequest, NextResponse } from "next/server";
import { getReportById, getPptTemplateById, getPptTemplateBuffer, ValidationError, BUILTIN_REPORT_TEMPLATE_ID } from "@/lib/db";
import { generateReportPPTX } from "@/lib/reports/pptx";
import { fileDownloadResponse } from "@/lib/http/fileResponse";

function textResponse(message: string, status: number) {
  return new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * 결과보고서 PPTX. `?template=<ppt_templates.id>`로 kind=report 템플릿을 고를 수 있고, 없으면 내장 템플릿.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const report = await getReportById(reportId);
  if (!report) return textResponse("보고서를 찾을 수 없습니다.", 404);

  const templateId = new URL(request.url).searchParams.get("template") || BUILTIN_REPORT_TEMPLATE_ID;
  const template = await getPptTemplateById(templateId);
  if (!template || template.kind !== "report") {
    return textResponse("보고서용 PPT 템플릿을 찾을 수 없습니다.", 404);
  }
  const templateBuffer = await getPptTemplateBuffer(template);
  if (!templateBuffer) return textResponse("템플릿 파일을 불러오지 못했습니다. 다시 업로드해주세요.", 404);

  try {
    const pptxBuffer = await generateReportPPTX(report, templateBuffer);
    const filename = encodeURIComponent(`${report.title}.pptx`);
    return fileDownloadResponse(pptxBuffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation", filename);
  } catch (error) {
    if (error instanceof ValidationError) return textResponse(error.message, 400);
    console.error("PPTX generation failed:", error);
    return textResponse("PPTX 생성에 실패했습니다.", 500);
  }
}
