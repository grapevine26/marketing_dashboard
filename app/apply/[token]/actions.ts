"use server";

import { getCampaignByToken, createApplicant } from "@/lib/db";
import { ActionResult, runAction, fail } from "@/lib/actions/result";
import { revalidatePath } from "next/cache";

export async function submitApplicantAction(params: {
  token: string;
  name: string;
  sns_link: string;
  nationality: string;
  contact: string;
  shipping_address?: string | null;
  visit_schedule?: string | null;
  visit_party_size?: number | null;
  custom_answers: Record<string, unknown>;
  privacy_agreed: boolean;
  secondary_use_agreed: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const campaign = await getCampaignByToken("apply_form", params.token);
  if (!campaign) return fail("유효하지 않은 지원 링크입니다.");

  const res = await runAction(async () => {
    const applicant = await createApplicant({
      campaign_id: campaign.id,
      name: params.name,
      sns_link: params.sns_link,
      nationality: params.nationality,
      contact: params.contact,
      shipping_address: params.shipping_address,
      visit_schedule: params.visit_schedule,
      visit_party_size: params.visit_party_size,
      custom_answers: params.custom_answers,
      privacy_agreed: params.privacy_agreed,
      secondary_use_agreed: params.secondary_use_agreed,
    });
    return { id: applicant.id };
  });
  if (res.ok) {
    revalidatePath(`/campaigns/${campaign.id}`);
    revalidatePath(`/campaigns/${campaign.id}/applicants`);
  }
  return res;
}
