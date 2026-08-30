"use server";

import { getCampaignByToken, createApplicant } from "@/lib/db";

export async function submitApplicantAction(params: {
  token: string;
  name: string;
  sns_link: string;
  nationality: string;
  contact: string;
  shipping_address?: string | null;
  visit_schedule?: string | null;
  visit_party_size?: number | null;
  custom_answers: Record<string, any>;
  privacy_agreed: boolean;
  secondary_use_agreed: boolean;
}) {
  const campaign = await getCampaignByToken("apply_form", params.token);
  if (!campaign) throw new Error("Invalid campaign token");

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

  return { success: true, applicant };
}