import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import {
  getSnsAccountById,
  getSnsContentsByAccountId,
  getSnsPlan,
  getPptTemplateById,
  getPptTemplateBuffer,
} from "@/lib/db";
import { fillTemplate } from "@/lib/ppt/engine";
import { buildSnsExtras } from "@/lib/ppt/extras";
import { fileDownloadResponse } from "@/lib/http/fileResponse";

const TEMPLATE_ERROR = "템플릿 파일을 불러오지 못했습니다. 다시 업로드해주세요.";

function textResponse(message: string, status: number) {
  return new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * SNS 운영안 PPT 다운로드. 운영안 미저장/템플릿 미선택/템플릿 파일 없음은 각각 에러로 돌려준다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  // 콘텐츠는 `{{표:콘텐츠}}`·`{{차트:월별성과}}` 자리가 있을 때만 쓰인다. 행사 쪽과 같은 이유로
  // 템플릿을 열기 전에 미리 받는다(조회를 직렬로 늘어세우지 않으려고).
  const [account, plan, contents] = await Promise.all([
    getSnsAccountById(id),
    getSnsPlan(id),
    getSnsContentsByAccountId(id),
  ]);

  if (!account) return textResponse("계정을 찾을 수 없습니다.", 404);
  if (!plan) return textResponse("저장된 운영안이 없습니다. 운영안을 작성하고 저장한 뒤 다운로드해주세요.", 400);
  if (!plan.template_id) return textResponse("운영안에 PPT 템플릿이 선택되지 않았습니다. 템플릿을 선택하고 저장해주세요.", 400);

  const template = await getPptTemplateById(plan.template_id);
  const templateBuffer = template ? await getPptTemplateBuffer(template) : null;
  if (!template || !templateBuffer) return textResponse(TEMPLATE_ERROR, 404);

  try {
    const outputBuffer = await fillTemplate(templateBuffer, plan.field_values, buildSnsExtras(contents));
    const filename = encodeURIComponent(`${account.company_name}_SNS운영제안서.pptx`);
    return fileDownloadResponse(outputBuffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation", filename);
  } catch (err) {
    console.error("SNS PPT export failed:", err);
    return textResponse(TEMPLATE_ERROR, 500);
  }
}
