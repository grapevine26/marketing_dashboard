"use server";

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
import { ActionResult, runAuthedAction, fail } from "@/lib/actions/result";
import { sendWebhookNotification } from "@/lib/notifications/webhook";

export async function updateCampaignStatusAction(
  campaignId: string,
  status: CampaignStatus
): Promise<ActionResult<{ status: CampaignStatus }>> {
  const existing = await getCampaignById(campaignId);
  if (!existing) return fail("캠페인을 찾을 수 없습니다.");

  const res = await runAuthedAction(async () => {
    const camp = await updateCampaign(campaignId, { status });
    return { status: camp?.status ?? status };
  });
  if (!res.ok) return res;
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  return res;
}

export async function deleteCampaignAction(
  campaignId: string
): Promise<ActionResult<boolean>> {
  const existing = await getCampaignById(campaignId);
  if (!existing) return fail("캠페인을 찾을 수 없습니다.");

  const res = await runAuthedAction(async () => {
    const deleted = await deleteCampaign(campaignId);
    if (!deleted) throw new Error("캠페인을 찾을 수 없습니다.");
    return true;
  });
  if (res.ok) {
    revalidatePath("/campaigns");
    revalidatePath("/");
  }
  return res;
}

export async function saveCampaignWebhookAction(
  campaignId: string,
  webhookUrl: string | null
): Promise<ActionResult<{ webhook_url?: string }>> {
  const existing = await getCampaignById(campaignId);
  if (!existing) return fail("캠페인을 찾을 수 없습니다.");

  const res = await runAuthedAction(async () => {
    const updated = await updateCampaignWebhookUrl(campaignId, webhookUrl);
    return { webhook_url: updated?.webhook_url };
  });
  if (res.ok) {
    revalidatePath(`/campaigns/${campaignId}`);
  }
  return res;
}

export async function testCampaignWebhookAction(
  campaignId: string,
  webhookUrl: string
): Promise<ActionResult<{ ok: boolean; status?: number }>> {
  // 이 파일에서 유일하게 감싸지 않았던 액션이다. 서버 액션은 공개 경로로도 호출할 수 있어서
  // 감싸지 않으면 캠페인 id 만 아는 외부인이 자기 웹훅으로 캠페인 이름을 빼내거나 스팸을 보낼 수 있다.
  return runAuthedAction(async () => {
    const existing = await getCampaignById(campaignId);
    if (!existing) throw new ValidationError("캠페인을 찾을 수 없습니다.");

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
  const existing = await getCampaignById(campaignId);
  if (!existing) return fail("캠페인을 찾을 수 없습니다.");

  const res = await runAuthedAction(async () => {
    return await regenerateCampaignToken(campaignId, tokenType);
  });
  if (res.ok) {
    revalidatePath(`/campaigns/${campaignId}`);
  }
  return res;
}
