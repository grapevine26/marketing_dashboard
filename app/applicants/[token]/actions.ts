"use server";

// 규칙: 액션 본문 첫 문장은 `return runAction(...)`. 토큰 확인·DB 조회도 래퍼 안에서 해서 오류가 밖으로 새지 않게 한다.

import { getCampaignByToken, getApplicantById, updateApplicantStatus, ValidationError } from "@/lib/db";
import { Applicant, ApplicantStatus } from "@/lib/db/types";
import { revalidatePath } from "next/cache";
import { ActionResult, runAction } from "@/lib/actions/result";
import { sendWebhookNotification } from "@/lib/notifications/webhook";

const APPLICANT_NOT_FOUND = "지원자가 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.";

/**
 * 광고주 공유 링크(/applicants/[token])에서의 최종선정/예비선정.
 * 토큰으로 캠페인을 확인하고, 지원자가 그 캠페인 소속일 때만 처리한다. 실행 주체는 "company"로 고정.
 * 광고주가 보는 화면이라 오류 문구는 전부 한국어로, 내부 정보 없이 돌려준다.
 */
export async function changeApplicantStatusByTokenAction(params: {
  token: string;
  applicantId: string;
  status: ApplicantStatus;
}): Promise<ActionResult<Applicant>> {
  return runAction(async () => {
    const campaign = await getCampaignByToken("applicants_share", params.token);
    if (!campaign) throw new ValidationError("유효하지 않은 공유 링크입니다. 담당자에게 새 링크를 요청해주세요.");

    const applicant = await getApplicantById(params.applicantId);
    if (!applicant || applicant.campaign_id !== campaign.id) throw new ValidationError(APPLICANT_NOT_FOUND);

    const result = await updateApplicantStatus(params.applicantId, params.status, "company");
    if (!result) throw new ValidationError(APPLICANT_NOT_FOUND);

    // 웹훅은 부가 기능이다. 실패해도 선정은 이미 끝났으므로 경고만 남긴다.
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
    return result.applicant;
  });
}
