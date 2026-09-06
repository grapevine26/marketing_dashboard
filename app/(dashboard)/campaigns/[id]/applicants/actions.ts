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
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/applicants`);
  revalidatePath(`/campaigns/${campaignId}/seeding-sheet`);
  return res;
}
