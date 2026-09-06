"use server";

import { updateApplicantStatus, getApplicantById } from "@/lib/db";
import { ApplicantStatus, Applicant } from "@/lib/db/types";
import { revalidatePath } from "next/cache";
import { ActionResult, runAction, fail } from "@/lib/actions/result";

/**
 * 에이전시(대시보드)에서의 선정 상태 변경. 실행 주체는 서버에서 "agency"로 고정한다.
 * 광고주 공유 링크용 액션은 app/applicants/[token]/actions.ts 에 따로 있다(토큰 검증 후 "company").
 */
export async function changeApplicantStatusAction(params: {
  applicantId: string;
  status: ApplicantStatus;
}): Promise<ActionResult<Applicant>> {
  const existing = await getApplicantById(params.applicantId);
  if (!existing) return fail("지원자를 찾을 수 없습니다.");

  const res = await runAction(async () => {
    const result = await updateApplicantStatus(params.applicantId, params.status, "agency");
    if (!result) throw new Error("not found");
    return result.applicant;
  });
  if (!res.ok) return res;

  const campaignId = existing.campaign_id;
  if (params.status === "selected") {
    void (async () => {
      try {
        const { getCampaignById } = await import("@/lib/db");
        const { sendWebhookNotification } = await import("@/lib/notifications/webhook");
        const camp = await getCampaignById(campaignId);
        if (camp?.webhook_url) {
          await sendWebhookNotification(camp.webhook_url, {
            event: "applicant.selected",
            title: "인플루언서 최종선정 완료",
            message: `${existing.name}님이 '${camp.name}' 캠페인에 최종선정되었습니다.`,
            campaign_id: camp.id,
            campaign_name: camp.name,
            data: { applicant_id: existing.id, name: existing.name, sns_link: existing.sns_link },
          });
        }
      } catch {
        // non-blocking
      }
    })();
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/applicants`);
  revalidatePath(`/campaigns/${campaignId}/seeding-sheet`);
  return res;
}

export async function updateAgencyMemoAction(params: {
  applicantId: string;
  memo: string;
}): Promise<ActionResult<Applicant>> {
  const existing = await getApplicantById(params.applicantId);
  if (!existing) return fail("지원자를 찾을 수 없습니다.");

  const res = await runAction(async () => {
    const { updateApplicantAgencyMemo } = await import("@/lib/db");
    const updated = await updateApplicantAgencyMemo(params.applicantId, params.memo);
    if (!updated) throw new Error("not found");
    return updated;
  });
  if (res.ok) {
    revalidatePath(`/campaigns/${existing.campaign_id}/applicants`);
  }
  return res;
}

export async function saveCampaignMessageTemplatesAction(params: {
  campaignId: string;
  templates: Record<string, string>;
}): Promise<ActionResult<{ success: boolean }>> {
  const res = await runAction(async () => {
    const { updateCampaignMessageTemplates } = await import("@/lib/db");
    const updated = await updateCampaignMessageTemplates(params.campaignId, params.templates);
    if (!updated) throw new Error("not found");
    return { success: true };
  });
  if (res.ok) {
    revalidatePath(`/campaigns/${params.campaignId}/applicants`);
  }
  return res;
}
