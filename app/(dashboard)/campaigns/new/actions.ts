"use server";

import { createCampaign } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { ActionResult, runAction } from "@/lib/actions/result";

export async function createCampaignAction(data: {
  name: string;
  company_name: string;
  campaign_type: "shipping" | "visit";
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const campaign = await createCampaign({
      name: data.name,
      company_name: data.company_name,
      campaign_type: data.campaign_type,
    });
    revalidatePath("/campaigns");
    revalidatePath("/");
    return { id: campaign.id };
  });
}
