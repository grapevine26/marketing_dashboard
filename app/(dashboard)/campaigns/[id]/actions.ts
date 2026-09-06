"use server";

import { revalidatePath } from "next/cache";
import {
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  updateCampaignWebhookUrl,
  regenerateCampaignToken,
} from "@/lib/db";
import { Campaign, CampaignStatus, CampaignTokenType } from "@/lib/db/types";
import { ActionResult, runAction, fail } from "@/lib/actions/result";
import { sendWebhookNotification } from "@/lib/notifications/webhook";

export async function updateCampaignStatusAction(
  campaignId: string,
  status: CampaignStatus
): Promise<ActionResult<{ status: CampaignStatus }>> {
  const existing = await getCampaignById(campaignId);
  if (!existing) return fail("캠페인을 찾을 수 없습니다.");

  const res = await runAction(async () => {
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

  const res = await runAction(async () => {
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

  const res = await runAction(async () => {
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
  const existing = await getCampaignById(campaignId);
  if (!existing) return fail("캠페인을 찾을 수 없습니다.");

  const result = await sendWebhookNotification(webhookUrl, {
    event: "test.ping",
    title: "웹훅 연동 테스트 성공",
    message: `'${existing.name}' 캠페인의 웹훅 알림 연동이 성공적으로 확인되었습니다!`,
    campaign_id: existing.id,
    campaign_name: existing.name,
  });

  if (!result.ok) {
    return fail(result.error || "웹훅 발송 실패");
  }
  return { ok: true, data: { ok: true, status: result.status } };
}

export async function regenerateCampaignTokenAction(
  campaignId: string,
  tokenType: CampaignTokenType
): Promise<ActionResult<Campaign>> {
  const existing = await getCampaignById(campaignId);
  if (!existing) return fail("캠페인을 찾을 수 없습니다.");

  const res = await runAction(async () => {
    return await regenerateCampaignToken(campaignId, tokenType);
  });
  if (res.ok) {
    revalidatePath(`/campaigns/${campaignId}`);
  }
  return res;
}
