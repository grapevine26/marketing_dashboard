"use server";

// 규칙: 액션 본문 첫 문장은 `return runAuthedAction(...)`. 존재 확인·DB 조회를 그 앞에서 하면 인증 전에 실행된다.

import {
  createReport,
  deleteReport,
  renameReport,
  updateReportCustomSections,
  ValidationError,
} from "@/lib/db";
import { CustomSection } from "@/lib/db/types";
import { countEmojiForPdf } from "@/lib/reports/pdf";
import { revalidatePath } from "next/cache";
import { ActionResult, runAuthedAction } from "@/lib/actions/result";

const NOT_FOUND = "보고서가 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.";

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
  /** 화면이 보고서를 불러올 때 받은 기준 시각. 그 사이 남이 저장했으면 거부된다. */
  expectedUpdatedAt?: string | null;
}): Promise<ActionResult<{ saved: true; updatedAt: string; pdfEmojiCount: number }>> {
  return runAuthedAction(async () => {
    const report = await updateReportCustomSections(
      params.reportId,
      params.customSections,
      params.expectedUpdatedAt
    );
    if (!report) throw new ValidationError(NOT_FOUND);
    revalidatePath(`/campaigns/${params.campaignId}/reports/${params.reportId}`);
    // 저장에 성공했으면 기준 시각도 새 값으로 옮겨야 한다. 안 그러면 **연달아 저장할 때
    // 자기 자신과 충돌**한다.
    //
    // 이모지 개수를 함께 돌려주는 이유 — PDF 글꼴에 이모지 글리프가 없어 **빈칸으로 나간다**
    // (lib/reports/pdf.ts). 알릴 곳으로 가장 이른 순간이 여기다: 방금 쓴 사람이 화면 앞에 있고,
    // 고칠지 그냥 둘지 지금 정할 수 있다. 다운로드 순간에는 응답이 파일이라 말을 붙일 자리가 없다.
    // 판정은 PDF 모듈 한 곳에만 둔다 — 화면에 규칙을 따로 적으면 한쪽만 바뀌는 날이 온다.
    return {
      saved: true as const,
      updatedAt: report.updated_at,
      pdfEmojiCount: report.custom_sections.reduce(
        (n, s) => n + countEmojiForPdf(s.title) + countEmojiForPdf(s.content),
        0
      ),
    };
  });
}

/**
 * 보고서 제목 변경.
 *
 * `expectedUpdatedAt` 은 총평 저장과 **같은 기준 시각**이다. 둘은 같은 행을 고치므로 따로 놀면
 * 제목 변경이 총평 잠금을 풀어 주는 구멍이 된다(lib/db/reports.ts 의 renameReport 주석).
 * 성공하면 새 기준 시각을 돌려주고, 화면은 그것을 공유 상태에 넣는다(ReportLock.tsx).
 */
export async function renameReportAction(params: {
  reportId: string;
  campaignId: string;
  title: string;
  expectedUpdatedAt?: string | null;
}): Promise<ActionResult<{ title: string; updatedAt: string }>> {
  return runAuthedAction(async () => {
    const report = await renameReport(params.reportId, params.title, params.expectedUpdatedAt);
    if (!report) throw new ValidationError(NOT_FOUND);
    revalidatePath(`/campaigns/${params.campaignId}/reports`);
    revalidatePath(`/campaigns/${params.campaignId}/reports/${params.reportId}`);
    return { title: report.title, updatedAt: report.updated_at };
  });
}

/**
 * 보고서 삭제. 되돌릴 수 없다 — 확인은 화면에서 받는다(체크리스트 삭제와 같은 `confirm`).
 *
 * 잠금을 걸지 않는다. 남이 총평을 고치는 중이었대도 "지운다" 는 뜻은 달라지지 않고,
 * 기준 시각이 어긋난다고 삭제를 막으면 **지울 방법이 없던 문제로 되돌아간다.**
 */
export async function deleteReportAction(params: {
  reportId: string;
  campaignId: string;
}): Promise<ActionResult<null>> {
  return runAuthedAction(async () => {
    const deleted = await deleteReport(params.reportId);
    if (!deleted) throw new ValidationError(NOT_FOUND);
    revalidatePath(`/campaigns/${params.campaignId}/reports`);
    return null;
  });
}
