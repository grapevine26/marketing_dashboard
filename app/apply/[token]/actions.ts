"use server";

import { getCampaignByToken, createApplicant } from "@/lib/db";
import { ActionResult, runAction, fail } from "@/lib/actions/result";
import { sendWebhookNotification } from "@/lib/notifications/webhook";
import { checkRateLimit, getClientIp } from "@/lib/security/rateLimit";
import { revalidatePath } from "next/cache";

export async function submitApplicantAction(params: {
  token: string;
  name: string;
  sns_link: string;
  nationality: string;
  contact: string;
  follower_count?: number | null;
  category?: string | null;
  shipping_address?: string | null;
  visit_schedule?: string | null;
  visit_party_size?: number | null;
  custom_answers: Record<string, unknown>;
  privacy_agreed: boolean;
  secondary_use_agreed: boolean;
  honeypot?: string;
  allow_duplicate?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  // 허니팟(Honeypot) 스팸 방어: 숨김 필드가 채워진 경우 봇으로 간주하여 무음 성공 반환
  if (params.honeypot && params.honeypot.trim().length > 0) {
    return { ok: true, data: { id: "spam_filtered" } };
  }

  // Rate Limiting (10분 내 5회 제한)
  const clientIp = await getClientIp();
  const rateLimit = checkRateLimit(`apply:${params.token}:${clientIp}`, 5, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return fail("단시간에 너무 많은 지원 요청이 발생했습니다. 10분 후 다시 시도해 주세요.");
  }

  const campaign = await getCampaignByToken("apply_form", params.token);
  if (!campaign) return fail("유효하지 않은 지원 링크입니다.");

  const res = await runAction(async () => {
    const applicant = await createApplicant({
      campaign_id: campaign.id,
      name: params.name,
      sns_link: params.sns_link,
      nationality: params.nationality,
      contact: params.contact,
      follower_count: params.follower_count,
      category: params.category,
      shipping_address: params.shipping_address,
      visit_schedule: params.visit_schedule,
      visit_party_size: params.visit_party_size,
      custom_answers: params.custom_answers,
      privacy_agreed: params.privacy_agreed,
      secondary_use_agreed: params.secondary_use_agreed,
      allow_duplicate: params.allow_duplicate,
    });
    return { id: applicant.id };
  });
  if (res.ok) {
    if (campaign.webhook_url) {
      try {
        await sendWebhookNotification(campaign.webhook_url, {
          event: "applicant.applied",
          title: "새로운 인플루언서 지원 접수",
          message: `${params.name}님이 '${campaign.name}' 캠페인에 지원했습니다. (SNS: ${params.sns_link})`,
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          data: {
            applicant_id: res.data.id,
            name: params.name,
            sns_link: params.sns_link,
            follower_count: params.follower_count,
            category: params.category,
          },
        });
      } catch (err) {
        console.warn("[webhook] 지원 접수 웹훅 발송 오류:", err);
      }
    }
    revalidatePath(`/campaigns/${campaign.id}`);
    revalidatePath(`/campaigns/${campaign.id}/applicants`);
  }
  return res;
}
