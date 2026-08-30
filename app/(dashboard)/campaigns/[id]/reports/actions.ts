"use server";

import { createReport, updateReportCustomSections } from "@/lib/db";
import { CustomSection } from "@/lib/db/types";
import { revalidatePath } from "next/cache";

export async function createReportAction(campaignId: string) {
  const report = await createReport(campaignId);
  revalidatePath(`/campaigns/${campaignId}/reports`);
  return { success: true, report };
}

export async function saveReportSectionsAction(params: {
  reportId: string;
  campaignId: string;
  customSections: CustomSection[];
}) {
  const report = await updateReportCustomSections(
    params.reportId,
    params.customSections
  );
  revalidatePath(`/campaigns/${params.campaignId}/reports/${params.reportId}`);
  return { success: true, report };
}