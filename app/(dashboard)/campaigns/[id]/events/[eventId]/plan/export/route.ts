import { NextRequest, NextResponse } from "next/server";
import { getCampaignById, getEventById, getEventPlan, getPptTemplateById } from "@/lib/db";
import { fillTemplate, generateDefaultPptBuffer } from "@/lib/ppt/engine";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const { id, eventId } = await params;
  const [campaign, event, plan] = await Promise.all([
    getCampaignById(id),
    getEventById(eventId),
    getEventPlan(eventId),
  ]);

  if (!campaign || !event) {
    return new NextResponse("Not Found", { status: 404 });
  }

  let templateBuffer: Buffer;
  let fieldValues: Record<string, string> = plan?.field_values || {};

  if (plan?.template_id) {
    const template = await getPptTemplateById(plan.template_id);
    if (template?.file_data) {
      templateBuffer = Buffer.from(template.file_data, "base64");
    } else {
      templateBuffer = await generateDefaultPptBuffer("event");
    }
  } else {
    templateBuffer = await generateDefaultPptBuffer("event");
    if (Object.keys(fieldValues).length === 0) {
      fieldValues = {
        브랜드명: campaign.company_name,
        행사명: event.name,
        행사일시: event.event_at ? new Date(event.event_at).toLocaleString() : "일시 미정",
        행사장소: event.venue || "장소 미정",
        행사개요: event.memo || "행사 기획안",
        프로그램: "18:00 리셉션\n19:00 프레젠테이션\n20:00 네트워킹",
      };
    }
  }

  const outputBuffer = await fillTemplate(templateBuffer, fieldValues);
  const filename = encodeURIComponent(`${campaign.company_name}_${event.name}_운영안.pptx`);

  return new NextResponse(outputBuffer as any, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
    },
  });
}