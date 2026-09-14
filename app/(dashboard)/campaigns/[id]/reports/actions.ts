"use server";

import { createReport, updateReportCustomSections } from "@/lib/db";
import { CustomSection } from "@/lib/db/types";
import { revalidatePath } from "next/cache";
import { ActionResult, runAuthedAction, fail } from "@/lib/actions/result";

export async function createReportAction(campaignId: string): Promise<ActionResult<{ id: string }>> {
  const res = await runAuthedAction(async () => {
    const report = await createReport(campaignId);
    return { id: report.id };
  });
  if (res.ok) {
    revalidatePath(`/campaigns/${campaignId}/reports`);
  }
  return res;
}

export async function saveReportSectionsAction(params: {
  reportId: string;
  campaignId: string;
  customSections: CustomSection[];
}): Promise<ActionResult<{ saved: true }>> {
  const res = await runAuthedAction(async () => {
    const report = await updateReportCustomSections(params.reportId, params.customSections);
    if (!report) throw new Error("not found");
    return { saved: true as const };
  });
  if (!res.ok) return fail(res.error);
  revalidatePath(`/campaigns/${params.campaignId}/reports/${params.reportId}`);
  return res;
}
