import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import {
  getCampaignById,
  getEventById,
  getEventChecklistItems,
  getEventInvitees,
  getEventPlan,
  getPptTemplateById,
  getPptTemplateBuffer,
} from "@/lib/db";
import { fillTemplate } from "@/lib/ppt/engine";
import { buildEventExtras } from "@/lib/ppt/extras";
import { fileDownloadResponse } from "@/lib/http/fileResponse";

const TEMPLATE_ERROR = "템플릿 파일을 불러오지 못했습니다. 다시 업로드해주세요.";

function textResponse(message: string, status: number) {
  return new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * 행사 운영안 PPT 다운로드.
 * 운영안이 저장되지 않았거나 템플릿을 못 읽으면 기본 템플릿으로 조용히 대체하지 않고 에러를 돌려준다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { id, eventId } = await params;
  // 초청명단·체크리스트는 템플릿에 `{{표:초청명단}}` 같은 자리가 있을 때만 쓰이지만, 여기서
  // 미리 받는다. 있는지 보려면 템플릿을 먼저 열어야 하고, 그러면 조회가 직렬로 늘어선다.
  // 둘 다 한 행사에 딸린 작은 목록이라 받아 두고 안 쓰는 편이 싸다.
  const [campaign, event, plan, invitees, checklist] = await Promise.all([
    getCampaignById(id),
    getEventById(eventId),
    getEventPlan(eventId),
    getEventInvitees(eventId),
    getEventChecklistItems(eventId),
  ]);

  if (!campaign || !event || event.campaign_id !== campaign.id) {
    return textResponse("행사를 찾을 수 없습니다.", 404);
  }
  if (!plan) {
    return textResponse("저장된 운영안이 없습니다. 운영안 탭에서 내용을 작성하고 저장한 뒤 다운로드해주세요.", 400);
  }

  const template = await getPptTemplateById(plan.template_id);
  const templateBuffer = template ? await getPptTemplateBuffer(template) : null;
  if (!template || !templateBuffer) {
    return textResponse(TEMPLATE_ERROR, 404);
  }

  try {
    const outputBuffer = await fillTemplate(templateBuffer, plan.field_values, buildEventExtras(invitees, checklist));
    const filename = encodeURIComponent(`${campaign.company_name}_${event.name}_운영안.pptx`);

    return fileDownloadResponse(outputBuffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation", filename);
  } catch (err) {
    console.error("Event PPT export failed:", err);
    return textResponse(TEMPLATE_ERROR, 500);
  }
}
