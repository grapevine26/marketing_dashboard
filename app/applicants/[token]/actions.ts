"use server";

import { getCampaignByToken, getApplicantById, updateApplicantStatus } from "@/lib/db";
import { Applicant, ApplicantStatus } from "@/lib/db/types";
import { revalidatePath } from "next/cache";
import { ActionResult, runAction, fail } from "@/lib/actions/result";
import { sendWebhookNotification } from "@/lib/notifications/webhook";

/**
 * 광고주 공유 링크(/applicants/[token])에서의 최종선정/예비선정.
 * 토큰으로 캠페인을 확인하고, 지원자가 그 캠페인 소속일 때만 처리한다. 실행 주체는 "company"로 고정.
 */
export async function changeApplicantStatusByTokenAction(params: {
  token: string;
  applicantId: string;
  status: ApplicantStatus;
}): Promise<ActionResult<Applicant>> {
  const campaign = await getCampaignByToken("applicants_share", params.token);
  if (!campaign) return fail("유효하지 않은 공유 링크입니다.");

  const applicant = await getApplicantById(params.applicantId);
  if (!applicant || applicant.campaign_id !== campaign.id) {
    return fail("지원자를 찾을 수 없습니다.");
  }

  const res = await runAction(async () => {
    const result = await updateApplicantStatus(params.applicantId, params.status, "company");
    if (!result) throw new Error("not found");
    return result.applicant;
  });
  if (!res.ok) return res;

  if (params.status === "selected" && campaign.webhook_url) {
    try {
      await sendWebhookNotification(campaign.webhook_url, {
        event: "applicant.selected",
        title: "인플루언서 최종선정 완료",
        message: `${applicant.name}님이 '${campaign.name}' 캠페인에 최종선정되었습니다. (광고주 선정)${applicant.sns_link ? ` (SNS: ${applicant.sns_link})` : ""}`,
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        data: { applicant_id: applicant.id, name: applicant.name, sns_link: applicant.sns_link },
      });
    } catch (err) {
      console.warn("[webhook] 광고주 최종선정 웹훅 발송 오류:", err);
    }
  }

  revalidatePath(`/applicants/${params.token}`);
  revalidatePath(`/campaigns/${campaign.id}`);
  revalidatePath(`/campaigns/${campaign.id}/applicants`);
  revalidatePath(`/campaigns/${campaign.id}/seeding-sheet`);
  return res;
}
