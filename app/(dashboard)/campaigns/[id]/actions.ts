"use server";

// 규칙: 액션 본문 첫 문장은 `return runAuthedAction(...)`. 존재 확인·DB 조회를 그 앞에서 하면 인증 전에 실행된다.

import { revalidatePath } from "next/cache";
import {
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  updateCampaignWebhookUrl,
  regenerateCampaignToken,
  ValidationError,
} from "@/lib/db";
import { Campaign, CampaignStatus, CampaignTokenType } from "@/lib/db/types";
import { isManager } from "@/lib/auth/roles";
import { ActionResult, runAuthedAction } from "@/lib/actions/result";
import { sendWebhookNotification } from "@/lib/notifications/webhook";

const NOT_FOUND = "캠페인이 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.";

export async function updateCampaignStatusAction(
  campaignId: string,
  status: CampaignStatus
): Promise<ActionResult<{ status: CampaignStatus }>> {
  return runAuthedAction(async () => {
    const camp = await updateCampaign(campaignId, { status });
    if (!camp) throw new ValidationError(NOT_FOUND);
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/campaigns");
    return { status: camp.status };
  });
}

/**
 * 캠페인 삭제는 관리자 이상만. 직원이 부르면 리다이렉트 대신 이유를 돌려준다.
 * (runAdminAction 은 "/" 로 보내 버려서 화면에서 왜 안 되는지 알 수 없다.)
 */
export async function deleteCampaignAction(
  campaignId: string
): Promise<ActionResult<boolean>> {
  return runAuthedAction(async (user) => {
    if (!isManager(user.role)) throw new ValidationError("캠페인 삭제는 관리자만 할 수 있습니다.");
    const existing = await getCampaignById(campaignId);
    if (!existing) throw new ValidationError(NOT_FOUND);

    const deleted = await deleteCampaign(campaignId);
    if (!deleted) throw new ValidationError(NOT_FOUND);
    revalidatePath("/campaigns");
    revalidatePath("/");
    return true;
  });
}

export async function saveCampaignWebhookAction(
  campaignId: string,
  webhookUrl: string | null
): Promise<ActionResult<{ webhook_url?: string }>> {
  return runAuthedAction(async () => {
    const updated = await updateCampaignWebhookUrl(campaignId, webhookUrl);
    if (!updated) throw new ValidationError(NOT_FOUND);
    revalidatePath(`/campaigns/${campaignId}`);
    return { webhook_url: updated.webhook_url };
  });
}

export async function testCampaignWebhookAction(
  campaignId: string,
  webhookUrl: string
): Promise<ActionResult<{ ok: boolean; status?: number }>> {
  // 서버 액션은 공개 경로로도 호출할 수 있어서, 감싸지 않으면 캠페인 id 만 아는 외부인이
  // 자기 웹훅으로 캠페인 이름을 빼내거나 스팸을 보낼 수 있다.
  return runAuthedAction(async () => {
    const existing = await getCampaignById(campaignId);
    if (!existing) throw new ValidationError(NOT_FOUND);

    const result = await sendWebhookNotification(webhookUrl, {
      event: "test.ping",
      title: "웹훅 연동 테스트 성공",
      message: `'${existing.name}' 캠페인의 웹훅 알림 연동이 성공적으로 확인되었습니다!`,
      campaign_id: existing.id,
      campaign_name: existing.name,
    });

    if (!result.ok) throw new ValidationError(result.error || "웹훅 발송 실패");
    return { ok: true, status: result.status };
  });
}

export async function regenerateCampaignTokenAction(
  campaignId: string,
  tokenType: CampaignTokenType
): Promise<ActionResult<Campaign>> {
  return runAuthedAction(async () => {
    // regenerateCampaignToken 이 없는 캠페인이면 ValidationError 를 던진다.
    const updated = await regenerateCampaignToken(campaignId, tokenType);
    revalidatePath(`/campaigns/${campaignId}`);
    return updated;
  });
}
