"use server";

import { revalidatePath } from "next/cache";
import { getCampaignById, updateCampaign } from "@/lib/db";
import { CampaignStatus } from "@/lib/db/types";
import { ActionResult, runAction, fail } from "@/lib/actions/result";

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
