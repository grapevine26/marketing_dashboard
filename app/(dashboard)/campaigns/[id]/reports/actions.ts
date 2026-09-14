"use server";

// 규칙: 액션 본문 첫 문장은 `return runAuthedAction(...)`. 존재 확인·DB 조회를 그 앞에서 하면 인증 전에 실행된다.

import { createReport, updateReportCustomSections, ValidationError } from "@/lib/db";
import { CustomSection } from "@/lib/db/types";
import { revalidatePath } from "next/cache";
import { ActionResult, runAuthedAction } from "@/lib/actions/result";

export async function createReportAction(campaignId: string): Promise<ActionResult<{ id: string }>> {
  return runAuthedAction(async () => {
    const report = await createReport(campaignId);
    revalidatePath(`/campaigns/${campaignId}/reports`);
    return { id: report.id };
  });
}

export async function saveReportSectionsAction(params: {
  reportId: string;
  campaignId: string;
  customSections: CustomSection[];
}): Promise<ActionResult<{ saved: true }>> {
  return runAuthedAction(async () => {
    const report = await updateReportCustomSections(params.reportId, params.customSections);
    if (!report) throw new ValidationError("보고서가 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.");
    revalidatePath(`/campaigns/${params.campaignId}/reports/${params.reportId}`);
    return { saved: true as const };
  });
}
