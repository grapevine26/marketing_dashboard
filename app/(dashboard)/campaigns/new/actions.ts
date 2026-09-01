"use server";

import { createCampaign } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function createCampaignAction(data: {
  name: string;
  company_name: string;
  campaign_type: "shipping" | "visit";
}) {
  if (!data.name || !data.company_name || !data.campaign_type) {
    throw new Error("Missing required fields");
  }

  const campaign = await createCampaign({
    name: data.name,
    company_name: data.company_name,
    campaign_type: data.campaign_type,
  });

  revalidatePath("/campaigns");
  revalidatePath("/");
  return { success: true, campaign };
}