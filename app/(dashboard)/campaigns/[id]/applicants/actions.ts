"use server";

// 규칙: 액션 본문 첫 문장은 `return runAuthedAction(...)`. 존재 확인·DB 조회를 그 앞에서 하면 인증 전에 실행된다.

import {
  updateApplicantStatus,
  getApplicantById,
  getCampaignById,
  updateApplicantAgencyMemo,
  updateCampaignMessageTemplates,
  ValidationError,
} from "@/lib/db";
import { ApplicantStatus, Applicant } from "@/lib/db/types";
import { revalidatePath } from "next/cache";
import { ActionResult, runAuthedAction } from "@/lib/actions/result";
import { sendWebhookNotification } from "@/lib/notifications/webhook";

const APPLICANT_NOT_FOUND = "지원자가 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.";

/**
 * 에이전시(대시보드)에서의 선정 상태 변경. 실행 주체는 서버에서 "agency"로 고정한다.
 * 광고주 공유 링크용 액션은 app/applicants/[token]/actions.ts 에 따로 있다(토큰 검증 후 "company").
 */
export async function changeApplicantStatusAction(params: {
  applicantId: string;
  status: ApplicantStatus;
}): Promise<ActionResult<Applicant>> {
  return runAuthedAction(async () => {
    const existing = await getApplicantById(params.applicantId);
    if (!existing) throw new ValidationError(APPLICANT_NOT_FOUND);

    const result = await updateApplicantStatus(params.applicantId, params.status, "agency");
    if (!result) throw new ValidationError(APPLICANT_NOT_FOUND);

    const campaignId = existing.campaign_id;
    // 웹훅은 부가 기능이다. 실패해도 상태 변경은 이미 끝났으므로 경고만 남긴다.
    if (params.status === "selected") {
      try {
        const camp = await getCampaignById(campaignId);
        if (camp?.webhook_url) {
          await sendWebhookNotification(camp.webhook_url, {
            event: "applicant.selected",
            title: "인플루언서 최종선정 완료",
            message: `${existing.name}님이 '${camp.name}' 캠페인에 최종선정되었습니다.${existing.sns_link ? ` (SNS: ${existing.sns_link})` : ""}`,
            campaign_id: camp.id,
            campaign_name: camp.name,
            data: { applicant_id: existing.id, name: existing.name, sns_link: existing.sns_link },
          });
        }
      } catch (err) {
        console.warn("[webhook] 최종선정 웹훅 발송 오류:", err);
      }
    }

    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath(`/campaigns/${campaignId}/applicants`);
    revalidatePath(`/campaigns/${campaignId}/seeding-sheet`);
    return result.applicant;
  });
}

export async function updateAgencyMemoAction(params: {
  applicantId: string;
  memo: string;
}): Promise<ActionResult<Applicant>> {
  return runAuthedAction(async () => {
    const updated = await updateApplicantAgencyMemo(params.applicantId, params.memo);
    if (!updated) throw new ValidationError(APPLICANT_NOT_FOUND);
    revalidatePath(`/campaigns/${updated.campaign_id}/applicants`);
    return updated;
  });
}

export async function saveCampaignMessageTemplatesAction(params: {
  campaignId: string;
  templates: Record<string, string>;
}): Promise<ActionResult<{ success: boolean }>> {
  return runAuthedAction(async () => {
    const updated = await updateCampaignMessageTemplates(params.campaignId, params.templates);
    if (!updated) throw new ValidationError("캠페인이 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.");
    revalidatePath(`/campaigns/${params.campaignId}/applicants`);
    return { success: true };
  });
}
