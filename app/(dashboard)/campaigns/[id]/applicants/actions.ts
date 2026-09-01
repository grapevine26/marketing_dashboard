"use server";

import { updateApplicantStatus } from "@/lib/db";
import { ApplicantStatus } from "@/lib/db/types";
import { revalidatePath } from "next/cache";

export async function changeApplicantStatusAction(params: {
  applicantId: string;
  status: ApplicantStatus;
  changedBy: "agency" | "company";
  campaignId: string;
}) {
  const applicant = await updateApplicantStatus(
    params.applicantId,
    params.status,
    params.changedBy,
    params.campaignId
  );

  revalidatePath(`/campaigns/${params.campaignId}`);
  revalidatePath(`/campaigns/${params.campaignId}/applicants`);
  revalidatePath(`/campaigns/${params.campaignId}/seeding-sheet`);
  return { success: true, applicant };
}