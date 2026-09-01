import { NextRequest, NextResponse } from "next/server";
import { getSnsAccountById, getSnsPlan, getPptTemplateById } from "@/lib/db";
import { fillTemplate, generateDefaultPptBuffer } from "@/lib/ppt/engine";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [account, plan] = await Promise.all([
    getSnsAccountById(id),
    getSnsPlan(id),
  ]);

  if (!account) {
    return new NextResponse("Not Found", { status: 404 });
  }

  let templateBuffer: Buffer;
  let fieldValues: Record<string, string> = plan?.field_values || {};

  if (plan?.template_id) {
    const template = await getPptTemplateById(plan.template_id);
    if (template?.file_data) {
      templateBuffer = Buffer.from(template.file_data, "base64");
    } else {
      templateBuffer = await generateDefaultPptBuffer("sns");
    }
  } else {
    templateBuffer = await generateDefaultPptBuffer("sns");
    if (Object.keys(fieldValues).length === 0) {
      fieldValues = {
        브랜드명: account.company_name,
        채널명: `${account.platform.toUpperCase()} (@${account.handle})`,
        계약기간: `${account.starts_on || ""} ~ ${account.ends_on || ""}`,
        운영목표: "오가닉 팔로워 증대 및 신제품 바이럴 확산",
        타겟오디언스: "2030 여성 타깃",
        콘텐츠방향성: "릴스 및 감성 피드 큐레이션",
        월별계획: "1개월차: 인지도 제고\n2개월차: 바이럴 확산\n3개월차: 구매 전환",
      };
    }
  }

  const outputBuffer = await fillTemplate(templateBuffer, fieldValues);
  const filename = encodeURIComponent(`${account.company_name}_SNS운영제안서.pptx`);

  return new NextResponse(outputBuffer as any, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
    },
  });
}